// Ball trail: a camera-facing ribbon through the last positions of the ball, tapered to the tail,
// coloured by speed (chalk → floodlight gold → hot orange) in HDR so the bloom catches it.

import * as THREE from 'three';

/** Linear HDR colour of the trail for a ball speed in m/s. */
export function trailColour(speed: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [8, [1.6, 1.6, 1.5]],
    [22, [2.6, 2.0, 0.9]],
    [32, [3.2, 1.2, 0.35]],
  ];
  if (speed <= stops[0]![0]) return stops[0]![1];
  for (let i = 1; i < stops.length; i++) {
    const [s1, c1] = stops[i]!;
    const [s0, c0] = stops[i - 1]!;
    if (speed <= s1) {
      const t = (speed - s0) / (s1 - s0);
      return [
        c0[0] + (c1[0] - c0[0]) * t,
        c0[1] + (c1[1] - c0[1]) * t,
        c0[2] + (c1[2] - c0[2]) * t,
      ];
    }
  }
  return stops[stops.length - 1]![1];
}

const VS = /* glsl */ `
attribute vec4 aColour;
varying vec4 vColour;
void main() {
  vColour = aColour;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const FS = /* glsl */ `
varying vec4 vColour;
void main() { gl_FragColor = vec4(vColour.rgb * vColour.a, vColour.a); }
`;

export class BallTrail {
  readonly mesh: THREE.Mesh;
  private readonly capacity: number;
  private readonly points: THREE.Vector3[] = [];
  private readonly speeds: number[] = [];
  private readonly positions: Float32Array;
  private readonly colours: Float32Array;
  private readonly side = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly toCamera = new THREE.Vector3();
  width = 0.12;
  length = 28;

  constructor(capacity = 64) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 2 * 3);
    this.colours = new Float32Array(capacity * 2 * 4);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('aColour', new THREE.BufferAttribute(this.colours, 4));
    const index: number[] = [];
    for (let i = 0; i < capacity - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geometry.setIndex(index);
    geometry.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader: VS,
        fragmentShader: FS,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.mesh.frustumCulled = false;
  }

  clear(): void {
    this.points.length = 0;
    this.speeds.length = 0;
    this.mesh.geometry.setDrawRange(0, 0);
  }

  /** Adds the current ball position and rebuilds the ribbon facing `camera`. */
  push(position: THREE.Vector3, speed: number, camera: THREE.Vector3): void {
    const last = this.points[this.points.length - 1];
    if (last && last.distanceToSquared(position) < 1e-4) return;
    this.points.push(position.clone());
    this.speeds.push(speed);
    const max = Math.min(this.capacity, Math.max(2, Math.round(this.length)));
    while (this.points.length > max) {
      this.points.shift();
      this.speeds.shift();
    }
    this.rebuild(camera);
  }

  private rebuild(camera: THREE.Vector3): void {
    const n = this.points.length;
    if (n < 2) {
      this.mesh.geometry.setDrawRange(0, 0);
      return;
    }
    for (let i = 0; i < n; i++) {
      const p = this.points[i] as THREE.Vector3;
      const prev = this.points[Math.max(0, i - 1)] as THREE.Vector3;
      const next = this.points[Math.min(n - 1, i + 1)] as THREE.Vector3;
      this.tangent.subVectors(next, prev).normalize();
      this.toCamera.subVectors(camera, p).normalize();
      this.side.crossVectors(this.tangent, this.toCamera).normalize();
      // 0 at the tail, 1 at the ball.
      const t = i / (n - 1);
      const half = this.width * t;
      const [r, g, b] = trailColour(this.speeds[i] ?? 0);
      const alpha = t * t * 0.85;
      for (let k = 0; k < 2; k++) {
        const s = k === 0 ? -half : half;
        const o = (i * 2 + k) * 3;
        this.positions[o] = p.x + this.side.x * s;
        this.positions[o + 1] = p.y + this.side.y * s;
        this.positions[o + 2] = p.z + this.side.z * s;
        const c = (i * 2 + k) * 4;
        this.colours[c] = r;
        this.colours[c + 1] = g;
        this.colours[c + 2] = b;
        this.colours[c + 3] = alpha;
      }
    }
    const geometry = this.mesh.geometry;
    (geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geometry.getAttribute('aColour') as THREE.BufferAttribute).needsUpdate = true;
    geometry.setDrawRange(0, (n - 1) * 6);
  }
}
