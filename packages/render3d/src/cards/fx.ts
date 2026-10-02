// Effects of pack opening, ported from Carte du Ciel (render/fx.ts): a pool of additive particles
// (sparks, confetti, converging dust), light rays behind a card or out of a torn pack, and a star
// flare. Cosmetic only: Math.random is fine here.

import * as THREE from 'three';

const PART_VS = /* glsl */ `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
uniform float uPx;
varying vec3 vC; varying float vA;
void main(){
  vec4 mv = modelViewMatrix*vec4(position, 1.);
  gl_Position = projectionMatrix*mv;
  gl_PointSize = aAlpha > .001 ? clamp(aSize*uPx/max(-mv.z, .1), 1., 180.) : 0.;
  vC = aColor; vA = aAlpha;
}
`;
const PART_FS = /* glsl */ `
varying vec3 vC; varying float vA;
void main(){
  vec2 d = gl_PointCoord - .5; float r2 = dot(d, d)*4.;
  float a = exp(-r2*3.5)*.55 + exp(-r2*22.)*1.4;
  gl_FragColor = vec4(vC*a*vA, 1.);
}
`;
const QUAD_VS = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }
`;
const NOISE = /* glsl */ `
#define TAU 6.28318531
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3. - 2.*f);
  return mix(mix(hash12(i), hash12(i + vec2(1.,0.)), u.x), mix(hash12(i + vec2(0.,1.)), hash12(i + vec2(1.,1.)), u.x), u.y); }
float fbm3v(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 3; i++){ s += a*vnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6)*p + 7.3; a *= .5; } return s/.875; }
vec3 spectrum(float x){ return clamp(.5 + .5*cos(TAU*(x + vec3(0., .33, .67))), 0., 1.); }
`;
const RAYS_FS = /* glsl */ `
uniform float uTime; uniform float uInt; uniform float uFan; uniform vec3 uCol; uniform float uPrism;
varying vec2 vUv;
void main(){
  vec2 p = vUv*2. - 1.;
  float r = length(p);
  float a = atan(p.y, p.x);
  float rays = (pow(.5 + .5*sin(a*7. + uTime*.22), 6.)*.6 + pow(.5 + .5*sin(a*17. - uTime*.37 + 1.3), 12.)*.4)*(.55 + .6*fbm3v(vec2(a*2.5, r*2. - uTime*.3)));
  float fall = exp(-r*2.4)*smoothstep(0., .1, r)*smoothstep(1., .72, r);
  float fan = uFan > 0. ? smoothstep(uFan, uFan*.35, abs(atan(p.x, p.y))) : 1.;
  vec3 c = mix(uCol, spectrum(a*.477 + r*.6 - uTime*.05)*1.2, uPrism);
  gl_FragColor = vec4(c*rays*fall*fan*uInt, 1.);
}
`;
const FLARE_FS = /* glsl */ `
uniform vec3 uCol; uniform float uInt;
varying vec2 vUv;
void main(){
  vec2 p = vUv*2. - 1.;
  float r = length(p);
  float core = exp(-r*r*160.)*3. + exp(-r*r*20.)*.7 + exp(-r*4.5)*.22;
  float sp = (exp(-abs(p.y)*110.)*exp(-abs(p.x)*2.4) + exp(-abs(p.x)*110.)*exp(-abs(p.y)*2.4))*.9;
  gl_FragColor = vec4(uCol*(core + sp)*uInt*smoothstep(1., .8, r), 1.);
}
`;

export interface Emit {
  x: number;
  y: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** Linear colour, may exceed 1 to bloom. */
  c?: readonly [number, number, number];
  life?: number;
  drag?: number;
  grav?: number;
  /** Size at birth and at death (world units). */
  s0?: number;
  s1?: number;
  a?: number;
  /** Pull towards the origin (converging dust). */
  attract?: number;
  spin?: number;
}

export class Particles {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly drag: Float32Array;
  private readonly grav: Float32Array;
  private readonly s0: Float32Array;
  private readonly s1: Float32Array;
  private readonly a0: Float32Array;
  private readonly attract: Float32Array;
  private readonly spin: Float32Array;
  private readonly attributes: THREE.BufferAttribute[];
  private readonly material: THREE.ShaderMaterial;
  private head = 0;

  constructor(private readonly max = 3000) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.attract = new Float32Array(max);
    this.spin = new Float32Array(max);
    const geometry = new THREE.BufferGeometry();
    const attr = (array: Float32Array, size: number): THREE.BufferAttribute =>
      new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage);
    this.attributes = [
      attr(this.pos, 3),
      attr(this.col, 3),
      attr(this.size, 1),
      attr(this.alpha, 1),
    ];
    const [p, c, s, a] = this.attributes as [
      THREE.BufferAttribute,
      THREE.BufferAttribute,
      THREE.BufferAttribute,
      THREE.BufferAttribute,
    ];
    geometry.setAttribute('position', p);
    geometry.setAttribute('aColor', c);
    geometry.setAttribute('aSize', s);
    geometry.setAttribute('aAlpha', a);
    this.material = new THREE.ShaderMaterial({
      vertexShader: PART_VS,
      fragmentShader: PART_FS,
      uniforms: { uPx: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  /** Pixels per world unit at distance 1 (canvas height / (2 tan(fov/2))). */
  set pixelScale(value: number) {
    (this.material.uniforms['uPx'] as THREE.IUniform).value = value;
  }

  emit(o: Emit): void {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = o.x;
    this.pos[i3 + 1] = o.y;
    this.pos[i3 + 2] = o.z ?? 0;
    this.vel[i3] = o.vx ?? 0;
    this.vel[i3 + 1] = o.vy ?? 0;
    this.vel[i3 + 2] = o.vz ?? 0;
    const c = o.c ?? [1, 1, 1];
    this.col[i3] = c[0];
    this.col[i3 + 1] = c[1];
    this.col[i3 + 2] = c[2];
    this.life[i] = 0;
    this.maxLife[i] = o.life ?? 1;
    this.drag[i] = o.drag ?? 1.5;
    this.grav[i] = o.grav ?? 0;
    this.s0[i] = o.s0 ?? 0.08;
    this.s1[i] = o.s1 ?? 0;
    this.a0[i] = o.a ?? 1;
    this.attract[i] = o.attract ?? 0;
    this.spin[i] = o.spin ?? 0;
    this.alpha[i] = 0.0001;
  }

  update(dt: number): void {
    for (let i = 0; i < this.max; i++) {
      const max = this.maxLife[i] ?? 0;
      if (max <= 0) continue;
      const life = (this.life[i] ?? 0) + dt;
      this.life[i] = life;
      const t = life / max;
      const i3 = i * 3;
      if (t >= 1) {
        this.maxLife[i] = 0;
        this.alpha[i] = 0;
        continue;
      }
      const dr = Math.exp(-(this.drag[i] ?? 0) * dt);
      let vx = (this.vel[i3] ?? 0) * dr;
      let vy = (this.vel[i3 + 1] ?? 0) * dr - (this.grav[i] ?? 0) * dt;
      let vz = (this.vel[i3 + 2] ?? 0) * dr;
      const x = this.pos[i3] ?? 0;
      const y = this.pos[i3 + 1] ?? 0;
      const z = this.pos[i3 + 2] ?? 0;
      const attract = this.attract[i] ?? 0;
      if (attract) {
        const d = Math.hypot(x, y, z) + 0.05;
        const k = (attract * dt) / (d * d + 0.2);
        vx -= x * k;
        vy -= y * k;
        vz -= z * k;
        const sp = ((this.spin[i] ?? 0) * dt) / (d + 0.3);
        vx += -y * sp;
        vy += x * sp;
      }
      this.vel[i3] = vx;
      this.vel[i3 + 1] = vy;
      this.vel[i3 + 2] = vz;
      this.pos[i3] = x + vx * dt;
      this.pos[i3 + 1] = y + vy * dt;
      this.pos[i3 + 2] = z + vz * dt;
      const fade = Math.min(1, t * 8) * (1 - t) * (1 - t * 0.2);
      this.alpha[i] = (this.a0[i] ?? 1) * fade;
      const s0 = this.s0[i] ?? 0;
      this.size[i] = s0 + ((this.s1[i] ?? 0) - s0) * t;
    }
    for (const a of this.attributes) a.needsUpdate = true;
  }

  clear(): void {
    this.maxLife.fill(0);
    this.alpha.fill(0);
    for (const a of this.attributes) a.needsUpdate = true;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

/** Radial light rays on an additive plane; `fan` narrows them to a cone pointing up (+y). */
export class Rays {
  readonly mesh: THREE.Mesh;
  intensity = 0;
  private readonly material: THREE.ShaderMaterial;

  constructor(size: number, fan = 0) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: QUAD_VS,
      fragmentShader: NOISE + RAYS_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uInt: { value: 0 },
        uFan: { value: fan },
        uCol: { value: new THREE.Color(1, 0.8, 0.5) },
        uPrism: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.material);
    this.mesh.renderOrder = -1;
    this.mesh.visible = false;
  }

  get colour(): THREE.Color {
    return (this.material.uniforms['uCol'] as THREE.IUniform).value as THREE.Color;
  }

  set prism(value: number) {
    (this.material.uniforms['uPrism'] as THREE.IUniform).value = value;
  }

  update(time: number): void {
    (this.material.uniforms['uTime'] as THREE.IUniform).value = time;
    (this.material.uniforms['uInt'] as THREE.IUniform).value = this.intensity;
    this.mesh.visible = this.intensity > 0.002;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

/** A star flare (billboard) — the floodlights, the card becoming a star. */
export class Flare {
  readonly mesh: THREE.Mesh;
  intensity = 0;
  size = 1;
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: QUAD_VS,
      fragmentShader: FLARE_FS,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uCol: { value: new THREE.Color(1, 0.9, 0.7) }, uInt: { value: 0 } },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.renderOrder = 20;
    this.mesh.visible = false;
  }

  get colour(): THREE.Color {
    return (this.material.uniforms['uCol'] as THREE.IUniform).value as THREE.Color;
  }

  update(camera: THREE.Camera): void {
    (this.material.uniforms['uInt'] as THREE.IUniform).value = this.intensity;
    this.mesh.visible = this.intensity > 0.002;
    this.mesh.scale.setScalar(this.size);
    this.mesh.quaternion.copy(camera.quaternion);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
