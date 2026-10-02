"""Procedural build of the low-poly amateur footballer (Légendes du Dimanche, D-039).

Run inside Blender (5.x):  exec(open("<repo>/assets-src/blender/build_footballer.py").read())
then call build() — it (re)creates the `Footballer` object in the current scene.

Conventions (match the Mixamo Y Bot so the 28 animations retarget cleanly):
metres, Z up, ground at z = 0, the character faces -Y, its left side is +X,
T-pose with arms along ±X at shoulder height, palms down.

Every piece is a loft of cross-section rings. Rings wind counter-clockwise around
the loft direction D, so normals point outwards; a ring that goes back on itself
(hem lips) automatically faces inwards. Hidden skin is never built: the shirt is
the torso, arms start inside the sleeves, legs end inside the socks.
"""

import math

import bmesh
import bpy
from mathutils import Vector

TAU = 2 * math.pi

# Slot order is part of the contract with packages/render3d (material zones).
MATERIALS = (
    "kit_shirt",
    "kit_sleeves",
    "kit_collar",
    "kit_shorts",
    "kit_socks",
    "kit_socks_cuff",
    "kit_boots",
    "skin",
    "skin_forearms",
    "hands",
    "hair",
)
MAT_INDEX = {name: i for i, name in enumerate(MATERIALS)}

# Preview colours only (the game recolours every slot from the club's KitSpec).
PREVIEW_COLORS = {
    "kit_shirt": (0.06, 0.20, 0.62),
    "kit_sleeves": (0.06, 0.20, 0.62),
    "kit_collar": (0.92, 0.92, 0.90),
    "kit_shorts": (0.92, 0.92, 0.90),
    "kit_socks": (0.06, 0.20, 0.62),
    "kit_socks_cuff": (0.92, 0.92, 0.90),
    "kit_boots": (0.03, 0.03, 0.035),
    "skin": (0.62, 0.40, 0.27),
    "skin_forearms": (0.62, 0.40, 0.27),
    "hands": (0.62, 0.40, 0.27),
    "hair": (0.10, 0.065, 0.04),
}

# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------


def spow(x, e):
    return math.copysign(abs(x) ** e, x)


def uniform(n, offset=0.0):
    return [offset + TAU * j / n for j in range(n)]


def frame(d, u):
    d = Vector(d).normalized()
    u = Vector(u)
    u = (u - d * u.dot(d)).normalized()
    return d, u, d.cross(u)


def ring_pts(center, d, u, thetas, rf, rb, rs, rs2=None, p=2.4, floor=None):
    """Superellipse cross-section. t = 0 points along U (front), t = 90° along V = D × U.

    rf / rb: radius on the +U / -U side; rs / rs2: radius on the +V / -V side.
    floor clamps the -U side (flat shoe soles).
    """
    d, u, v = frame(d, u)
    center = Vector(center)
    e = 2.0 / p
    out = []
    for t in thetas:
        c, s = math.cos(t), math.sin(t)
        a = (rf if c >= 0 else rb) * spow(c, e)
        b = (rs if (s >= 0 or rs2 is None) else rs2) * spow(s, e)
        if floor is not None:
            a = max(a, floor)
        out.append(center + u * a + v * b)
    return out


def side_radii(down, up, side):
    """(rs, rs2) for a loft along ±X with U = -Y: V is -Z on the left, +Z on the right."""
    return (down, up) if side > 0 else (up, down)


def lerp(a, b, w):
    return a + (b - a) * w


class Builder:
    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.islands = []

    def new_island(self):
        self.islands.append([])
        return len(self.islands) - 1

    def verts(self, pts):
        return [self.bm.verts.new(Vector(p)) for p in pts]

    def face(self, vs, uvs, mat, island):
        f = self.bm.faces.new(vs)
        f.material_index = MAT_INDEX[mat]
        f.smooth = True
        for loop, uv in zip(f.loops, uvs):
            loop[self.uv].uv = uv
        self.islands[island].append(f)
        return f

    def loft(self, rings, mats, seams=(0,)):
        """Quad strips between consecutive rings (closed loops of equal length).

        mats: one material per segment, or f(i, j) -> material | None (None = hole).
        seams: ring indices where the UV map is cut; each span becomes one upright island
        (u = arc length along the ring, centred; v = mean distance between rings). Rows are
        horizontal, so every quad maps to a trapezoid: no fold or overlap by construction.
        """
        n = len(rings[0])
        assert all(len(r) == n for r in rings), [len(r) for r in rings]
        row = [0.0]
        for i in range(1, len(rings)):
            row.append(row[-1] + sum((rings[i][j].co - rings[i - 1][j].co).length for j in range(n)) / n)
        v = [[r] * n for r in row]
        seams = sorted(s % n for s in seams)
        spans = []
        for k, s in enumerate(seams):
            e = seams[(k + 1) % len(seams)]
            span = (e - s) % n or n
            us = []
            for ring in rings:
                acc = [0.0]
                for st in range(span):
                    acc.append(acc[-1] + (ring[(s + st + 1) % n].co - ring[(s + st) % n].co).length)
                us.append([a - acc[-1] / 2 for a in acc])
            spans.append((s, span, us, self.new_island()))
        for i in range(len(rings) - 1):
            for s, span, us, isl in spans:
                for st in range(span):
                    j = (s + st) % n
                    j1 = (j + 1) % n
                    mat = mats(i, j) if callable(mats) else mats[i]
                    if mat is None:
                        continue
                    a, b, c, dd = rings[i][j], rings[i][j1], rings[i + 1][j1], rings[i + 1][j]
                    self.face(
                        [a, b, c, dd],
                        [
                            (us[i][st], v[i][j]),
                            (us[i][st + 1], v[i][j1]),
                            (us[i + 1][st + 1], v[i + 1][j1]),
                            (us[i + 1][st], v[i + 1][j]),
                        ],
                        mat,
                        isl,
                    )

    def cap(self, ring, tip, mat, d, u, end=True):
        """Triangle fan closing a ring on a pole. end=True caps the +D end."""
        d, u, v = frame(d, u)
        tip_v = self.bm.verts.new(Vector(tip))
        isl = self.new_island()
        sgn = 1.0 if end else -1.0

        def uv_of(p):
            off = p - tip_v.co
            return (sgn * off.dot(u), off.dot(v))

        n = len(ring)
        # The pole maps to the ring's centroid, so an off-centre tip never flips a triangle.
        uvs = [uv_of(x.co) for x in ring]
        mid = (sum(p[0] for p in uvs) / n, sum(p[1] for p in uvs) / n)
        for j in range(n):
            a, b = ring[j], ring[(j + 1) % n]
            if end:
                self.face([a, b, tip_v], [uvs[j], uvs[(j + 1) % n], mid], mat, isl)
            else:
                self.face([b, a, tip_v], [uvs[(j + 1) % n], uvs[j], mid], mat, isl)
        return tip_v

    def pack(self, margin=0.004):
        """Deterministic shelf packing of upright islands into the unit square (no rotation)."""
        boxes = []
        for isl, faces in enumerate(self.islands):
            if not faces:
                continue
            us = [lp[self.uv].uv.x for f in faces for lp in f.loops]
            vs = [lp[self.uv].uv.y for f in faces for lp in f.loops]
            boxes.append((isl, min(us), min(vs), max(us) - min(us), max(vs) - min(vs)))
        boxes.sort(key=lambda b: (-b[4], -b[3], b[0]))

        def place(scale):
            x = y = shelf = 0.0
            pos = {}
            for isl, _u0, _v0, w, h in boxes:
                w2, h2 = w * scale, h * scale
                if w2 + 2 * margin > 1.0:
                    return None
                if x + w2 + 2 * margin > 1.0:
                    x, y, shelf = 0.0, y + shelf + margin, 0.0
                pos[isl] = (x + margin, y + margin)
                x += w2 + margin
                shelf = max(shelf, h2)
            return pos if y + shelf + 2 * margin <= 1.0 else None

        lo, hi = 0.01, 10.0
        for _ in range(50):
            mid = (lo + hi) / 2
            if place(mid):
                lo = mid
            else:
                hi = mid
        pos = place(lo)
        for isl, u0, v0, _w, _h in boxes:
            px, py = pos[isl]
            for f in self.islands[isl]:
                for lp in f.loops:
                    uv = lp[self.uv].uv
                    lp[self.uv].uv = ((uv.x - u0) * lo + px, (uv.y - v0) * lo + py)
        return lo


def sort_loop(verts, center, d, u):
    d, u, v = frame(d, u)
    center = Vector(center)

    def ang(vert):
        off = vert.co - center
        return math.atan2(off.dot(v), off.dot(u)) % TAU

    ordered = sorted(verts, key=ang)
    return ordered, [ang(x) for x in ordered]


def blended_ring(b, boundary, old_center, new_center, d, u, thetas_b, w_shape, w_angle, **shape):
    """Ring morphing from a boundary loop (projected on a new plane) to a superellipse."""
    n = len(boundary)
    t0 = thetas_b[0]
    thetas = [lerp(tb, t0 + TAU * i / n, w_angle) for i, tb in enumerate(thetas_b)]
    target = ring_pts(new_center, d, u, thetas, **shape)
    dd, uu, vv = frame(d, u)
    pts = []
    for vert, tgt in zip(boundary, target):
        off = vert.co - Vector(old_center)
        projected = Vector(new_center) + uu * off.dot(uu) + vv * off.dot(vv)
        pts.append(projected.lerp(tgt, w_shape))
    return b.verts(pts)


# ---------------------------------------------------------------------------
# Body proportions (from the Mixamo Y Bot rest pose: hips 1.00, shoulders 1.436,
# neck 1.50, elbows x 0.462, wrists x 0.738, knees 0.525, ankles 0.105)
# ---------------------------------------------------------------------------

UP, DOWN, FRONT = (0, 0, 1), (0, 0, -1), (0, -1, 0)

N_SHIRT = 32
SHIRT_RINGS = [  # z, rx, y front, y back, y centre
    (0.945, 0.168, 0.118, 0.122, 0.006),  # 0 inner hem lip
    (0.900, 0.193, 0.140, 0.146, 0.008),  # 1 hem
    (0.960, 0.186, 0.133, 0.139, 0.008),
    (1.060, 0.179, 0.128, 0.130, 0.010),
    (1.160, 0.178, 0.131, 0.126, 0.012),
    (1.260, 0.182, 0.137, 0.125, 0.016),
    (1.355, 0.185, 0.135, 0.125, 0.020),  # 6 armpit
    (1.400, 0.186, 0.131, 0.123, 0.022),
    (1.450, 0.185, 0.123, 0.119, 0.025),
    (1.495, 0.179, 0.111, 0.111, 0.027),  # 9 shoulder line
    (1.520, 0.146, 0.096, 0.096, 0.029),
    (1.538, 0.101, 0.079, 0.076, 0.030),
    (1.548, 0.073, 0.067, 0.063, 0.030),  # 12 neckline
    (1.568, 0.067, 0.063, 0.059, 0.030),  # 13 collar top
    (1.552, 0.052, 0.050, 0.053, 0.030),  # 14 collar inner lip, closes on the neck
]
ARMPIT, SHOULDER, NECKLINE = 6, 9, 12
ARMHOLE_HALF = 3  # armhole spans 2 * 3 ring segments around each side

N_SHORTS = 24
SHORTS_RINGS = [  # z, rx, y front, y back, y centre — crotch ring first
    (0.800, 0.190, 0.118, 0.132, 0.000),
    (0.870, 0.190, 0.121, 0.138, 0.000),
    (0.950, 0.178, 0.117, 0.128, 0.002),
    (1.010, 0.168, 0.111, 0.118, 0.004),
]
CROTCH = [(0.0, -0.060, 0.788), (0.0, 0.000, 0.782), (0.0, 0.065, 0.788)]

LEG_RINGS = [  # z, x, y, side radius, front, back — bottom (inside the sock) to top (inside the shorts)
    (0.440, 0.094, 0.012, 0.048, 0.048, 0.056),
    (0.475, 0.095, 0.010, 0.050, 0.051, 0.057),
    (0.525, 0.096, 0.006, 0.053, 0.057, 0.054),
    (0.600, 0.098, 0.002, 0.061, 0.066, 0.068),
    (0.700, 0.100, 0.000, 0.069, 0.077, 0.082),
    (0.780, 0.100, 0.000, 0.075, 0.081, 0.087),
]

SOCK_RINGS = [  # z, x, y, side, front, back, material of the segment above
    (0.060, 0.093, 0.030, 0.037, 0.041, 0.041, "kit_socks"),
    (0.120, 0.092, 0.026, 0.038, 0.040, 0.044, "kit_socks"),
    (0.200, 0.093, 0.022, 0.043, 0.044, 0.052, "kit_socks"),
    (0.300, 0.094, 0.020, 0.050, 0.048, 0.065, "kit_socks"),
    (0.400, 0.094, 0.016, 0.049, 0.049, 0.059, "kit_socks"),
    (0.428, 0.094, 0.015, 0.050, 0.050, 0.059, "kit_socks_cuff"),
    (0.432, 0.094, 0.015, 0.058, 0.058, 0.066, "kit_socks_cuff"),  # turn-down cuff
    (0.482, 0.094, 0.013, 0.057, 0.057, 0.063, "kit_socks_cuff"),
    (0.476, 0.094, 0.012, 0.046, 0.047, 0.053, None),  # lip, tucked into the leg
]

BOOT_STATIONS = [  # y, z centre, top, bottom, half width — heel to toe
    (0.088, 0.072, 0.035, 0.052, 0.032),
    (0.072, 0.074, 0.058, 0.054, 0.044),
    (0.030, 0.074, 0.062, 0.054, 0.049),
    (-0.030, 0.064, 0.046, 0.044, 0.051),
    (-0.090, 0.050, 0.032, 0.030, 0.054),
    (-0.150, 0.045, 0.026, 0.025, 0.050),
    (-0.190, 0.042, 0.021, 0.022, 0.040),
]
BOOT_X = 0.093
SOLE_TOP, SOLE_BOTTOM = 0.022, 0.008
STUDS = [(-0.022, 0.060), (0.022, 0.060), (-0.028, -0.045), (0.028, -0.045), (-0.030, -0.125), (0.030, -0.125)]

HEAD_RINGS = [  # z, side, front, back, y centre
    (1.500, 0.054, 0.053, 0.055, 0.032),  # neck, inside the collar
    (1.575, 0.054, 0.051, 0.055, 0.028),
    (1.603, 0.063, 0.068, 0.061, 0.016),
    (1.628, 0.073, 0.088, 0.073, 0.006),  # jaw
    (1.665, 0.078, 0.102, 0.088, 0.000),
    (1.705, 0.081, 0.104, 0.096, 0.000),
    (1.745, 0.078, 0.098, 0.095, 0.002),
    (1.772, 0.066, 0.082, 0.082, 0.004),
    (1.786, 0.044, 0.056, 0.056, 0.004),
]
HEAD_TOP = 1.792
HEAD_P = 2.2

ARM_RINGS = [  # x, y, z, front, back, down, up, material of the segment above
    (0.235, 0.052, 1.436, 0.048, 0.048, 0.048, 0.048, "skin_forearms"),  # inside the sleeve
    (0.300, 0.055, 1.436, 0.047, 0.047, 0.046, 0.046, "skin_forearms"),
    (0.380, 0.058, 1.436, 0.045, 0.046, 0.043, 0.043, "skin_forearms"),
    (0.462, 0.060, 1.436, 0.040, 0.042, 0.038, 0.038, "skin_forearms"),  # elbow
    (0.530, 0.060, 1.436, 0.043, 0.042, 0.040, 0.040, "skin_forearms"),
    (0.630, 0.061, 1.436, 0.037, 0.036, 0.032, 0.032, "skin_forearms"),
    (0.725, 0.062, 1.436, 0.030, 0.030, 0.023, 0.023, "hands"),  # wrist
    (0.765, 0.068, 1.434, 0.041, 0.041, 0.022, 0.022, "hands"),
    (0.820, 0.070, 1.435, 0.046, 0.046, 0.019, 0.019, "hands"),
    (0.858, 0.070, 1.436, 0.047, 0.047, 0.016, 0.016, None),  # knuckles
]
HAND_TIP = (0.869, 0.070, 1.436)

FINGERS = {  # joint chain (Y Bot finger bones, slightly spread for clean separation), radius
    "index": ([(0.860, 0.031, 1.433), (0.899, 0.031, 1.433), (0.934, 0.031, 1.433), (0.964, 0.031, 1.433), (0.995, 0.031, 1.433)], 0.0095),
    "middle": ([(0.866, 0.058, 1.436), (0.902, 0.058, 1.436), (0.936, 0.058, 1.436), (0.973, 0.058, 1.436), (1.008, 0.058, 1.436)], 0.0094),
    "ring": ([(0.859, 0.084, 1.436), (0.895, 0.084, 1.436), (0.928, 0.084, 1.436), (0.965, 0.084, 1.436), (1.000, 0.084, 1.436)], 0.0088),
    "pinky": ([(0.847, 0.108, 1.433), (0.888, 0.108, 1.433), (0.914, 0.108, 1.433), (0.943, 0.108, 1.433), (0.972, 0.108, 1.433)], 0.0078),
    "thumb": ([(0.776, 0.034, 1.416), (0.812, 0.012, 1.395), (0.846, -0.007, 1.375), (0.873, -0.023, 1.360), (0.896, -0.041, 1.345)], 0.0128),
}

# ---------------------------------------------------------------------------
# Pieces
# ---------------------------------------------------------------------------


def torso_ring(z, rx, yf, yb, cy, n, p=2.6):
    return ring_pts((0, cy, z), UP, FRONT, uniform(n), yf, yb, rx, p=p)


def build_shirt(b):
    n = N_SHIRT
    rings = []
    for i, (z, rx, yf, yb, cy) in enumerate(SHIRT_RINGS):
        pts = torso_ring(z, rx, yf, yb, cy, n)
        if i == 1:  # the hem floats a little
            for j, pt in enumerate(pts):
                t = TAU * j / n
                pt.z += 0.007 * math.sin(3 * t + 0.6) + 0.004 * math.sin(5 * t + 1.9)
        rings.append(b.verts(pts))

    q = n // 4
    holes = {1: range(q - ARMHOLE_HALF, q + ARMHOLE_HALF), -1: range(3 * q - ARMHOLE_HALF, 3 * q + ARMHOLE_HALF)}

    def mat(i, j):
        if ARMPIT <= i < SHOULDER and any(j in h for h in holes.values()):
            return None
        return "kit_collar" if i >= NECKLINE else "kit_shirt"

    # Front and back panels as two upright islands (seams down the sides).
    b.loft(rings, mat, seams=(q, 3 * q))

    for side, hole in holes.items():
        js = list(hole) + [hole[-1] + 1]
        loop = [rings[ARMPIT][j] for j in js] + [rings[SHOULDER][j] for j in js]
        loop += [rings[i][js[0]] for i in range(ARMPIT + 1, SHOULDER)]
        loop += [rings[i][js[-1]] for i in range(ARMPIT + 1, SHOULDER)]
        build_sleeve(b, loop, side)


def build_sleeve(b, armhole, side):
    d = (side, 0, 0)
    old_center = (side * 0.17, 0.022, 1.425)
    boundary, thetas = sort_loop(armhole, old_center, d, FRONT)
    rings = [boundary]
    specs = [  # x, y, z, front, back, down, up, shape blend
        (0.215, 0.045, 1.428, 0.073, 0.073, 0.074, 0.067, 0.55),
        (0.270, 0.050, 1.430, 0.071, 0.071, 0.075, 0.066, 1.0),
        (0.335, 0.050, 1.427, 0.073, 0.073, 0.079, 0.066, 1.0),  # hem, droops a little
        (0.290, 0.055, 1.436, 0.045, 0.045, 0.044, 0.044, 1.0),  # inner lip, closes on the arm
    ]
    for x, y, z, rf, rb, down, up, w in specs:
        rs, rs2 = side_radii(down, up, side)
        rings.append(
            blended_ring(b, boundary, old_center, (side * x, y, z), d, FRONT, thetas, w, w,
                         rf=rf, rb=rb, rs=rs, rs2=rs2, p=2.2)
        )
    b.loft(rings, ["kit_sleeves"] * (len(rings) - 1))


def build_shorts(b):
    n = N_SHORTS
    rings = [b.verts(torso_ring(z, rx, yf, yb, cy, n, p=2.4)) for z, rx, yf, yb, cy in SHORTS_RINGS]
    b.loft(rings, ["kit_shorts"] * (len(rings) - 1), seams=(n // 4, 3 * n // 4))
    crotch = b.verts(CROTCH)
    split = rings[0]
    halves = {1: split[0 : n // 2 + 1], -1: split[n // 2 :] + [split[0]]}
    for side, half in halves.items():
        center = (side * 0.108, -0.004, 0.79)
        boundary, thetas = sort_loop(half + crotch, center, UP, FRONT)
        specs = [  # z, x, y, front, back, side radius, shape blend
            (0.700, 0.100, 0.000, 0.074, 0.079, 0.066, 1.0),  # inner lip, closes on the thigh
            (0.655, 0.108, -0.004, 0.108, 0.114, 0.102, 1.0),  # flared hem
            (0.720, 0.106, -0.003, 0.104, 0.112, 0.100, 1.0),
            (0.765, 0.106, -0.003, 0.100, 0.115, 0.098, 0.5),
        ]
        leg = []
        for k, (z, x, y, rf, rb, rs, w) in enumerate(specs):
            ring = blended_ring(b, boundary, center, (side * x, y, z), UP, FRONT, thetas, w, w,
                                rf=rf, rb=rb, rs=rs, p=2.2)
            if k == 1:  # hem slightly higher at the front
                n_leg = len(ring)
                for i, vert in enumerate(ring):
                    vert.co.z += 0.010 * math.cos(thetas[0] + TAU * i / n_leg)
            leg.append(ring)
        leg.append(boundary)
        b.loft(leg, ["kit_shorts"] * (len(leg) - 1))


def build_leg(b, side):
    rings = [
        b.verts(ring_pts((side * x, y, z), UP, FRONT, uniform(12), rf, rb, rs, p=2.2))
        for z, x, y, rs, rf, rb in LEG_RINGS
    ]
    b.loft(rings, ["skin"] * (len(rings) - 1))


def build_sock(b, side):
    rings = [
        b.verts(ring_pts((side * x, y, z), UP, FRONT, uniform(12), rf, rb, rs, p=2.2))
        for z, x, y, rs, rf, rb, _m in SOCK_RINGS
    ]
    b.loft(rings, [m for *_r, m in SOCK_RINGS[:-1]])


def build_boot(b, side):
    d, u = (0, -1, 0), UP
    x = side * BOOT_X
    upper = [
        b.verts(ring_pts((x, y, zc), d, u, uniform(12), top, bot, w, p=2.8, floor=-(zc - SOLE_TOP)))
        for y, zc, top, bot, w in BOOT_STATIONS
    ]
    b.loft(upper, ["kit_boots"] * (len(upper) - 1))
    b.cap(upper[0], (x, 0.097, 0.068), "kit_boots", d, u, end=False)
    b.cap(upper[-1], (x, -0.212, 0.040), "kit_boots", d, u, end=True)

    zc, half = (SOLE_TOP + SOLE_BOTTOM) / 2, (SOLE_TOP - SOLE_BOTTOM) / 2
    sole = [
        b.verts(ring_pts((x, y, zc), d, u, uniform(8, TAU / 16), half, half, w + 0.005, p=6))
        for y, _zc, _t, _b, w in BOOT_STATIONS
    ]
    b.loft(sole, ["kit_boots"] * (len(sole) - 1))
    b.cap(sole[0], (x, 0.099, zc), "kit_boots", d, u, end=False)
    b.cap(sole[-1], (x, -0.216, zc), "kit_boots", d, u, end=True)

    for dx, y in STUDS:
        cx = x + side * dx
        top = b.verts(ring_pts((cx, y, SOLE_BOTTOM + 0.002), DOWN, FRONT, uniform(6), 0.0085, 0.0085, 0.0085))
        bottom = b.verts(ring_pts((cx, y, 0.0015), DOWN, FRONT, uniform(6), 0.0058, 0.0058, 0.0058))
        b.loft([top, bottom], ["kit_boots"])
        b.cap(bottom, (cx, y, 0.0), "kit_boots", DOWN, FRONT, end=True)


def head_at(z):
    """Interpolated head cross-section (side, front, back, y centre) at height z."""
    rows = HEAD_RINGS
    if z >= rows[-1][0]:
        k = math.sqrt(max(0.0, (HEAD_TOP - z) / (HEAD_TOP - rows[-1][0])))
        _z, s, f, bk, cy = rows[-1]
        return s * k, f * k, bk * k, cy
    for lo, hi in zip(rows, rows[1:]):
        if lo[0] <= z <= hi[0]:
            w = (z - lo[0]) / (hi[0] - lo[0])
            return tuple(lerp(a, c, w) for a, c in zip(lo[1:], hi[1:]))
    return rows[0][1:]


def build_head(b):
    n = 16
    rings = [b.verts(ring_pts((0, cy, z), UP, FRONT, uniform(n), rf, rb, rs, p=HEAD_P)) for z, rs, rf, rb, cy in HEAD_RINGS]
    b.loft(rings, ["skin"] * (len(rings) - 1), seams=(n // 2,))
    b.cap(rings[-1], (0, 0.004, HEAD_TOP), "skin", UP, FRONT, end=True)

    # Discreet nose, so the head reads which way it faces.
    nose = b.verts(ring_pts((0, -0.097, 1.684), FRONT, UP, uniform(6), 0.020, 0.008, 0.014, p=2.0))
    b.cap(nose, (0, -0.116, 1.674), "skin", FRONT, UP, end=True)

    for side in (1, -1):
        d = (side, 0, 0)
        ear = []
        for x, y, z, rf, rb, down, up in [
            (0.066, 0.014, 1.690, 0.014, 0.014, 0.022, 0.024),
            (0.084, 0.016, 1.692, 0.016, 0.015, 0.026, 0.029),
            (0.093, 0.018, 1.694, 0.011, 0.012, 0.020, 0.023),
        ]:
            rs, rs2 = side_radii(down, up, side)
            ear.append(b.verts(ring_pts((side * x, y, z), d, FRONT, uniform(8), rf, rb, rs, rs2, p=2.0)))
        b.loft(ear, ["skin"] * 2)
        b.cap(ear[-1], (side * 0.097, 0.019, 1.695), "skin", d, FRONT, end=True)


def build_hair(b):
    """Short hair cap: separate shell over the skull, hairline lower at the back."""
    n = 16
    e = 2.0 / HEAD_P
    z_front, z_back = 1.745, 1.668

    def hair_ring(f, thickness, dz=0.0):
        pts = []
        for t in uniform(n):
            c, s = math.cos(t), math.sin(t)
            zh = z_back + (z_front - z_back) * (1 + c) / 2
            z = zh + (HEAD_TOP - zh) * f
            rs, rf, rb, cy = head_at(z)
            th = thickness + 0.004 * max(0.0, c) * (thickness > 0)  # a little volume over the forehead
            y = cy - ((rf if c >= 0 else rb) + th) * spow(c, e)
            pts.append(((rs + th) * spow(s, e), y, z + dz + th * f * f))
        return b.verts(pts)

    rings = [
        hair_ring(0.0, -0.004, 0.008),  # lip tucked against the skull
        hair_ring(0.0, 0.009),
        hair_ring(0.3, 0.011),
        hair_ring(0.6, 0.011),
        hair_ring(0.82, 0.011),
        hair_ring(0.94, 0.011),
    ]
    b.loft(rings, ["hair"] * (len(rings) - 1), seams=(n // 2,))
    b.cap(rings[-1], (0, 0.004, HEAD_TOP + 0.012), "hair", UP, FRONT, end=True)


def build_arm(b, side):
    d = (side, 0, 0)
    rings = []
    for x, y, z, rf, rb, down, up, _m in ARM_RINGS:
        rs, rs2 = side_radii(down, up, side)
        rings.append(b.verts(ring_pts((side * x, y, z), d, FRONT, uniform(10), rf, rb, rs, rs2, p=2.6)))
    b.loft(rings, [m for *_r, m in ARM_RINGS[:-1]])
    tip = (side * HAND_TIP[0], HAND_TIP[1], HAND_TIP[2])
    b.cap(rings[-1], tip, "hands", d, FRONT, end=True)

    for finger, (chain, radius) in FINGERS.items():
        pts = [Vector((side * x, y, z)) for x, y, z in chain]
        dirs = [(pts[k + 1] - pts[k]).normalized() for k in range(len(pts) - 1)]
        base = 1.35 if finger == "thumb" else 1.0  # fleshy thumb root
        centers = [
            (pts[0] - dirs[0] * 0.022, dirs[0], radius * base),  # root, buried in the palm
            (pts[0] + dirs[0] * 0.004, dirs[0], radius * base),
            (pts[1], (dirs[0] + dirs[1]).normalized(), radius * 0.97),
            (pts[2], (dirs[1] + dirs[2]).normalized(), radius * 0.93),
            (pts[3], (dirs[2] + dirs[3]).normalized(), radius * 0.9),
            (pts[3].lerp(pts[4], 0.75), dirs[3], radius * 0.85),
            (pts[3].lerp(pts[4], 0.97), dirs[3], radius * 0.6),  # rounded tip
        ]
        rings = [
            b.verts(ring_pts(c, dd, FRONT, uniform(6, TAU / 12), r, r, r * 0.82, p=2.0))
            for c, dd, r in centers
        ]
        b.loft(rings, ["hands"] * (len(rings) - 1))
        b.cap(rings[-1], pts[4] + dirs[3] * 0.002, "hands", dirs[3], FRONT, end=True)


# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------


def ensure_materials():
    mats = []
    for name in MATERIALS:
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        rgb = PREVIEW_COLORS[name]
        mat.diffuse_color = (*rgb, 1.0)
        mat.use_backface_culling = True  # like Three.js FrontSide: holes would show
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
            bsdf.inputs["Roughness"].default_value = 0.85 if name.startswith("kit_") else 0.6
        mats.append(mat)
    return mats


def build(name="Footballer", collection=None):
    b = Builder()
    build_shirt(b)
    build_shorts(b)
    for side in (1, -1):
        build_leg(b, side)
        build_sock(b, side)
        build_boot(b, side)
        build_arm(b, side)
    build_head(b)
    build_hair(b)

    scale = b.pack()
    bm = b.bm
    bm.normal_update()
    sharp = math.radians(55)
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > sharp:
            e.smooth = False

    old = bpy.data.objects.get(name)
    if old:
        old_mesh = old.data
        bpy.data.objects.remove(old)
        if old_mesh and old_mesh.users == 0:
            bpy.data.meshes.remove(old_mesh)
    # Backup of the material zones, in case a tool along the way (Mixamo) renames materials:
    # second UV map, u = (slot + 0.5) / slot count.
    zone = bm.loops.layers.uv.new("zone")
    for f in bm.faces:
        u = (f.material_index + 0.5) / len(MATERIALS)
        for lp in f.loops:
            lp[zone].uv = (u, 0.5)

    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.uv_layers.active = me.uv_layers["UVMap"]
    me.uv_layers["UVMap"].active_render = True
    for mat in ensure_materials():
        me.materials.append(mat)
    obj = bpy.data.objects.new(name, me)
    (collection or bpy.context.scene.collection).objects.link(obj)

    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    per_mat = {}
    for p in me.polygons:
        key = MATERIALS[p.material_index]
        per_mat[key] = per_mat.get(key, 0) + len(p.vertices) - 2
    return {"object": obj.name, "triangles": tris, "vertices": len(me.vertices), "uv_scale": scale, "per_material": per_mat}
