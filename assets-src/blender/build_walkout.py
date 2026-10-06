"""Walkout animations of the footballer (pack opening, D-036 / D-039): out of the tunnel, a few
confident steps towards the camera, a stop, then a celebration that ends the reveal:

- "arms_crossed": arms crossed on the chest, chin up;
- "crest": the right hand comes flat onto the crest, two pats, chin up;
- "thumbs_back": he turns his back to the camera and points both thumbs at the name on his
  back, with a glance over the shoulder.

Run inside Blender (5.x):
    exec(open("<repo>/assets-src/blender/build_walkout.py").read())
    for v in VARIANTS: rig = build(v); bake(rig, v); export(rig, v)

The keys are authored on a temporary control rig — IK targets for the feet (planted on the
ground, so they never slide) and the wrists, rotations for the hips, spine, head, wrists and
fingers — then baked onto the Mixamo bones, whose rest pose is the game's: the exported clips
play on the game's skeleton like the 28 Mixamo clips (convert-mixamo.mjs strips the forward
travel, the engine moves the player). Blender world: metres, Z up, the character first faces -Y.

The rigged character and the exported clips derive from Mixamo: they stay out of git
(assets-src/mixamo/). This script is ours and is versioned.
"""

import math

import bpy
from mathutils import Quaternion, Vector

REPO = "/Users/lucassouton/Dev/Websites/main-courante/"
CHARACTER = REPO + "assets-src/mixamo/character_footballer.fbx"
VARIANTS = ("arms_crossed", "crest", "thumbs_back")


def out_fbx(variant):
    return REPO + f"assets-src/mixamo/walkout_{variant}.fbx"


# ─── Feel (frames at 30 fps, metres, degrees) ─────────────────────────────────────────────────
FPS = 30
STEP_FRAMES = 15  # one step (half a stride)
STEP = 0.56  # step length
WALK_STEPS = 5  # steps before the stopping step
STOP_FRAMES = 18  # the last, shorter step that brings the feet together
FOOT_LIFT = 0.075
FOOT_WIDTH = 0.095  # half the gap between the feet while walking
STANCE_WIDTH = 0.13  # feet apart once stopped
HIPS_DROP = 0.05  # hips lower while walking than standing (the legs reach the planted feet)
HIPS_BOB = 0.014
HIPS_SWAY = 0.022
HIPS_YAW = 4.0
LEAN = 1.0  # forward lean of the chest while walking (upright: a confident walk)
ARM_SWING = 0.13  # wrists forward/back while walking
RELAXED_CURL = 15.0  # fingers while walking
BREATH = 1.4  # chest rise in the hold, degrees
HOLD_FRAMES = 60

# Per ending: frames from the stop to the start of the gesture, its length, chin, chest.
ENDINGS = {
    "arms_crossed": {"start": 8, "frames": 20, "chin": 9.0, "chest": 5.0},
    "crest": {"start": 6, "frames": 16, "chin": 7.0, "chest": 4.0},
    "thumbs_back": {"start": 32, "frames": 18, "chin": 3.0, "chest": 4.0},
}
TURN_START = 4  # thumbs_back: frames after the stop before turning around
TURN_FRAMES = 26
GLANCE = 38.0  # thumbs_back: head turned over the shoulder towards the camera
PATS = ((22, 6), (30, 6))  # crest: (frame after the hand lands, length) of each pat

LEFT, RIGHT = "Left", "Right"
P = "mixamorig:"


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


# ─── Timeline ─────────────────────────────────────────────────────────────────────────────────

WALK_END = 1 + WALK_STEPS * STEP_FRAMES
STOP_END = WALK_END + STOP_FRAMES
SPEED = STEP / STEP_FRAMES  # metres per frame
HIPS_STOP_FRAMES = 16


def pose_begin(variant):
    return STOP_END + ENDINGS[variant]["start"]


def pose_end(variant):
    return pose_begin(variant) + ENDINGS[variant]["frames"]


def last_frame(variant):
    return pose_end(variant) + HOLD_FRAMES


def swing_side(k):
    """Foot that swings during step k (the right foot starts)."""
    return RIGHT if k % 2 == 0 else LEFT


def hips_progress(f):
    """Distance travelled by the hips (forward): constant speed, then a stop over the feet."""
    if f <= WALK_END:
        return (f - 1 - 0.375 * STEP_FRAMES) * SPEED
    start = (WALK_END - 1 - 0.375 * STEP_FRAMES) * SPEED
    end = WALK_STEPS * STEP  # over the feet once they are together
    t = min(1.0, (f - WALK_END) / HIPS_STOP_FRAMES)
    # Cubic Hermite: leaves at walking speed, arrives at rest.
    h01 = -2 * t**3 + 3 * t**2
    h10 = t**3 - 2 * t**2 + t
    return start + h01 * (end - start) + h10 * SPEED * HIPS_STOP_FRAMES


def foot_state(side, f):
    """(forward s, lift z, pitch°, x) of a foot at frame f, before any turn."""
    sign = 1 if side == LEFT else -1
    # Planted positions: the left foot starts at 0, the right one a step behind.
    s = 0.0 if side == LEFT else -STEP
    lift = pitch = 0.0
    for k in range(WALK_STEPS + 1):
        f0 = 1 + k * STEP_FRAMES
        frames = STEP_FRAMES if k < WALK_STEPS else STOP_FRAMES
        if swing_side(k) != side:
            continue
        target = k * STEP + (STEP if k < WALK_STEPS else 0.0)
        swing = 0.75 * frames
        if f < f0:
            break
        if f >= f0 + swing:
            s = target
            continue
        u = (f - f0) / swing
        s = lerp(s, target, smooth(u))
        lift = FOOT_LIFT * math.sin(math.pi * smooth(u)) * (0.6 if k == WALK_STEPS else 1.0)
        # Heel off at the start, toes up just before the heel strikes.
        pitch = 20.0 * (1 - smooth(u * 3.0)) - 10.0 * math.sin(math.pi * max(0.0, (u - 0.55) / 0.45))
        break
    # Heel rises before the foot leaves the ground.
    for k in range(WALK_STEPS + 1):
        f0 = 1 + k * STEP_FRAMES
        if swing_side(k) == side and f0 - 4 <= f < f0:
            pitch = max(pitch, 20.0 * smooth((f - (f0 - 4)) / 4))
    width = FOOT_WIDTH if f < WALK_END else lerp(FOOT_WIDTH, STANCE_WIDTH, smooth((f - WALK_END) / STOP_FRAMES))
    return s, lift, pitch, sign * width


def turn(variant, f):
    """thumbs_back: (body heading, left foot turn, right foot turn, left lift, right lift)."""
    if variant != "thumbs_back":
        return 0.0, 0.0, 0.0, 0.0, 0.0
    u = (f - (STOP_END + TURN_START)) / TURN_FRAMES
    # Two small steps: the left foot turns in the first half, the right one in the second.
    ul, ur = max(0.0, min(1.0, u * 2)), max(0.0, min(1.0, u * 2 - 1))
    lift = lambda v: 0.05 * math.sin(math.pi * v) if 0 < v < 1 else 0.0  # noqa: E731
    return 180.0 * smooth(u), 180.0 * smooth(ul), 180.0 * smooth(ur), lift(ul), lift(ur)


# ─── Rig helpers ──────────────────────────────────────────────────────────────────────────────


def bone_world(rig, name):
    return rig.matrix_world @ rig.data.bones[name].head_local


def pose_world(rig, name):
    return rig.matrix_world @ rig.pose.bones[name].head


def local_axis(rig, name, world_axis):
    """A world direction expressed in the rest frame of a bone (for its rotation_quaternion)."""
    rest = (rig.matrix_world.to_3x3() @ rig.data.bones[name].matrix_local.to_3x3()).normalized()
    return (rest.inverted() @ Vector(world_axis)).normalized()


def world_rot(rig, name, *turns):
    """Quaternion of a pose bone: successive rotations about world axes (deg), at rest frame."""
    q = Quaternion()
    for axis, deg in turns:
        q = Quaternion(local_axis(rig, name, axis), math.radians(deg)) @ q
    return q


def empty(name, location, size=0.05):
    obj = bpy.data.objects.get(name) or bpy.data.objects.new(name, None)
    obj.empty_display_size = size
    obj.location = location
    obj.rotation_mode = "QUATERNION"
    if obj.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(obj)
    return obj


def add_ik(rig, bone, target, pole):
    pb = rig.pose.bones[bone]
    c = pb.constraints.new("IK")
    c.target = target
    c.pole_target = pole
    c.chain_count = 2
    c.use_stretch = False
    # Pole angle that keeps the rest pose (no twist of the knee or elbow).
    best = (1e9, 0.0)
    rest = (rig.matrix_world @ pb.bone.matrix_local).to_3x3().normalized()
    for deg in range(-180, 180, 5):
        c.pole_angle = math.radians(deg)
        bpy.context.view_layer.update()
        now = (rig.matrix_world @ pb.matrix).to_3x3().normalized()
        err = sum((now.col[i] - rest.col[i]).length for i in range(3))
        if err < best[0]:
            best = (err, deg)
    c.pole_angle = math.radians(best[1])
    return c


def curl_axis(rig, side, bone, tip):
    """Local axis of a finger bone that closes it towards the palm (palms face down at rest)."""
    pb = rig.pose.bones[f"{P}{side}Hand{bone}"]
    best = (-1e9, Vector((1, 0, 0)))
    for axis in (Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((-1, 0, 0)), Vector((0, 0, -1))):
        pb.rotation_quaternion = Quaternion(axis, math.radians(40))
        bpy.context.view_layer.update()
        drop = -pose_world(rig, f"{P}{side}Hand{tip}").z
        if drop > best[0]:
            best = (drop, axis.copy())
    pb.rotation_quaternion = Quaternion()
    bpy.context.view_layer.update()
    return best[1]


def search_wrist(rig, side, targets):
    """Wrist rotation (two local axes, ±80°) bringing the named bones closest to their points."""
    hand = rig.pose.bones[f"{P}{side}Hand"]
    best = (1e9, Quaternion())
    for ax in range(-80, 81, 10):
        for az in range(-80, 81, 10):
            q = Quaternion(Vector((0, 0, 1)), math.radians(az)) @ Quaternion(Vector((1, 0, 0)), math.radians(ax))
            hand.rotation_quaternion = q
            bpy.context.view_layer.update()
            err = sum((pose_world(rig, P + bone) - point).length for bone, point in targets)
            if err < best[0]:
                best = (err, q)
    hand.rotation_quaternion = Quaternion()
    bpy.context.view_layer.update()
    return best[1]


# ─── Build ────────────────────────────────────────────────────────────────────────────────────


def import_rig():
    scene = bpy.data.scenes.get("Walkout") or bpy.data.scenes.new("Walkout")
    bpy.context.window.scene = scene
    rig = scene.objects.get("WalkoutRig")
    if rig is None:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.fbx(filepath=CHARACTER, automatic_bone_orientation=False)
        new = [o for o in bpy.data.objects if o not in before]
        rig = next(o for o in new if o.type == "ARMATURE")
        rig.name = rig.data.name = "WalkoutRig"
        next(o for o in new if o.type == "MESH").name = "WalkoutBody"
    scene.render.fps = FPS
    return scene, rig


def build(variant="arms_crossed"):
    ending = ENDINGS[variant]
    scene, rig = import_rig()
    last = last_frame(variant)
    scene.frame_start, scene.frame_end = 1, last
    for pb in rig.pose.bones:
        for c in list(pb.constraints):
            pb.constraints.remove(c)
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
    if rig.animation_data:
        rig.animation_data.action = None
    for obj in [o for o in scene.objects if o.name.startswith("CTRL_")]:
        bpy.data.objects.remove(obj)
    scene.frame_set(1)
    bpy.context.view_layer.update()

    hips_rest = bone_world(rig, P + "Hips")
    shoulder_z = bone_world(rig, P + "LeftArm").z
    ankle = bone_world(rig, P + "LeftFoot")

    ctrl = {}
    for side in (LEFT, RIGHT):
        ctrl[f"foot{side}"] = empty(f"CTRL_foot_{side}", bone_world(rig, f"{P}{side}Foot"))
        ctrl[f"knee{side}"] = empty(f"CTRL_knee_{side}", bone_world(rig, f"{P}{side}Leg") + Vector((0, -0.6, 0)))
        ctrl[f"hand{side}"] = empty(f"CTRL_hand_{side}", bone_world(rig, f"{P}{side}Hand"))
        ctrl[f"elbow{side}"] = empty(f"CTRL_elbow_{side}", bone_world(rig, f"{P}{side}ForeArm") + Vector((0, 0.6, 0)))
        foot_rest = (rig.matrix_world @ rig.data.bones[f"{P}{side}Foot"].matrix_local).to_quaternion()
        ctrl[f"foot{side}"].rotation_quaternion = foot_rest
        ctrl[f"footRest{side}"] = foot_rest
        add_ik(rig, f"{P}{side}Leg", ctrl[f"foot{side}"], ctrl[f"knee{side}"])
        add_ik(rig, f"{P}{side}ForeArm", ctrl[f"hand{side}"], ctrl[f"elbow{side}"])
        rig.pose.bones[f"{P}{side}Foot"].constraints.new("COPY_ROTATION").target = ctrl[f"foot{side}"]

    fingers = {}
    for side in (LEFT, RIGHT):
        fingers[side] = {
            "curl": curl_axis(rig, side, "Index2", "Index3"),
            "thumb": curl_axis(rig, side, "Thumb2", "Thumb3"),
        }
    finger_bones = [
        b.name
        for b in rig.pose.bones
        if "Hand" in b.name and any(k in b.name for k in ("Index", "Middle", "Ring", "Pinky")) and not b.name.endswith("4")
    ]

    def key(obj, path, f):
        obj.keyframe_insert(path, frame=f)

    def body_point(center, heading, lx, lf, z):
        """A point in the body's frame: lx towards its left side, lf forward."""
        h = math.radians(heading)
        left = Vector((math.cos(h), math.sin(h), 0))
        forward = Vector((math.sin(h), -math.cos(h), 0))
        return Vector((center.x, center.y, z)) + left * lx + forward * lf

    for f in range(1, last + 1):
        stop = smooth((f - WALK_END) / STOP_FRAMES) if f >= WALK_END else 0.0
        pose = smooth((f - pose_begin(variant)) / ending["frames"])
        hold = max(0.0, (f - pose_end(variant)) / FPS)
        heading, turn_l, turn_r, lift_l, lift_r = turn(variant, f)

        # Hips: forward travel, bob, sway, yaw; facing turned by `heading`.
        s = hips_progress(f)
        u = ((f - 1) % STEP_FRAMES) / STEP_FRAMES
        bob = HIPS_BOB * math.cos(2 * math.pi * (u - 0.375)) * (1 - stop)
        drop = HIPS_DROP * (1 - stop) + 0.006 * stop
        sway = HIPS_SWAY * math.cos(math.pi * (f - 1 - 0.375 * STEP_FRAMES) / STEP_FRAMES) * (1 - stop)
        shift = 0.012 * math.sin(2 * math.pi * hold / 4.5) * smooth(hold)  # weight shift in the hold
        center = Vector((hips_rest.x + sway, hips_rest.y - s, 0))
        side_shift = body_point(Vector((0, 0, 0)), heading, shift, 0, 0)
        hips_world = Vector((center.x + side_shift.x, center.y + side_shift.y, hips_rest.z - drop + bob))
        yaw = HIPS_YAW * math.sin(math.pi * (f - 1 - 0.75 * STEP_FRAMES) / STEP_FRAMES) * (1 - stop)

        hips = rig.pose.bones[P + "Hips"]
        rest = rig.matrix_world.to_3x3() @ hips.bone.matrix_local.to_3x3()
        hips.location = rest.inverted() @ (hips_world - hips_rest)
        hips.rotation_quaternion = world_rot(rig, P + "Hips", ((0, 0, 1), yaw + heading))
        key(hips, "location", f)
        key(hips, "rotation_quaternion", f)

        breath = BREATH * math.sin(2 * math.pi * hold / 3.2) * smooth(hold)
        lean = LEAN * (1 - stop) - ending["chest"] * pose
        for name, part, counter in (("Spine", 0.3, 0.5), ("Spine1", 0.35, 0.7), ("Spine2", 0.35, 1.0)):
            pb = rig.pose.bones[P + name]
            pb.rotation_quaternion = world_rot(
                rig, P + name, ((0, 0, 1), -yaw * counter * 0.8), ((1, 0, 0), lean * part - breath * (name == "Spine2"))
            )
            key(pb, "rotation_quaternion", f)
        nod = 2.0 * math.sin(math.pi * smooth((f - STOP_END) / 12)) if STOP_END <= f <= STOP_END + 12 else 0.0
        if variant == "crest":  # a small nod with each pat
            nod += sum(
                1.5 * math.sin(math.pi * (f - pose_end(variant) - a) / n)
                for a, n in PATS
                if 0 <= f - pose_end(variant) - a <= n
            )
        head_pitch = -lerp(4.0, ending["chin"], pose) + nod + 0.6 * breath
        glance = GLANCE * smooth((f - pose_end(variant) - 6) / 14) if variant == "thumbs_back" else 0.0
        for name, part in (("Neck", 0.4), ("Head", 0.6)):
            pb = rig.pose.bones[P + name]
            pb.rotation_quaternion = world_rot(rig, P + name, ((1, 0, 0), head_pitch * part), ((0, 0, 1), (yaw * 0.3 + glance) * part))
            key(pb, "rotation_quaternion", f)

        # Feet (rotated around the hips when turning round).
        for side, foot_turn, turn_lift in ((LEFT, turn_l, lift_l), (RIGHT, turn_r, lift_r)):
            fs, lift, pitch, x = foot_state(side, f)
            toe_out = 8.0 * stop * (1 if side == LEFT else -1)
            place = Vector((x, ankle.y - fs, 0))
            if foot_turn:
                pivot = Vector((center.x, center.y, 0))
                place = pivot + Quaternion(Vector((0, 0, 1)), math.radians(foot_turn)) @ (place - pivot)
            foot = ctrl[f"foot{side}"]
            foot.location = Vector((place.x, place.y, ankle.z + lift + turn_lift + 0.05 * math.sin(math.radians(max(0.0, pitch)))))
            foot.rotation_quaternion = (
                Quaternion(Vector((0, 0, 1)), math.radians(toe_out + foot_turn))
                @ Quaternion(Vector((1, 0, 0)), math.radians(pitch))
                @ ctrl[f"footRest{side}"]
            )
            key(foot, "location", f)
            key(foot, "rotation_quaternion", f)
            knee = ctrl[f"knee{side}"]
            knee.location = body_point(Vector((place.x, place.y, 0)), foot_turn, 0.3 * x, 0.8, 0.55)
            key(knee, "location", f)

        # Arms: swing at the sides while walking, then the ending's gesture.
        sh_z = shoulder_z - drop + bob
        for side in (LEFT, RIGHT):
            sign = 1 if side == LEFT else -1
            swing = ARM_SWING * math.cos(math.pi * (f - 1 - 0.75 * STEP_FRAMES) / STEP_FRAMES) * sign * (1 - stop)
            at_side = body_point(center, heading, sign * 0.25 + shift, 0.03 + swing, sh_z - 0.51 + 0.12 * abs(swing))
            behind = body_point(center, heading, sign * 0.45, -0.55, sh_z - 0.25)
            hand, elbow = at_side, behind
            if variant == "arms_crossed":
                # The left wrist tucks under the right arm, the right one rests on top.
                crossed = (
                    body_point(center, heading, -0.165 + shift, 0.16, sh_z - 0.215)
                    if side == LEFT
                    else body_point(center, heading, 0.145 + shift, 0.19, sh_z - 0.175)
                )
                mid = body_point(center, heading, sign * 0.16, 0.30, sh_z - 0.42)
                hand = at_side.lerp(mid, smooth(pose * 2)) if pose < 0.5 else mid.lerp(crossed, smooth(pose * 2 - 1))
                elbow = behind.lerp(body_point(center, heading, sign * 0.75, -0.05, sh_z - 0.30), smooth(pose * 1.4))
            elif variant == "crest" and side == RIGHT:
                # The right hand onto the crest (left chest), pats lifting it off a little.
                pat = sum(
                    math.sin(math.pi * (f - pose_end(variant) - a) / n)
                    for a, n in PATS
                    if 0 <= f - pose_end(variant) - a <= n
                )
                on_crest = body_point(center, heading, 0.0 + shift, 0.135 + 0.035 * pat, sh_z - 0.17)
                mid = body_point(center, heading, -0.12, 0.30, sh_z - 0.38)
                hand = at_side.lerp(mid, smooth(pose * 2)) if pose < 0.5 else mid.lerp(on_crest, smooth(pose * 2 - 1))
                elbow = behind.lerp(body_point(center, heading, -0.55, 0.15, sh_z - 0.55), smooth(pose * 1.4))
            elif variant == "crest":
                hand = at_side.lerp(body_point(center, heading, 0.24 + shift, 0.05, sh_z - 0.52), pose)
            elif variant == "thumbs_back":
                # Fists by the shoulders, thumbs over them towards the name on the back.
                up = body_point(center, heading, sign * 0.24, 0.0, sh_z + 0.08)
                mid = body_point(center, heading, sign * 0.30, 0.22, sh_z - 0.35)
                hand = at_side.lerp(mid, smooth(pose * 2)) if pose < 0.5 else mid.lerp(up, smooth(pose * 2 - 1))
                elbow = behind.lerp(body_point(center, heading, sign * 0.70, 0.25, sh_z - 0.45), smooth(pose * 1.4))
            ctrl[f"hand{side}"].location = hand
            ctrl[f"elbow{side}"].location = elbow
            key(ctrl[f"hand{side}"], "location", f)
            key(ctrl[f"elbow{side}"], "location", f)

        # Fingers: relaxed while walking, then the ending's hands.
        for side in (LEFT, RIGHT):
            gesture = variant == "arms_crossed" or variant == "thumbs_back" or (variant == "crest" and side == RIGHT)
            if variant == "arms_crossed":
                target, thumb = 65.0, 30.0  # gripping the arms
            elif variant == "thumbs_back":
                target, thumb = 95.0, 0.0  # fists, thumbs out
            elif variant == "crest" and side == RIGHT:
                target, thumb = 6.0, 5.0  # hand flat on the chest
            else:
                target, thumb = RELAXED_CURL, 10.0
            amount = lerp(RELAXED_CURL, target, pose if gesture else smooth((f - STOP_END) / 10))
            thumb_amount = lerp(10.0, thumb, pose)
            for name in finger_bones:
                if f"{P}{side}" not in name:
                    continue
                pb = rig.pose.bones[name]
                pb.rotation_quaternion = Quaternion(fingers[side]["curl"], math.radians(amount * (0.6 if name.endswith("1") else 1.0)))
                key(pb, "rotation_quaternion", f)
            for bone in ("Thumb2", "Thumb3"):
                pb = rig.pose.bones[f"{P}{side}Hand{bone}"]
                pb.rotation_quaternion = Quaternion(fingers[side]["thumb"], math.radians(thumb_amount))
                key(pb, "rotation_quaternion", f)

    # Wrists, searched on the ending's pose: hands wrap the opposite biceps, lie flat on the crest,
    # or point the thumbs over the shoulders.
    end = pose_end(variant)
    scene.frame_set(end)
    bpy.context.view_layer.update()
    center_end = Vector((hips_rest.x, hips_rest.y - hips_progress(end), 0))
    heading_end = turn(variant, end)[0]
    sh_end = shoulder_z - 0.006
    wrists = {}
    for side in (LEFT, RIGHT):
        sign = 1 if side == LEFT else -1
        other = RIGHT if side == LEFT else LEFT
        if variant == "arms_crossed":
            biceps = pose_world(rig, f"{P}{other}Arm").lerp(pose_world(rig, f"{P}{other}ForeArm"), 0.55)
            targets = [(f"{side}HandMiddle2", biceps)]
        elif variant == "crest" and side == RIGHT:
            targets = [
                (f"{side}HandMiddle1", body_point(center_end, heading_end, 0.05, 0.13, sh_end - 0.10)),
                (f"{side}HandMiddle4", body_point(center_end, heading_end, 0.13, 0.125, sh_end - 0.01)),
            ]
        elif variant == "thumbs_back":
            # Thumb tip behind the shoulder, the fist beside it: the thumb points at the back.
            targets = [
                (f"{side}HandThumb4", body_point(center_end, heading_end, sign * 0.15, -0.14, sh_end + 0.04)),
                (f"{side}HandMiddle1", body_point(center_end, heading_end, sign * 0.26, 0.02, sh_end + 0.14)),
            ]
        else:
            targets = None
        wrists[side] = search_wrist(rig, side, targets) if targets else Quaternion()
    for f in range(1, last + 1):
        pose = smooth((f - pose_begin(variant)) / ending["frames"])
        for side in (LEFT, RIGHT):
            hand = rig.pose.bones[f"{P}{side}Hand"]
            hand.rotation_quaternion = Quaternion().slerp(wrists[side], pose)
            key(hand, "rotation_quaternion", f)

    rig.animation_data.action.name = f"walkout_{variant}_controls"
    return rig


def bake(rig, variant):
    scene = bpy.context.scene
    for o in scene.objects:
        o.select_set(False)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.nla.bake(
        frame_start=scene.frame_start,
        frame_end=scene.frame_end,
        only_selected=True,
        visual_keying=True,
        clear_constraints=True,
        use_current_action=False,
        bake_types={"POSE"},
    )
    bpy.ops.object.mode_set(mode="OBJECT")
    action = rig.animation_data.action
    old = bpy.data.actions.get(f"walkout_{variant}")
    if old and old != action:
        bpy.data.actions.remove(old)
    action.name = f"walkout_{variant}"
    action.use_fake_user = True
    for obj in [o for o in scene.objects if o.name.startswith("CTRL_")]:
        bpy.data.objects.remove(obj)


def export(rig, variant):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.fbx(
        filepath=out_fbx(variant),
        use_selection=True,
        object_types={"ARMATURE"},
        add_leaf_bones=False,
        bake_anim=True,
        bake_anim_use_all_actions=False,
        bake_anim_use_nla_strips=False,
        bake_anim_simplify_factor=0.0,
        axis_forward="-Z",
        axis_up="Y",
        apply_unit_scale=True,
        apply_scale_options="FBX_SCALE_NONE",
        primary_bone_axis="Y",
        secondary_bone_axis="X",
    )
