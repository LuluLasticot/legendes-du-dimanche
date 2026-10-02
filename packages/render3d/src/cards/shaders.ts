// Shaders of the 3D card (D-035). Adapted from Carte du Ciel (shaders/card): a studio of lights
// reflected by the metal, a holographic film that follows the tilt, glitter, and the effects of a
// reveal (halo, light sweep, flash). The mask drawn from the card's SVG says where each applies:
// red = metal frame, green = holographic background, blue = player and print (kept clean).

export const CARD_COMMON = /* glsl */ `
#define TAU 6.28318531
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz)*p3.zy); }
vec3 spectrum(float x){ return clamp(.5 + .5*cos(TAU*(x + vec3(0., .33, .67))), 0., 1.); }
// Studio: a large softbox behind the viewer, a key light top left, floodlight rim on the right.
vec3 envMap(vec3 R){
  vec2 d0 = R.xy - vec2(-.12, .2);
  float front = exp(-dot(d0, d0)*5.);
  float key = exp(-pow((R.x + .62)*3., 2.) - pow((R.y - .45)*2.2, 2.));
  float rim = exp(-pow((R.x - .72)*4., 2.) - pow(R.y*1.5, 2.));
  float top = smoothstep(.55, 1., R.y);
  return vec3(.03, .034, .045) + vec3(1., .97, .93)*front*1.2 + vec3(1., .95, .88)*key*1.7 + vec3(.72, .85, 1.)*rim*1.15 + vec3(.9, .92, 1.)*top*.45;
}
`;

export const CARD_VS = /* glsl */ `
varying vec2 vUv; varying vec3 vPosV; varying vec3 vNrmV; varying vec3 vTanV; varying vec3 vBitV;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix*vec4(position, 1.);
  vPosV = mv.xyz;
  mat3 m3 = mat3(modelViewMatrix);
  vNrmV = normalize(m3*vec3(0., 0., 1.));
  vTanV = normalize(m3*vec3(1., 0., 0.));
  vBitV = normalize(m3*vec3(0., 1., 0.));
  gl_Position = projectionMatrix*mv;
}
`;

export const CARD_FS = /* glsl */ `
uniform sampler2D uLayout; uniform sampler2D uMask; uniform vec2 uTexel; uniform float uAspect;
uniform vec3 uMetal; uniform float uFoil; uniform float uGlitter; uniform float uGoldHolo;
uniform float uGlow; uniform vec3 uGlowCol; uniform float uFlash; uniform float uDim;
uniform float uHolo; uniform float uSweep; uniform float uTime;
varying vec2 vUv; varying vec3 vPosV; varying vec3 vNrmV; varying vec3 vTanV; varying vec3 vBitV;

float holoStars(vec2 uv){
  vec2 g = uv*vec2(uAspect, 1.)*15.;
  vec2 id = floor(g); vec2 f = fract(g) - .5;
  float h = hash12(id + 2.);
  vec2 d = f - (hash22(id) - .5)*.5;
  float s = exp(-abs(d.x)*55.)*exp(-abs(d.y)*7.) + exp(-abs(d.y)*55.)*exp(-abs(d.x)*7.);
  return s*step(.55, h);
}

void main(){
  vec4 lay = texture2D(uLayout, vUv);
  vec4 msk = texture2D(uMask, vUv);
  vec3 V = normalize(-vPosV);
  vec3 N = normalize(vNrmV), T = normalize(vTanV), B = normalize(vBitV);
  vec3 Vt = vec3(dot(V, T), dot(V, B), dot(V, N));
  vec2 tilt = Vt.xy/max(Vt.z, .25);
  // The frame's bevel from the metal mask's edges.
  float hL = texture2D(uMask, vUv - vec2(uTexel.x*1.5, 0.)).r;
  float hR = texture2D(uMask, vUv + vec2(uTexel.x*1.5, 0.)).r;
  float hD = texture2D(uMask, vUv - vec2(0., uTexel.y*1.5)).r;
  float hU = texture2D(uMask, vUv + vec2(0., uTexel.y*1.5)).r;
  vec3 nt = normalize(vec3((hL - hR)*1.4, (hD - hU)*1.4, 1.));
  vec3 Nf = normalize(nt.x*T + nt.y*B + nt.z*N);
  vec3 Rf = reflect(-V, Nf);
  vec3 Rc = reflect(-V, N);
  float fres = pow(1. - clamp(dot(N, V), 0., 1.), 5.);
  vec3 Lk = normalize(vec3(-.45, .6, .66));

  float metal = msk.r;
  float clean = msk.b;
  float holoA = msk.g*(1. - clean);
  vec3 col = lay.rgb;
  vec3 e = envMap(Rf);

  // Metal: the painted gradient catches the studio's lights as the card turns.
  col = mix(col, col*.6 + e*uMetal*.38, metal*.8);
  col *= .9 + .16*max(dot(Nf, Lk), 0.);

  // Holographic film on the background: a rainbow (gold on the promos) that runs with the tilt.
  float tk = smoothstep(.02, .35, length(tilt));
  float g2 = dot(tilt, normalize(vec2(1., .6)))*2.6 + (vUv.x + vUv.y)*1.4 + uTime*.03;
  vec3 rainbow = spectrum(g2);
  vec3 goldy = mix(vec3(1., .66, .2), vec3(1., .96, .74), spectrum(g2).g);
  vec3 h = mix(rainbow, goldy, uGoldHolo);
  // On a dark card the film must not wash the black out: it lives in the highlights.
  float film = mix(.06 + .42*e.g, max(e.g - .75, 0.)*.9, uGoldHolo);
  col += h*film*holoA*(.15 + .6*tk)*uFoil*uHolo;
  col += h*holoStars(vUv)*.4*(.2 + tk)*holoA*uFoil*uHolo;
  col += h*metal*uFoil*.14*tk*uHolo;

  // Glitter: tiny facets that flash one by one.
  vec2 gc = vUv*vec2(uAspect, 1.)*210.;
  vec2 gid = floor(gc); vec2 gf = fract(gc) - .5;
  float gh = hash12(gid);
  vec3 gn = normalize(vec3((hash22(gid + 3.) - .5)*1.3, 1.));
  vec3 gnV = normalize(gn.x*T + gn.y*B + gn.z*N);
  float sp = pow(max(dot(gnV, normalize(Lk + V)), 0.), 260.) + .6*pow(max(dot(gnV, normalize(vec3(.1, .2, 1.) + V)), 0.), 300.);
  sp *= step(.84, gh)*smoothstep(.4, 0., length(gf));
  col += vec3(1., .88, .6)*sp*3.*uGlitter*(metal + holoA*.35);

  // Lacquer: a specular highlight over the whole card, softer on the player.
  float spec = pow(max(dot(Rc, Lk), 0.), 90.)*.3 + pow(max(dot(Rc, normalize(vec3(.05, .1, 1.))), 0.), 500.)*.14;
  col += vec3(1., .97, .94)*spec*(1. - clean*.5) + envMap(Rc)*fres*.2;

  // Reveal: light sweep, halo from the edges, flash, dimming.
  float sw = exp(-pow((vUv.x*uAspect + vUv.y*.6 - uSweep)*4., 2.));
  col += vec3(1.)*sw*.55*(.3 + metal + holoA*.5);
  vec2 ed = min(vUv, 1. - vUv)*vec2(uAspect, 1.);
  float edge = min(ed.x, ed.y);
  col += uGlowCol*uGlow*(exp(-edge*22.)*1.8 + .04);
  col += vec3(1.)*uFlash;
  col *= 1. - uDim*.74;
  gl_FragColor = vec4(col, 1.);
}
`;

export const EDGE_VS = /* glsl */ `
varying vec3 vPosV; varying vec3 vNrmV;
void main(){
  vec4 mv = modelViewMatrix*vec4(position, 1.);
  vPosV = mv.xyz;
  vNrmV = normalize(normalMatrix*normal);
  gl_Position = projectionMatrix*mv;
}
`;

export const EDGE_FS = /* glsl */ `
uniform vec3 uEdge; uniform float uFoil; uniform float uGlow; uniform vec3 uGlowCol; uniform float uDim;
varying vec3 vPosV; varying vec3 vNrmV;
void main(){
  vec3 V = normalize(-vPosV); vec3 N = normalize(vNrmV);
  vec3 e = envMap(reflect(-V, N));
  vec3 c = uEdge*(.3 + .9*e.g);
  c = mix(c, spectrum(dot(N.xy, vec2(2., 1.5)) + vPosV.y*1.5)*(.3 + e), uFoil*.6);
  c += uGlowCol*uGlow*1.5;
  gl_FragColor = vec4(c*(1. - uDim*.7), 1.);
}
`;

/** Backdrop of the card viewer: a night pitch under a floodlight, beams drifting slowly. */
export const BACKDROP_FS = /* glsl */ `
uniform float uTime; uniform vec3 uTint; uniform float uPower; uniform vec2 uRes;
varying vec2 vUv;
void main(){
  vec2 p = (vUv - vec2(.5, .56))*vec2(uRes.x/uRes.y, 1.);
  float r = length(p);
  vec3 col = mix(vec3(.018, .06, .042), vec3(.004, .012, .009), smoothstep(0., 1.1, r));
  float a = atan(p.x, p.y + 1.4);
  float beams = pow(.5 + .5*cos(a*24. + uTime*.25), 12.)*smoothstep(1.3, .1, r);
  col += uTint*(.02 + .22*uPower)*exp(-r*r*4.);
  col += uTint*beams*(.015 + .12*uPower);
  gl_FragColor = vec4(col, 1.);
}
`;

export const BACKDROP_VS = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, .999, 1.); }
`;
