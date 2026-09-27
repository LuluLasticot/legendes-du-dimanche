// Post-processing shaders (GLSL ES 1 style; Three.js converts them for WebGL 2).
// Ported from Carte du Ciel (shaders/post): Kawase dual-filter bloom, ACES tonemapping,
// vignette, grain, chromatic aberration, flash, letterbox bars, zoom blur, shockwave, lens.

export const GLSL_COMMON = /* glsl */ `
#define PI 3.14159265
#define TAU 6.28318531
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
`;

export const FULLSCREEN_VS = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = position.xy*.5 + .5; gl_Position = vec4(position.xy, 0., 1.); }
`;

export const KAWASE_DOWN_FS = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; uniform float uPrefilter;
varying vec2 vUv;
void main(){
  vec2 o = uTexel*.5;
  vec3 c = texture2D(tSrc, vUv).rgb*4.;
  c += texture2D(tSrc, vUv - o).rgb + texture2D(tSrc, vUv + o).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv - vec2(o.x, -o.y)).rgb;
  c /= 8.;
  if (uPrefilter > .5) {
    float br = max(c.r, max(c.g, c.b));
    float knee = uThreshold*.6;
    float rq = clamp(br - uThreshold + knee, 0., 2.*knee);
    rq = rq*rq/(4.*knee + 1e-4);
    c *= max(rq, br - uThreshold)/max(br, 1e-4);
    c = min(c, vec3(40.));
  }
  gl_FragColor = vec4(c, 1.);
}
`;

export const KAWASE_UP_FS = /* glsl */ `
uniform sampler2D tSrc; uniform sampler2D tAdd; uniform vec2 uTexel;
varying vec2 vUv;
void main(){
  vec2 o = uTexel*.5;
  vec3 c = texture2D(tSrc, vUv + vec2(-o.x*2., 0.)).rgb;
  c += texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb*2.;
  c += texture2D(tSrc, vUv + vec2(0., o.y*2.)).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb*2.;
  c += texture2D(tSrc, vUv + vec2(o.x*2., 0.)).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb*2.;
  c += texture2D(tSrc, vUv + vec2(0., -o.y*2.)).rgb;
  c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb*2.;
  gl_FragColor = vec4(c/12. + texture2D(tAdd, vUv).rgb, 1.);
}
`;

export const COMPOSITE_FS = /* glsl */ `
uniform sampler2D tScene; uniform sampler2D tBloom;
uniform vec2 uRes; uniform float uTime; uniform float uExposure; uniform float uBloomK; uniform float uVig; uniform float uGrain;
uniform float uCA; uniform float uFlash; uniform vec3 uFlashCol; uniform float uBars; uniform float uZoomBlur; uniform float uSat;
uniform vec4 uShock; uniform vec4 uLens;
varying vec2 vUv;
vec3 aces(vec3 x){ return clamp((x*(2.51*x + .03))/(x*(2.43*x + .59) + .14), 0., 1.); }
vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1./2.4)) - .055, step(.0031308, c)); }
void main(){
  vec2 uv = vUv;
  float asp = uRes.x/uRes.y;
  if (uLens.w > 0.) {
    vec2 d = (uv - uLens.xy)*vec2(asp, 1.);
    float r = length(d);
    float def = uLens.w*uLens.z*uLens.z/max(r, uLens.z*.5);
    uv -= normalize(d + 1e-5)*def/vec2(asp, 1.);
  }
  if (uShock.w > 0.) {
    vec2 d = (uv - uShock.xy)*vec2(asp, 1.);
    float r = length(d);
    float k = exp(-pow((r - uShock.z)/.07, 2.))*uShock.w;
    uv -= normalize(d + 1e-5)*k*.045/vec2(asp, 1.);
  }
  vec3 col;
  vec2 dc = uv - .5;
  if (uZoomBlur > .001) {
    col = vec3(0.);
    float jit = hash12(vUv*uRes + fract(uTime)*31.);
    for (int i = 0; i < 16; i++){ float s = 1. - uZoomBlur*(float(i) + jit)/16.*.3; col += texture2D(tScene, .5 + dc*s).rgb; }
    col /= 16.;
  } else if (uCA > .0005) {
    vec2 off = dc*uCA;
    col = vec3(texture2D(tScene, uv + off).r, texture2D(tScene, uv).g, texture2D(tScene, uv - off).b);
  } else col = texture2D(tScene, uv).rgb;
  col += texture2D(tBloom, uv).rgb*uBloomK;
  if (uLens.w > 0.) {
    vec2 d = (vUv - uLens.xy)*vec2(asp, 1.);
    float r = length(d);
    col *= smoothstep(uLens.z*.94, uLens.z*1.04, r);
    col += vec3(1., .9, .78)*exp(-pow((r - uLens.z*1.07)/(uLens.z*.045), 2.))*uLens.w*5.;
  }
  col += uFlashCol*uFlash;
  col *= uExposure;
  col = aces(col);
  float l = dot(col, vec3(.2126, .7152, .0722));
  col = mix(vec3(l), col, uSat);
  vec2 vq = (vUv - .5)*vec2(asp, 1.);
  col *= 1. - uVig*smoothstep(.35, 1.15, length(vq));
  col = toSRGB(col);
  col += (hash12(vUv*uRes + fract(uTime*7.13)*97.) - .5)*uGrain;
  float bar = step(vUv.y, uBars) + step(1. - uBars, vUv.y);
  col = mix(col, vec3(0.), clamp(bar, 0., 1.));
  gl_FragColor = vec4(col, 1.);
}
`;
