// The 3D pack, ported from Carte du Ciel (pack/pack.ts): a puffed foil sachet whose top strip
// tears along the finger, curls, then flies off; light leaks out of the tear in the colour of the
// best card inside. Textures come from the pack's SVG (@legendes/ui `packNode`).

import * as THREE from 'three';
import { CARD_COMMON } from './shaders.ts';

export const PACK3D_WIDTH = 2.9;
export const PACK3D_HEIGHT = 4.75;
/** Where the tear strip starts (share of the height from the bottom). */
const STRIP_V0 = 0.82;

const NOISE = /* glsl */ `
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3. - 2.*f);
  return mix(mix(hash12(i), hash12(i + vec2(1.,0.)), u.x), mix(hash12(i + vec2(0.,1.)), hash12(i + vec2(1.,1.)), u.x), u.y); }
float fbm3v(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 3; i++){ s += a*vnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6)*p + 7.3; a *= .5; } return s/.875; }
`;

const TEAR = /* glsl */ `
uniform float uTearOn; uniform float uFront; uniform float uDir; uniform float uTearV[65];
float tearBase(float u){ float x = clamp(u, 0., 1.)*64.; float i = floor(x); int ii = int(i); return mix(uTearV[ii], uTearV[min(ii + 1, 64)], x - i); }
float tearLine(float u){
  return tearBase(u) + .0055*(vnoise(vec2(u*36., 1.3)) - .5) + .0032*(vnoise(vec2(u*130., 4.1)) - .5) + .0016*(vnoise(vec2(u*380., 7.)) - .5);
}
float tornAt(float u){ return uTearOn < .5 ? 0. : (uDir > 0. ? step(u, uFront) : step(uFront, u)); }
float puff(vec2 uv){
  float ex = abs(uv.x*2. - 1.);
  float sx = 1. - pow(ex, 5.);
  float sealB = smoothstep(.05, .13, uv.y);
  float sealT = smoothstep(.955, .87, uv.y);
  float sy = clamp(1. - pow(abs((uv.y - .5)/.46), 3.), 0., 1.);
  return .003 + .028*(1. - pow(ex, 10.))*sealB*sealT + .15*sx*sy*sealB*sealT;
}
`;

const PACK_VS = /* glsl */ `
uniform vec2 uPS; uniform float uFlipU;
varying vec2 vUv; varying vec3 vPosV; varying vec3 vNrmV; varying vec3 vTanV; varying vec3 vBitV;
void main(){
  vUv = uv;
  vec2 g = vec2(uFlipU > .5 ? 1. - uv.x : uv.x, uv.y);
  vec3 pos = vec3(position.xy, puff(g));
  float e = .004;
  float dx = (puff(g + vec2(e, 0.)) - puff(g - vec2(e, 0.)))/(2.*e*uPS.x);
  float dy = (puff(g + vec2(0., e)) - puff(g - vec2(0., e)))/(2.*e*uPS.y);
  if (uFlipU > .5) dx = -dx;
  vec3 nL = normalize(vec3(-dx, -dy, 1.));
  vec4 mv = modelViewMatrix*vec4(pos, 1.);
  vPosV = mv.xyz;
  mat3 m3 = mat3(modelViewMatrix);
  vNrmV = normalize(m3*nL);
  vTanV = normalize(m3*vec3(1., 0., 0.));
  vBitV = normalize(m3*vec3(0., 1., 0.));
  gl_Position = projectionMatrix*mv;
}
`;

const STRIP_VS = /* glsl */ `
uniform vec2 uPS; uniform float uCurl;
varying vec2 vUv; varying vec3 vPosV; varying vec3 vNrmV; varying vec3 vTanV; varying vec3 vBitV;
vec3 peel(vec3 pos, vec2 uv){
  float d = uTearOn > .5 ? (uDir > 0. ? (uFront - uv.x) : (uv.x - uFront))*uPS.x : 0.;
  if (d <= 0.) return pos;
  float lineY = (tearBase(uv.x) - .5)*uPS.y;
  float k = max(uCurl, .0005);
  float xf = (uFront - .5)*uPS.x;
  float phi = k*d;
  float hy = pos.y - lineY;
  float tiltA = min(d*1.1, 1.3)*.6;
  return vec3(xf - uDir*sin(phi)/k, lineY + hy*cos(tiltA) + d*d*.05, pos.z + (1. - cos(phi))/k + hy*sin(tiltA));
}
void main(){
  vUv = uv;
  vec3 p0 = vec3(position.xy, puff(uv));
  vec3 P = peel(p0, uv);
  vec3 Px = peel(p0 + vec3(.01*uPS.x, 0., 0.), uv + vec2(.01, 0.));
  vec3 Py = peel(p0 + vec3(0., .01*uPS.y, 0.), uv + vec2(0., .01));
  vec3 nL = normalize(cross(Px - P, Py - P));
  vec4 mv = modelViewMatrix*vec4(P, 1.);
  vPosV = mv.xyz;
  mat3 m3 = mat3(modelViewMatrix);
  vNrmV = normalize(m3*nL);
  vTanV = normalize(m3*normalize(Px - P));
  vBitV = normalize(m3*normalize(Py - P));
  gl_Position = projectionMatrix*mv;
}
`;

const PACK_FS = /* glsl */ `
uniform sampler2D uTex; uniform sampler2D uMsk; uniform sampler2D uTexB; uniform sampler2D uMskB;
uniform vec3 uTint; uniform float uHolo; uniform float uTime; uniform float uGleam; uniform float uFlipU;
uniform float uLeak; uniform vec3 uLeakCol; uniform float uFade;
varying vec2 vUv; varying vec3 vPosV; varying vec3 vNrmV; varying vec3 vTanV; varying vec3 vBitV;
void main(){
  vec2 guv = vec2(uFlipU > .5 ? 1. - vUv.x : vUv.x, vUv.y);
  float tl = tearLine(guv.x);
  float torn = tornAt(guv.x);
  float above = guv.y - tl;
#ifdef STRIP
  if (torn < .5 || above < 0.) discard;
#else
  if (torn > .5 && above > 0.) discard;
#endif
  vec4 tex; vec4 msk;
#ifdef STRIP
  if (gl_FrontFacing) { tex = texture2D(uTex, vUv); msk = texture2D(uMsk, vUv); }
  else { tex = texture2D(uTexB, vec2(1. - vUv.x, vUv.y)); msk = texture2D(uMskB, vec2(1. - vUv.x, vUv.y)); }
#else
  tex = texture2D(uTex, vUv); msk = texture2D(uMsk, vUv);
#endif
  vec3 V = normalize(-vPosV);
  vec3 N = normalize(vNrmV);
  if (!gl_FrontFacing) N = -N;
  vec3 T = normalize(vTanV), B = normalize(vBitV);
  vec3 Vt = vec3(dot(V, T), dot(V, B), dot(V, N));
  vec2 tilt = Vt.xy/max(Vt.z, .3);
  // Crinkles of the foil, stronger near the seals; the seals' ridges.
  float edgeY = min(guv.y, 1. - guv.y);
  float cr = (vnoise(guv*vec2(7., 11.)) - .5)*.5 + (vnoise(guv*vec2(26., 40.) + 3.) - .5)*.22 + (vnoise(guv*vec2(70., 90.) + 9.) - .5)*.08;
  float crk = .35 + .65*(1. - smoothstep(.06, .22, edgeY)) + .3*(1. - smoothstep(0., .12, min(guv.x, 1. - guv.x)));
  float seal = 1. - smoothstep(.04, .048, edgeY);
  float ridge = sin(guv.x*380.)*seal;
  vec3 Np = normalize(N + (cr*crk*.55 + ridge*.5)*T + cr*crk*.45*B);
  vec3 e = envMap(reflect(-V, Np));
  float fres = pow(1. - clamp(dot(Np, V), 0., 1.), 4.);
  vec3 Lk = normalize(vec3(-.45, .6, .66));
  vec3 ft = mix(uTint, .5 + .5*spectrum(dot(tilt, vec2(1.2, .8))*1.5 + guv.x*1.2 + guv.y*.8 + uTime*.03), uHolo*.7);
  float foil = msk.r;
  vec3 base = tex.rgb;
  vec3 col = base*(.55 + .55*max(dot(Np, Lk), 0.)) + e*base*.55*foil + e*ft*foil*.55 + fres*e*.14;
  col += spectrum(dot(tilt, vec2(1.4, .9))*1.3 + guv.y*2. + guv.x)*msk.g*(.15 + .5*e.g)*.5;
  float gl = exp(-pow((guv.x*.7 + guv.y*.55 - uGleam)*7., 2.));
  col += vec3(1., .98, .95)*gl*(.1 + .6*foil);
  float fw = .0045 + .004*vnoise(vec2(guv.x*90., 2.));
#ifdef STRIP
  float fib = torn*smoothstep(fw, fw*.3, above);
#else
  float fib = torn*smoothstep(fw, fw*.3, -above);
  col += uLeakCol*torn*exp(above*55.)*uLeak*2.4;
#endif
  col = mix(col, vec3(.86, .85, .82)*(.75 + .45*vnoise(vec2(guv.x*500., guv.y*1100.))), fib*.95);
  gl_FragColor = vec4(col*uFade, 1.);
}
`;

const LEAK_VS = /* glsl */ `
varying vec2 vP;
void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position.xy, .12, 1.); }
`;
const LEAK_FS = /* glsl */ `
uniform vec2 uPS; uniform float uLeak; uniform vec3 uLeakCol; uniform float uTime;
varying vec2 vP;
void main(){
  float gu = vP.x/uPS.x + .5;
  float gv = vP.y/uPS.y + .5;
  float tl = tearLine(gu);
  float h = (gv - tl)*uPS.y;
  if (h < 0.) discard;
  float torn = uTearOn < .5 ? 0. : (uDir > 0. ? smoothstep(uFront, uFront - .07, gu) : smoothstep(uFront, uFront + .07, gu));
  float g = exp(-h*8.)*.85 + exp(-h*2.2)*.16;
  float rays = .5 + .5*fbm3v(vec2(gu*16., h*1.4 - uTime*.9));
  float edgeFade = smoothstep(0., .06, gu)*smoothstep(1., .94, gu);
  gl_FragColor = vec4(uLeakCol*g*rays*torn*uLeak*edgeFade*1.5, 1.);
}
`;

export interface Pack3DSources {
  readonly front: TexImageSource;
  readonly frontMask: TexImageSource;
  readonly back: TexImageSource;
  readonly backMask: TexImageSource;
  /** Tint of the foil's reflections. */
  readonly tint: string;
  /** Holographic film on the foil, 0 to 1. */
  readonly holo: number;
  /** The tear line (share of the height from the bottom). */
  readonly tearV: number;
}

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function texture(source: TexImageSource, srgb: boolean): THREE.Texture {
  const t = new THREE.Texture(source);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

export class Pack3D {
  /** Positioned by the scene. */
  readonly group = new THREE.Group();
  /** Tilted by the tear; holds the stack of cards while they are inside. */
  readonly inner = new THREE.Group();
  /** Tear progress, 0 to 1. */
  progress = 0;
  started = false;
  done = false;

  private readonly tearV: number;
  private readonly tearUniforms: Record<string, THREE.IUniform>;
  private readonly common: Record<string, THREE.IUniform>;
  private readonly materials: THREE.ShaderMaterial[];
  private readonly geometries: THREE.BufferGeometry[];
  private readonly textures: THREE.Texture[];
  private readonly strip: THREE.Mesh;
  private readonly stripHolder = new THREE.Group();
  private readonly leak: THREE.Mesh;
  private front = 0;
  private dir = 1;
  private target = 0;
  private yOff = 0;
  private flying = false;
  private flyT = 0;
  private readonly stripVel = new THREE.Vector3();
  private readonly stripAng = new THREE.Vector3();

  constructor(sources: Pack3DSources) {
    this.tearV = sources.tearV;
    this.group.add(this.inner);
    this.tearUniforms = {
      uTearOn: { value: 0 },
      uFront: { value: 0 },
      uDir: { value: 1 },
      uTearV: { value: new Array<number>(65).fill(sources.tearV) },
    };
    this.common = {
      uPS: { value: new THREE.Vector2(PACK3D_WIDTH, PACK3D_HEIGHT) },
      uTime: { value: 0 },
      uGleam: { value: -2 },
      uLeak: { value: 0 },
      uLeakCol: { value: new THREE.Color(1, 0.8, 0.5) },
      uTint: { value: new THREE.Color(sources.tint) },
      uHolo: { value: sources.holo },
      uFade: { value: 1 },
      uCurl: { value: 0.35 },
    };
    const front = texture(sources.front, true);
    const frontMask = texture(sources.frontMask, false);
    const back = texture(sources.back, true);
    const backMask = texture(sources.backMask, false);
    this.textures = [front, frontMask, back, backMask];
    const prefix = CARD_COMMON + NOISE + TEAR;
    const make = (vs: string, fs: string, flip: number, strip = false) =>
      new THREE.ShaderMaterial({
        vertexShader: prefix + vs,
        fragmentShader: prefix + fs,
        defines: strip ? { STRIP: 1 } : {},
        uniforms: {
          ...this.tearUniforms,
          ...this.common,
          uTex: { value: flip ? back : front },
          uMsk: { value: flip ? backMask : frontMask },
          uTexB: { value: back },
          uMskB: { value: backMask },
          uFlipU: { value: flip },
        },
      });
    const frontMat = make(PACK_VS, PACK_FS, 0);
    const backMat = make(PACK_VS, PACK_FS, 1);
    const stripMat = make(STRIP_VS, PACK_FS, 0, true);
    stripMat.side = THREE.DoubleSide;
    const leakMat = new THREE.ShaderMaterial({
      vertexShader: LEAK_VS,
      fragmentShader: prefix + LEAK_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { ...this.tearUniforms, ...this.common },
    });
    this.materials = [frontMat, backMat, stripMat, leakMat];

    const body = new THREE.PlaneGeometry(PACK3D_WIDTH, PACK3D_HEIGHT, 56, 90);
    const frontMesh = new THREE.Mesh(body, frontMat);
    const backMesh = new THREE.Mesh(body, backMat);
    backMesh.rotation.y = Math.PI;
    const bandH = PACK3D_HEIGHT * (1 - STRIP_V0);
    const stripGeometry = new THREE.PlaneGeometry(PACK3D_WIDTH, bandH, 140, 12);
    const sp = stripGeometry.attributes['position'] as THREE.BufferAttribute;
    const su = stripGeometry.attributes['uv'] as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) {
      sp.setY(i, sp.getY(i) + (STRIP_V0 + (1 - STRIP_V0) / 2 - 0.5) * PACK3D_HEIGHT);
      su.setY(i, STRIP_V0 + su.getY(i) * (1 - STRIP_V0));
    }
    this.strip = new THREE.Mesh(stripGeometry, stripMat);
    this.strip.frustumCulled = false;
    this.stripHolder.add(this.strip);
    const leakH = PACK3D_HEIGHT * (1 - STRIP_V0) + 2.2;
    const leakGeometry = new THREE.PlaneGeometry(PACK3D_WIDTH, leakH, 8, 8);
    leakGeometry.translate(0, (STRIP_V0 - 0.5) * PACK3D_HEIGHT + leakH / 2, 0);
    this.leak = new THREE.Mesh(leakGeometry, leakMat);
    this.leak.renderOrder = 5;
    this.geometries = [body, stripGeometry, leakGeometry];
    this.inner.add(frontMesh, backMesh, this.stripHolder, this.leak);
  }

  get leakAmount(): number {
    return (this.common['uLeak'] as THREE.IUniform).value as number;
  }
  set leakAmount(value: number) {
    (this.common['uLeak'] as THREE.IUniform).value = value;
  }
  get leakColour(): THREE.Color {
    return (this.common['uLeakCol'] as THREE.IUniform).value as THREE.Color;
  }
  /** Position of the gleam that sweeps the foil (−2 = off). */
  set gleam(value: number) {
    (this.common['uGleam'] as THREE.IUniform).value = value;
  }
  get tearDirection(): number {
    return this.dir;
  }

  startTear(dir: 1 | -1): void {
    if (this.started) return;
    this.started = true;
    this.dir = dir;
    this.front = dir > 0 ? 0 : 1;
    this.target = this.front;
    (this.tearUniforms['uTearOn'] as THREE.IUniform).value = 1;
    (this.tearUniforms['uDir'] as THREE.IUniform).value = dir;
    (this.tearUniforms['uFront'] as THREE.IUniform).value = this.front;
  }

  /** The finger's position across the width (0–1) and its vertical offset (in heights). */
  pull(u: number, vOff: number): void {
    if (!this.started || this.done) return;
    this.yOff = clamp(vOff, -0.04, 0.04);
    this.target =
      this.dir > 0 ? Math.max(this.target, clamp(u, 0, 1)) : Math.min(this.target, clamp(u, 0, 1));
  }

  /** Advances the tear front; returns how far it went this frame (share of the width). */
  step(dt: number): number {
    if (!this.started || this.done) return 0;
    const maxV = 3.2 * dt;
    const prev = this.front;
    this.front += clamp(this.target - this.front, -maxV, maxV);
    const line = (this.tearUniforms['uTearV'] as THREE.IUniform).value as number[];
    const i0 = Math.round(prev * 64);
    const i1 = Math.round(this.front * 64);
    const lo = Math.min(i0, i1);
    const hi = Math.max(i0, i1);
    for (let i = lo; i <= hi; i++) {
      const prevI = clamp(i - this.dir, 0, 64);
      const want = this.tearV + this.yOff;
      line[i] = i === prevI ? want : lerp(line[prevI] ?? want, want, 0.35);
    }
    const edge = line[this.dir > 0 ? hi : lo] ?? this.tearV;
    for (let i = 0; i <= 64; i++) {
      const ahead = this.dir > 0 ? i > hi : i < lo;
      if (ahead) line[i] = lerp(line[i] ?? this.tearV, edge, 0.25);
    }
    (this.tearUniforms['uFront'] as THREE.IUniform).value = this.front;
    this.progress = this.dir > 0 ? this.front : 1 - this.front;
    (this.common['uCurl'] as THREE.IUniform).value = 0.3 + this.progress * 0.75;
    return Math.abs(this.front - prev);
  }

  /** The tear front in world space. */
  frontWorld(out = new THREE.Vector3()): THREE.Vector3 {
    const u = this.front;
    const line = (this.tearUniforms['uTearV'] as THREE.IUniform).value as number[];
    const v = line[clamp(Math.round(u * 64), 0, 64)] ?? this.tearV;
    out.set((u - 0.5) * PACK3D_WIDTH, (v - 0.5) * PACK3D_HEIGHT, 0.1);
    return this.inner.localToWorld(out);
  }

  /** The strip comes off and flies away with the finger's velocity. */
  fling(vx: number, vy: number): void {
    this.done = true;
    this.flying = true;
    this.front = this.dir > 0 ? 1 : 0;
    (this.tearUniforms['uFront'] as THREE.IUniform).value = this.front;
    const px = (this.front - 0.5) * PACK3D_WIDTH;
    const py = (this.tearV - 0.5) * PACK3D_HEIGHT + 0.15;
    this.stripHolder.position.set(px, py, 0.05);
    this.strip.position.set(-px, -py, -0.05);
    this.stripVel.set(clamp(vx, -9, 9) + this.dir * 2.8, 3.2 + Math.max(0, vy) * 0.4, 1.8);
    this.stripAng.set(
      -2.2 - Math.random(),
      this.dir * (1.2 + Math.random()),
      -this.dir * (2.6 + Math.random() * 1.5),
    );
    this.flyT = 0;
  }

  update(time: number, dt: number): void {
    (this.common['uTime'] as THREE.IUniform).value = time;
    if (!this.flying) return;
    this.flyT += dt;
    this.stripVel.y -= 11 * dt;
    this.stripHolder.position.addScaledVector(this.stripVel, dt);
    this.stripHolder.rotation.x += this.stripAng.x * dt;
    this.stripHolder.rotation.y += this.stripAng.y * dt;
    this.stripHolder.rotation.z += this.stripAng.z * dt;
    const curl = this.common['uCurl'] as THREE.IUniform;
    curl.value = Math.min(2.2, (curl.value as number) + dt * 1.4);
    if (this.flyT > 2.2) {
      this.flying = false;
      this.strip.visible = false;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const m of this.materials) m.dispose();
    for (const g of this.geometries) g.dispose();
    for (const t of this.textures) t.dispose();
  }
}
