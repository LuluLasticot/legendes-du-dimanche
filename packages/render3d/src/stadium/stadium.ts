// Amateur stadium kit, greybox + first night ambience pass (GDD §12.2, §12.5): pitch painted per
// surface with full markings, the white "main courante" rail, two goals with deformable nets,
// a small metal stand, prefab changing rooms, the buvette, floodlight masts, trees and houses.
// Repeated elements are instanced or merged to stay far below the draw-call budget.

import { physics, Rng } from '@legendes/engine';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { QualityProfile } from '../core/quality.ts';
import { pitchMarkings, MARKING } from './markings.ts';
import { impactAmplitude, impactLifetime, netOffset, type NetImpact } from './net-field.ts';

const { GOAL, PITCH } = physics;
const HX = PITCH.length / 2;
const HZ = PITCH.width / 2;

/** Distance from the touchlines / goal lines to the rail. */
const RAIL_SIDE = 3;
const RAIL_END = 4.5;
/** Grass beyond the lines that belongs to the painted surface. */
const MARGIN = 5;

export interface StadiumOptions {
  readonly surface: physics.PhysicsSurface;
  readonly profile: QualityProfile;
}

// ─── Pitch texture ────────────────────────────────────────────────────────────

interface SurfaceLook {
  readonly base: string;
  readonly stripe: string | null;
  readonly speckle: readonly [string, number] | null;
  readonly lineAlpha: number;
}

const LOOKS: Readonly<Record<physics.PhysicsSurface, SurfaceLook>> = {
  grass: { base: '#2b6b36', stripe: '#327a3e', speckle: ['#24592d', 0.004], lineAlpha: 0.92 },
  artificial: { base: '#2f8444', stripe: '#2c7d40', speckle: ['#1c3a24', 0.02], lineAlpha: 0.95 },
  muddy: { base: '#2a5a30', stripe: '#2f6534', speckle: ['#3b2f22', 0.01], lineAlpha: 0.7 },
  dirt: { base: '#8a5a3e', stripe: null, speckle: ['#6f4630', 0.03], lineAlpha: 0.9 },
};

function drawPitchCanvas(surface: physics.PhysicsSurface, pxPerMetre: number): HTMLCanvasElement {
  const look = LOOKS[surface];
  const w = Math.round((PITCH.length + 2 * MARGIN) * pxPerMetre);
  const h = Math.round((PITCH.width + 2 * MARGIN) * pxPerMetre);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const px = (x: number): number => (x + HX + MARGIN) * pxPerMetre;
  const pz = (z: number): number => (z + HZ + MARGIN) * pxPerMetre;
  const rng = Rng.create(`pitch:${surface}`);

  ctx.fillStyle = look.base;
  ctx.fillRect(0, 0, w, h);
  if (look.stripe) {
    // Mowing stripes across the pitch, 20 bands between the goal lines.
    const band = PITCH.length / 20;
    ctx.fillStyle = look.stripe;
    for (let i = 0; i < 20; i += 2) ctx.fillRect(px(-HX + i * band), 0, band * pxPerMetre, h);
  }
  if (look.speckle) {
    const [colour, density] = look.speckle;
    ctx.fillStyle = colour;
    const count = Math.round(w * h * density * 0.02);
    for (let i = 0; i < count; i++) {
      const s = rng.range(1, 2.5);
      ctx.globalAlpha = rng.range(0.25, 0.7);
      ctx.fillRect(rng.range(0, w), rng.range(0, h), s, s);
    }
    ctx.globalAlpha = 1;
  }
  if (surface === 'muddy') {
    // Worn goalmouths and centre: where the mud is on a winter Sunday.
    const blob = (x: number, z: number, rx: number, rz: number): void => {
      for (let i = 0; i < 26; i++) {
        const cx = px(x + rng.normal(0, rx * 0.35));
        const cz = pz(z + rng.normal(0, rz * 0.35));
        const r = rng.range(0.25, 0.6) * Math.max(rx, rz) * pxPerMetre;
        const g = ctx.createRadialGradient(cx, cz, 0, cx, cz, r);
        g.addColorStop(0, 'rgba(74, 55, 36, 0.75)');
        g.addColorStop(1, 'rgba(74, 55, 36, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cz - r, 2 * r, 2 * r);
      }
    };
    for (const side of [-1, 1]) blob(side * (HX - 7), 0, 9, 7);
    blob(0, 0, 8, 12);
  }

  ctx.strokeStyle = `rgba(244, 241, 232, ${look.lineAlpha})`;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = Math.max(1.5, MARKING.lineWidth * pxPerMetre);
  ctx.lineCap = 'butt';
  for (const m of pitchMarkings(PITCH.length, PITCH.width)) {
    ctx.beginPath();
    if (m.kind === 'line') {
      ctx.moveTo(px(m.a[0]), pz(m.a[1]));
      ctx.lineTo(px(m.b[0]), pz(m.b[1]));
      ctx.stroke();
    } else if (m.kind === 'arc') {
      ctx.arc(px(m.centre[0]), pz(m.centre[1]), m.radius * pxPerMetre, m.start, m.end);
      ctx.stroke();
    } else {
      ctx.arc(px(m.at[0]), pz(m.at[1]), m.radius * pxPerMetre, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
  return canvas;
}

// ─── Nets ─────────────────────────────────────────────────────────────────────

interface Net {
  readonly lines: THREE.LineSegments;
  readonly rest: Float32Array;
  readonly normals: Float32Array;
  readonly impacts: NetImpact[];
  moving: boolean;
}

/** Grid of net cords for the goal whose line is at x = side · HX. */
function buildNet(side: 1 | -1, material: THREE.LineBasicMaterial): Net {
  const step = 0.16;
  const gx = side * HX;
  const depth = GOAL.netDepth;
  const hw = GOAL.width / 2;
  const h = GOAL.height;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  /** Adds a grid panel spanned by `origin + i·du + j·dv`, with an outward normal. */
  const panel = (
    origin: THREE.Vector3,
    du: THREE.Vector3,
    dv: THREE.Vector3,
    normal: THREE.Vector3,
  ): void => {
    const nu = Math.max(1, Math.round(du.length() / step));
    const nv = Math.max(1, Math.round(dv.length() / step));
    const base = positions.length / 3;
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const p = origin
          .clone()
          .addScaledVector(du, i / nu)
          .addScaledVector(dv, j / nv);
        positions.push(p.x, p.y, p.z);
        // Edges are tied to the frame / ground: they do not move.
        const edge = i === 0 || j === 0 || i === nu || j === nv;
        const n = edge ? new THREE.Vector3() : normal;
        normals.push(n.x, n.y, n.z);
      }
    }
    const at = (i: number, j: number): number => base + j * (nu + 1) + i;
    for (let j = 0; j <= nv; j++) for (let i = 0; i < nu; i++) indices.push(at(i, j), at(i + 1, j));
    for (let i = 0; i <= nu; i++) for (let j = 0; j < nv; j++) indices.push(at(i, j), at(i, j + 1));
  };

  const back = gx + side * depth;
  panel(
    new THREE.Vector3(back, 0, -hw),
    new THREE.Vector3(0, 0, 2 * hw),
    new THREE.Vector3(0, h, 0),
    new THREE.Vector3(side, 0, 0),
  );
  panel(
    new THREE.Vector3(gx, 0, -hw),
    new THREE.Vector3(side * depth, 0, 0),
    new THREE.Vector3(0, h, 0),
    new THREE.Vector3(0, 0, -1),
  );
  panel(
    new THREE.Vector3(gx, 0, hw),
    new THREE.Vector3(side * depth, 0, 0),
    new THREE.Vector3(0, h, 0),
    new THREE.Vector3(0, 0, 1),
  );
  panel(
    new THREE.Vector3(gx, h, -hw),
    new THREE.Vector3(side * depth, 0, 0),
    new THREE.Vector3(0, 0, 2 * hw),
    new THREE.Vector3(0, 1, 0),
  );

  const geometry = new THREE.BufferGeometry();
  const rest = new Float32Array(positions);
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  return { lines, rest, normals: new Float32Array(normals), impacts: [], moving: false };
}

// ─── Stadium ──────────────────────────────────────────────────────────────────

function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  matrices: readonly THREE.Matrix4[],
  castShadow = false,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

const compose = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0): THREE.Matrix4 =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry),
    new THREE.Vector3(sx, sy, sz),
  );

function radialTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255, 244, 220, 1)');
    g.addColorStop(0.2, 'rgba(255, 226, 170, 0.45)');
    g.addColorStop(1, 'rgba(255, 210, 140, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(canvas);
}

const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const SKY_FS = /* glsl */ `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGlow;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.45));
  // Town light pollution low on the horizon.
  col += uGlow * exp(-h * 18.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Stadium {
  private readonly scene: THREE.Scene;
  private readonly root = new THREE.Group();
  private readonly pitchMaterial: THREE.MeshStandardMaterial;
  private readonly textures: THREE.Texture[] = [];
  private readonly nets: Readonly<Record<'attack' | 'defence', Net>>;
  private readonly profile: QualityProfile;
  private surface: physics.PhysicsSurface;

  constructor(scene: THREE.Scene, options: StadiumOptions) {
    this.scene = scene;
    this.profile = options.profile;
    this.surface = options.surface;
    scene.add(this.root);

    // Sky and fog.
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(450, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VS,
        fragmentShader: SKY_FS,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uZenith: { value: new THREE.Color(0x020409) },
          uHorizon: { value: new THREE.Color(0x0b1614) },
          uGlow: { value: new THREE.Color(0x1f1a10) },
        },
      }),
    );
    sky.renderOrder = -1;
    this.root.add(sky);
    scene.fog = new THREE.Fog(0x0a1412, 90, 300);
    scene.background = null;

    // Surround and pitch.
    const surround = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 360),
      new THREE.MeshStandardMaterial({ color: 0x16301c, roughness: 1 }),
    );
    surround.rotation.x = -Math.PI / 2;
    surround.position.y = -0.02;
    surround.receiveShadow = true;
    this.root.add(surround);

    this.pitchMaterial = new THREE.MeshStandardMaterial({ roughness: 0.95 });
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(PITCH.length + 2 * MARGIN, PITCH.width + 2 * MARGIN),
      this.pitchMaterial,
    );
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = true;
    this.root.add(pitch);
    this.paintPitch();

    this.buildRail();
    this.buildGoals();
    const netMaterial = new THREE.LineBasicMaterial({
      color: 0xe8ecef,
      transparent: true,
      opacity: 0.32,
    });
    this.nets = { attack: buildNet(1, netMaterial), defence: buildNet(-1, netMaterial) };
    this.root.add(this.nets.attack.lines, this.nets.defence.lines);
    this.buildStand();
    this.buildClubhouse();
    this.buildFloodlights();
    this.buildSurroundings();
  }

  setSurface(surface: physics.PhysicsSurface): void {
    if (surface === this.surface) return;
    this.surface = surface;
    this.paintPitch();
  }

  /** A ball hit the net at `pos` (world) with `speed`, at time `now` (seconds). */
  netImpact(pos: physics.Vec3, speed: number, now: number): void {
    const net = pos.x >= 0 ? this.nets.attack : this.nets.defence;
    net.impacts.push({
      x: pos.x,
      y: pos.y,
      z: pos.z,
      amplitude: impactAmplitude(speed),
      time: now,
    });
    net.moving = true;
  }

  /** Animates the nets; `now` is the same clock as the impacts (simulated seconds). */
  update(now: number): void {
    for (const net of [this.nets.attack, this.nets.defence]) {
      if (!net.moving) continue;
      const lifetime = impactLifetime();
      for (let i = net.impacts.length - 1; i >= 0; i--) {
        if (now - (net.impacts[i] as NetImpact).time > lifetime) net.impacts.splice(i, 1);
      }
      const attribute = net.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
      const out = attribute.array as Float32Array;
      const { rest, normals } = net;
      for (let i = 0; i < rest.length; i += 3) {
        const nx = normals[i] as number;
        const ny = normals[i + 1] as number;
        const nz = normals[i + 2] as number;
        const x = rest[i] as number;
        const y = rest[i + 1] as number;
        const z = rest[i + 2] as number;
        const o = nx === 0 && ny === 0 && nz === 0 ? 0 : netOffset(x, y, z, net.impacts, now);
        out[i] = x + nx * o;
        out[i + 1] = y + ny * o;
        out[i + 2] = z + nz * o;
      }
      attribute.needsUpdate = true;
      if (net.impacts.length === 0) net.moving = false;
    }
  }

  dispose(): void {
    // Geometries and materials are disposed by Stage.dispose (scene traversal).
    for (const texture of this.textures) texture.dispose();
    this.scene.remove(this.root);
    this.scene.fog = null;
  }

  // ─── Builders ─────────────────────────────────────────────────────────────

  private paintPitch(): void {
    const ppm = this.profile.level === 'low' ? 10 : this.profile.level === 'medium' ? 14 : 18;
    const texture = new THREE.CanvasTexture(drawPitchCanvas(this.surface, ppm));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.profile.level === 'low' ? 2 : 8;
    const previous = this.pitchMaterial.map;
    this.pitchMaterial.map = texture;
    this.pitchMaterial.needsUpdate = true;
    this.textures.push(texture);
    if (previous) {
      previous.dispose();
      this.textures.splice(this.textures.indexOf(previous), 1);
    }
  }

  private buildRail(): void {
    const xr = HX + RAIL_END;
    const zr = HZ + RAIL_SIDE;
    const height = 1.1;
    const posts: THREE.Matrix4[] = [];
    const spacing = 2.5;
    for (let x = -xr; x <= xr + 1e-6; x += spacing)
      posts.push(compose(x, height / 2, -zr), compose(x, height / 2, zr));
    for (let z = -zr + spacing; z < zr - 1e-6; z += spacing)
      posts.push(compose(-xr, height / 2, z), compose(xr, height / 2, z));
    const white = new THREE.MeshStandardMaterial({
      color: 0xf2f2ee,
      roughness: 0.5,
      metalness: 0.2,
    });
    this.root.add(instanced(new THREE.CylinderGeometry(0.035, 0.035, height, 6), white, posts));

    const rails = mergeGeometries([
      new THREE.BoxGeometry(2 * xr, 0.06, 0.06).translate(0, height, -zr),
      new THREE.BoxGeometry(2 * xr, 0.06, 0.06).translate(0, height, zr),
      new THREE.BoxGeometry(0.06, 0.06, 2 * zr).translate(-xr, height, 0),
      new THREE.BoxGeometry(0.06, 0.06, 2 * zr).translate(xr, height, 0),
    ]);
    const rail = new THREE.Mesh(rails, white);
    rail.castShadow = true;
    this.root.add(rail);
  }

  private buildGoals(): void {
    const r = GOAL.postRadius;
    const postZ = GOAL.width / 2 + r;
    const barY = GOAL.height + r;
    const parts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const gx = side * HX;
      for (const z of [-postZ, postZ]) {
        parts.push(new THREE.CylinderGeometry(r, r, barY + r, 12).translate(gx, (barY + r) / 2, z));
        // Ground bar and back stanchion holding the net.
        parts.push(
          new THREE.CylinderGeometry(0.025, 0.025, GOAL.netDepth, 6)
            .rotateZ(Math.PI / 2)
            .translate(gx + (side * GOAL.netDepth) / 2, 0.03, z),
        );
        parts.push(
          new THREE.CylinderGeometry(0.025, 0.025, GOAL.height, 6).translate(
            gx + side * GOAL.netDepth,
            GOAL.height / 2,
            z,
          ),
        );
      }
      parts.push(
        new THREE.CylinderGeometry(r, r, 2 * postZ, 12).rotateX(Math.PI / 2).translate(gx, barY, 0),
      );
    }
    const frame = new THREE.Mesh(
      mergeGeometries(parts),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, emissive: 0x1a1a1a }),
    );
    frame.castShadow = true;
    this.root.add(frame);
  }

  /** Small covered metal stand along the right touchline, facing the pitch. */
  private buildStand(): void {
    const z0 = HZ + RAIL_SIDE + 2;
    const x0 = 6;
    const length = 32;
    const steps: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const h = 0.45 * (i + 1);
      steps.push(
        new THREE.BoxGeometry(length, h, 0.85).translate(
          x0 + length / 2,
          h / 2,
          z0 + i * 0.85 + 0.425,
        ),
      );
    }
    const concrete = new THREE.Mesh(
      mergeGeometries(steps),
      new THREE.MeshStandardMaterial({ color: 0x5c605c, roughness: 0.9 }),
    );
    concrete.receiveShadow = true;
    concrete.castShadow = true;

    const depth = 5 * 0.85;
    const metal = new THREE.MeshStandardMaterial({
      color: 0x46505a,
      roughness: 0.6,
      metalness: 0.5,
    });
    const shell: THREE.BufferGeometry[] = [
      // Back wall and roof in corrugated sheet ("tôle"), greybox as flat boxes.
      new THREE.BoxGeometry(length, 5, 0.08).translate(x0 + length / 2, 2.5, z0 + depth + 0.2),
      new THREE.BoxGeometry(length + 1, 0.08, depth + 1.8)
        .rotateX(-0.12)
        .translate(x0 + length / 2, 5.1, z0 + depth / 2 - 0.4),
    ];
    for (let x = x0; x <= x0 + length + 1e-6; x += 8) {
      shell.push(new THREE.BoxGeometry(0.14, 5, 0.14).translate(x, 2.5, z0 + depth + 0.1));
    }
    const roof = new THREE.Mesh(mergeGeometries(shell), metal);
    roof.castShadow = true;
    this.root.add(concrete, roof);
  }

  /** Prefab changing rooms and the buvette (warm light, the soul of the club). */
  private buildClubhouse(): void {
    const z = -(HZ + RAIL_SIDE + 7);
    const prefab = new THREE.MeshStandardMaterial({ color: 0xcfc6b0, roughness: 0.85 });
    const block = mergeGeometries([
      new THREE.BoxGeometry(16, 3, 6).translate(14, 1.5, z),
      new THREE.BoxGeometry(6, 2.8, 4.5).translate(30, 1.4, z + 0.5),
    ]);
    const building = new THREE.Mesh(block, prefab);
    building.castShadow = true;
    building.receiveShadow = true;

    const lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.1, 0.9) });
    const windows = new THREE.Mesh(
      mergeGeometries([
        new THREE.PlaneGeometry(3.2, 1.2).translate(30, 1.6, z + 2.76),
        ...[8, 12, 16, 20].map((x) => new THREE.PlaneGeometry(1.4, 0.8).translate(x, 2, z + 3.01)),
      ]),
      lit,
    );
    this.root.add(building, windows);
  }

  private buildFloodlights(): void {
    const height = 20;
    // Four corner masts plus two behind each goal (common on amateur grounds, and what the
    // player sees when shooting).
    const corners: [number, number][] = [
      [HX + 9, HZ + 9],
      [HX + 9, -(HZ + 9)],
      [-(HX + 9), HZ + 9],
      [-(HX + 9), -(HZ + 9)],
      [HX + 16, 24],
      [HX + 16, -24],
      [-(HX + 16), 24],
      [-(HX + 16), -24],
    ];
    const mastMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b302e,
      roughness: 0.8,
      metalness: 0.4,
    });
    this.root.add(
      instanced(
        new THREE.CylinderGeometry(0.22, 0.36, height, 8),
        mastMaterial,
        corners.map(([x, z]) => compose(x, height / 2, z)),
      ),
    );
    const heads: THREE.Matrix4[] = corners.map(([x, z]) => {
      const m = new THREE.Matrix4().lookAt(
        new THREE.Vector3(x, height + 0.6, z),
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 1, 0),
      );
      m.setPosition(x, height + 0.6, z);
      return m;
    });
    this.root.add(
      instanced(
        new THREE.PlaneGeometry(3.4, 1.8),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8, 6.2), side: THREE.DoubleSide }),
        heads,
      ),
    );

    const halo = radialTexture();
    this.textures.push(halo);
    const glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        corners.flatMap(([x, z]) => [x, height + 0.6, z]),
        3,
      ),
    );
    const glow = new THREE.Points(
      glowGeometry,
      new THREE.PointsMaterial({
        map: halo,
        size: 16,
        sizeAttenuation: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: new THREE.Color(1.4, 1.25, 1),
        fog: false,
      }),
    );
    glow.frustumCulled = false;
    this.root.add(glow);

    // Lighting: sky/ground ambience, a key light from one mast (shadows) and a softer fill.
    this.root.add(new THREE.HemisphereLight(0x9fb4d8, 0x0d2012, 0.45));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.4);
    key.position.set(HX + 9, height, -(HZ + 9));
    key.target.position.set(HX - 20, 0, 0);
    key.castShadow = this.profile.shadowMapSize > 0;
    key.shadow.mapSize.set(this.profile.shadowMapSize || 512, this.profile.shadowMapSize || 512);
    Object.assign(key.shadow.camera, {
      left: -32,
      right: 32,
      top: 32,
      bottom: -32,
      near: 1,
      far: 120,
    });
    key.shadow.bias = -0.0005;
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.9);
    fill.position.set(-(HX + 9), height, HZ + 9);
    this.root.add(key, key.target, fill);
  }

  private buildSurroundings(): void {
    const rng = Rng.create('stadium:surroundings');
    const trees: THREE.Matrix4[] = [];
    const trunks: THREE.Matrix4[] = [];
    for (let i = 0; i < 90; i++) {
      // A belt of trees around the ground, leaving room for the buildings.
      const angle = rng.range(0, 2 * Math.PI);
      const rx = rng.range(78, 115);
      const rz = rng.range(58, 85);
      const x = Math.cos(angle) * rx;
      const z = Math.sin(angle) * rz;
      const s = rng.range(0.8, 1.5);
      trees.push(compose(x, 3.5 * s + 1.5, z, s, s, s, rng.range(0, 6)));
      trunks.push(compose(x, 0.9, z, 1, 1, 1));
    }
    const foliage = new THREE.MeshStandardMaterial({
      color: 0x1a3320,
      roughness: 1,
      flatShading: true,
    });
    const bark = new THREE.MeshStandardMaterial({ color: 0x2c2218, roughness: 1 });
    this.root.add(
      instanced(new THREE.ConeGeometry(2.6, 7, 7), foliage, trees),
      instanced(new THREE.CylinderGeometry(0.2, 0.28, 1.8, 5), bark, trunks),
    );

    const houses: THREE.Matrix4[] = [];
    const roofs: THREE.Matrix4[] = [];
    for (let i = 0; i < 12; i++) {
      const x = rng.range(-110, 110);
      const z = (rng.chance(0.5) ? 1 : -1) * rng.range(95, 120);
      const w = rng.range(7, 11);
      const d = rng.range(6, 9);
      const h = rng.range(5, 7);
      const ry = rng.range(-0.3, 0.3);
      houses.push(compose(x, h / 2, z, w, h, d, ry));
      roofs.push(compose(x, h + 1.4, z, w * 0.75, 2.8, d * 0.75, ry + Math.PI / 4));
    }
    this.root.add(
      instanced(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x8c8474, roughness: 0.9 }),
        houses,
      ),
      instanced(
        new THREE.ConeGeometry(1, 1, 4),
        new THREE.MeshStandardMaterial({ color: 0x5a2f25, roughness: 0.9, flatShading: true }),
        roofs,
      ),
    );
  }
}
