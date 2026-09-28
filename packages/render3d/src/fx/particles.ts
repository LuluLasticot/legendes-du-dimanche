// Impact particles: turf, mud, dust, chalk, net puffs, glints and goal confetti. One draw call
// (points with a soft round sprite), simulated on the CPU. Randomness comes from a seeded
// generator so a replay shows exactly the same bursts.

import * as THREE from 'three';

export type ParticleKind =
  'grass' | 'turf' | 'mud' | 'dirt' | 'chalk' | 'net' | 'glint' | 'confetti';

/** Minimal random source (the engine's Rng fits). */
export interface RandomSource {
  float(): number;
  range(min: number, max: number): number;
}

interface KindStyle {
  readonly colours: readonly (readonly [number, number, number])[];
  readonly size: readonly [number, number];
  readonly speed: readonly [number, number];
  readonly life: readonly [number, number];
  readonly gravity: number;
  readonly drag: number;
  readonly up: number;
}

const STYLES: Readonly<Record<ParticleKind, KindStyle>> = {
  grass: {
    colours: [
      [0.16, 0.42, 0.18],
      [0.22, 0.52, 0.22],
      [0.12, 0.3, 0.12],
    ],
    size: [0.05, 0.1],
    speed: [2, 5],
    life: [0.5, 0.9],
    gravity: 9,
    drag: 2.5,
    up: 0.8,
  },
  turf: {
    colours: [
      [0.08, 0.08, 0.08],
      [0.2, 0.45, 0.22],
    ],
    size: [0.03, 0.06],
    speed: [2, 4.5],
    life: [0.4, 0.7],
    gravity: 9,
    drag: 2,
    up: 0.9,
  },
  mud: {
    colours: [
      [0.27, 0.19, 0.12],
      [0.34, 0.25, 0.15],
    ],
    size: [0.06, 0.14],
    speed: [1.5, 4],
    life: [0.5, 0.9],
    gravity: 11,
    drag: 1.5,
    up: 0.7,
  },
  dirt: {
    colours: [
      [0.62, 0.42, 0.28],
      [0.55, 0.36, 0.24],
    ],
    size: [0.1, 0.3],
    speed: [0.5, 2],
    life: [0.8, 1.6],
    gravity: 0.6,
    drag: 3,
    up: 0.6,
  },
  chalk: {
    colours: [[1.4, 1.4, 1.35]],
    size: [0.1, 0.25],
    speed: [0.4, 1.5],
    life: [0.6, 1.2],
    gravity: 0.3,
    drag: 3,
    up: 0.5,
  },
  net: {
    colours: [[1.2, 1.2, 1.2]],
    size: [0.04, 0.08],
    speed: [0.5, 2],
    life: [0.3, 0.6],
    gravity: 2,
    drag: 4,
    up: 0.3,
  },
  glint: {
    colours: [
      [4, 3.6, 3],
      [3, 3, 3.4],
    ],
    size: [0.04, 0.08],
    speed: [3, 7],
    life: [0.15, 0.35],
    gravity: 6,
    drag: 1,
    up: 0.4,
  },
  confetti: {
    colours: [
      [2, 0.35, 0.3],
      [2, 1.7, 0.4],
      [0.4, 1.6, 0.6],
      [0.5, 0.8, 2],
      [1.8, 1.8, 1.8],
    ],
    size: [0.08, 0.13],
    speed: [4, 9],
    life: [2, 3.5],
    gravity: 3,
    drag: 1.4,
    up: 1.6,
  },
};

const VS = /* glsl */ `
attribute vec3 aColour;
attribute float aAlpha;
attribute float aSize;
varying vec3 vColour;
varying float vAlpha;
uniform float uScale;
void main() {
  vColour = aColour;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;
const FS = /* glsl */ `
varying vec3 vColour;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d);
  if (r > 0.25) discard;
  gl_FragColor = vec4(vColour, vAlpha * smoothstep(0.25, 0.1, r));
}
`;

export class ImpactParticles {
  readonly points: THREE.Points;
  readonly capacity: number;
  /** Multiplier on the number of particles per burst (quality, settings). */
  amount = 1;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly colour: Float32Array;
  private readonly alpha: Float32Array;
  private readonly size: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private next = 0;
  private readonly material: THREE.ShaderMaterial;

  constructor(capacity = 800) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.colour = new Float32Array(capacity * 3);
    this.alpha = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geometry.setAttribute('aColour', new THREE.BufferAttribute(this.colour, 3));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: 600 } },
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
  }

  /** Point size scale: viewport height in pixels (sizes are in metres). */
  setViewportHeight(pixels: number): void {
    (this.material.uniforms.uScale as THREE.IUniform).value = pixels;
  }

  /** Number of live particles (for tests and budgets). */
  get alive(): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) if ((this.life[i] as number) > 0) n++;
    return n;
  }

  /**
   * Emits `count` particles of a kind at `origin`, thrown around `direction` (defaults to up).
   * `spread` in [0, 1]: 0 = along the direction, 1 = hemisphere.
   */
  emit(
    kind: ParticleKind,
    origin: { x: number; y: number; z: number },
    count: number,
    rng: RandomSource,
    direction: { x: number; y: number; z: number } = { x: 0, y: 1, z: 0 },
    spread = 0.8,
  ): void {
    const style = STYLES[kind];
    const n = Math.max(0, Math.round(count * this.amount));
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.capacity;
      const dx = direction.x + rng.range(-spread, spread);
      const dy = direction.y * style.up + rng.range(0, spread) * style.up;
      const dz = direction.z + rng.range(-spread, spread);
      const len = Math.hypot(dx, dy, dz) || 1;
      const speed = rng.range(style.speed[0], style.speed[1]);
      this.pos[i * 3] = origin.x;
      this.pos[i * 3 + 1] = origin.y;
      this.pos[i * 3 + 2] = origin.z;
      this.vel[i * 3] = (dx / len) * speed;
      this.vel[i * 3 + 1] = (dy / len) * speed;
      this.vel[i * 3 + 2] = (dz / len) * speed;
      const c = style.colours[Math.floor(rng.float() * style.colours.length)] ?? [1, 1, 1];
      this.colour[i * 3] = c[0];
      this.colour[i * 3 + 1] = c[1];
      this.colour[i * 3 + 2] = c[2];
      this.size[i] = rng.range(style.size[0], style.size[1]);
      const life = rng.range(style.life[0], style.life[1]);
      this.life[i] = life;
      this.maxLife[i] = life;
      this.gravity[i] = style.gravity;
      this.drag[i] = style.drag;
      this.alpha[i] = 1;
    }
  }

  /** Advances all particles by `dt` seconds (simulated time: slow motion slows them too). */
  update(dt: number): void {
    if (dt <= 0) return;
    for (let i = 0; i < this.capacity; i++) {
      const life = this.life[i] as number;
      if (life <= 0) continue;
      const remaining = life - dt;
      this.life[i] = remaining;
      if (remaining <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      const damp = Math.exp(-(this.drag[i] as number) * dt);
      const o = i * 3;
      this.vel[o] = (this.vel[o] as number) * damp;
      this.vel[o + 1] = (this.vel[o + 1] as number) * damp - (this.gravity[i] as number) * dt;
      this.vel[o + 2] = (this.vel[o + 2] as number) * damp;
      this.pos[o] = (this.pos[o] as number) + this.vel[o] * dt;
      this.pos[o + 1] = Math.max(
        0.01,
        (this.pos[o + 1] as number) + (this.vel[o + 1] as number) * dt,
      );
      this.pos[o + 2] = (this.pos[o + 2] as number) + (this.vel[o + 2] as number) * dt;
      this.alpha[i] = Math.min(1, remaining / ((this.maxLife[i] as number) * 0.5));
    }
    const geometry = this.points.geometry;
    for (const name of ['position', 'aAlpha'])
      (geometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    for (const name of ['aColour', 'aSize'])
      (geometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    this.alpha.fill(0);
  }
}

/** Particle kind thrown up by a strike or a bounce on a surface. */
export function surfaceParticles(surface: 'grass' | 'artificial' | 'muddy' | 'dirt'): ParticleKind {
  return surface === 'artificial'
    ? 'turf'
    : surface === 'muddy'
      ? 'mud'
      : surface === 'dirt'
        ? 'dirt'
        : 'grass';
}
