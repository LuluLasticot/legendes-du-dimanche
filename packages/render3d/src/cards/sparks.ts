// Bursts of sparks for card reveals: additive points bright enough to bloom, thrown outwards from
// behind the card, slowing down and falling. One draw call; CPU simulation (cosmetic only).

import * as THREE from 'three';

const VS = /* glsl */ `
attribute float aSize; attribute float aLife; attribute vec3 aColor;
varying float vLife; varying vec3 vColor;
uniform float uScale;
void main(){
  vLife = aLife; vColor = aColor;
  vec4 mv = modelViewMatrix*vec4(position, 1.);
  gl_PointSize = aSize*uScale/max(.1, -mv.z)*(.4 + .6*aLife);
  gl_Position = projectionMatrix*mv;
}
`;
const FS = /* glsl */ `
varying float vLife; varying vec3 vColor;
void main(){
  vec2 d = gl_PointCoord - .5;
  float r = length(d);
  float star = exp(-r*r*40.) + .5*exp(-abs(d.x)*60.)*exp(-abs(d.y)*6.) + .5*exp(-abs(d.y)*60.)*exp(-abs(d.x)*6.);
  gl_FragColor = vec4(vColor*star*vLife*3., 1.);
}
`;

interface Spark {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  decay: number;
}

export class Sparks {
  readonly points: THREE.Points;
  private readonly sparks: Spark[] = [];
  private readonly positions: Float32Array;
  private readonly lives: Float32Array;
  private readonly colours: Float32Array;
  private readonly sizes: Float32Array;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;

  constructor(private readonly capacity: number) {
    this.positions = new Float32Array(capacity * 3);
    this.lives = new Float32Array(capacity);
    this.colours = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(this.lives, 1));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colours, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: { uScale: { value: 300 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  /** Pixel scale of the sprites (canvas height in device pixels works well). */
  set scale(value: number) {
    (this.material.uniforms['uScale'] as THREE.IUniform).value = value * 0.12;
  }

  /** Throws `count` sparks of `colour` from around the card (radius `spread`). */
  burst(count: number, colour: THREE.Color, speed = 4, spread = 1.4): void {
    for (let i = 0; i < count && this.sparks.length < this.capacity; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.9);
      this.sparks.push({
        x: Math.cos(a) * spread * 0.5,
        y: Math.sin(a) * spread * 0.7,
        z: -0.2,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s + 1.2,
        vz: (Math.random() - 0.3) * s * 0.6,
        life: 1,
        decay: 0.45 + Math.random() * 0.6,
      });
      const j = this.sparks.length - 1;
      const tint = 0.75 + Math.random() * 0.5;
      this.colours[j * 3] = Math.min(1.6, colour.r * tint + 0.15);
      this.colours[j * 3 + 1] = Math.min(1.6, colour.g * tint + 0.1);
      this.colours[j * 3 + 2] = Math.min(1.6, colour.b * tint);
      this.sizes[j] = 0.6 + Math.random() * 1.4;
    }
  }

  update(dt: number): void {
    let n = 0;
    for (let i = 0; i < this.sparks.length; i++) {
      const p = this.sparks[i] as Spark;
      p.life -= p.decay * dt;
      if (p.life <= 0) continue;
      const drag = Math.exp(-2.2 * dt);
      p.vx *= drag;
      p.vy = p.vy * drag - 2.4 * dt;
      p.vz *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      this.sparks[n] = p;
      this.positions[n * 3] = p.x;
      this.positions[n * 3 + 1] = p.y;
      this.positions[n * 3 + 2] = p.z;
      this.lives[n] = p.life;
      // Colour and size follow the spark to its new slot.
      if (n !== i) {
        this.colours[n * 3] = this.colours[i * 3] ?? 1;
        this.colours[n * 3 + 1] = this.colours[i * 3 + 1] ?? 1;
        this.colours[n * 3 + 2] = this.colours[i * 3 + 2] ?? 1;
        this.sizes[n] = this.sizes[i] ?? 1;
      }
      n++;
    }
    this.sparks.length = n;
    this.geometry.setDrawRange(0, n);
    for (const name of ['position', 'aLife', 'aColor', 'aSize']) {
      (this.geometry.attributes[name] as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  dispose(): void {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
