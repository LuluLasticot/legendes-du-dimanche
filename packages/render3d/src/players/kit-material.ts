// The club kit on a 3D character (Phase 3, step 6): one parametric material for the whole body,
// driven by the same `KitSpec` as the 2D kit drawing and the card (D-033). The asset has no
// clothing UVs: regions are worked out once per asset from the skeleton in its rest pose —
// position and normal of every vertex, how much it follows the arm bones, and how far it lies
// along the arm (shoulder → wrist) and the leg (hip → ankle). The shader then cuts the shirt,
// the sleeves, the collar, the shorts and their side trim, the socks and their cuff, the boots,
// skin and hair, draws the shirt's pattern, and prints the crest and sponsor on the chest and
// the number on the back from one texture per team (`kitPrintNode` in @legendes/data).

import * as THREE from 'three';

export type KitPattern = 'plain' | 'stripes' | 'hoops' | 'sash' | 'checks';
export type KitCollar = 'crew' | 'v' | 'polo';

/** Structurally the `KitSpec` of @legendes/data: colours are CSS hex strings. */
export interface CharacterKitSpec {
  readonly pattern: KitPattern;
  readonly body: string;
  readonly stripe: string;
  readonly sleeves: string;
  readonly collar: string;
  readonly collarStyle: KitCollar;
  readonly shorts: string;
  readonly shortsTrim: string;
  readonly socks: string;
  readonly socksCuff: string;
}

/** Everything that makes one player look like himself in his club's kit. */
export interface CharacterLook {
  readonly kit: CharacterKitSpec;
  readonly skin: string;
  /** Short hair colour, or null for a shaved head. */
  readonly hair: string | null;
  /** Shirt number (1–99), or null for none. */
  readonly number: number | null;
  /**
   * The team's print texture (`kitPrintNode`): chest print on the left half, digits 0–9 on the
   * right half (5 × 2 cells). Shared by the whole team; null = no print.
   */
  readonly prints: HTMLCanvasElement | null;
  /** Goalkeeper: long sleeves and gloves of this colour. */
  readonly gloves: string | null;
  readonly boots: string;
}

/**
 * Where the kit's edges fall. Lengths along a limb are fractions (arm: 0 shoulder → 1 wrist;
 * leg: 0 hip joint → 1 ankle), other values are metres. Shared by every character on screen and
 * exposed in `/lab/kits` (feel parameters are never hard-coded).
 */
export interface KitShape {
  sleeveEnd: number;
  longSleeveEnd: number;
  /** Width of the sleeve's cuff, along the arm. */
  cuff: number;
  /** Where the hand starts, along the arm. */
  handStart: number;
  /** Top of the shorts above the hips bone, metres. */
  waist: number;
  shortsHem: number;
  sockTop: number;
  sockCuff: number;
  bootTop: number;
  /** How sideways (|normal.x|) the surface must be to carry the shorts' side trim. */
  trim: number;
  collarWidth: number;
  /** Neckline relative to the neck bone, metres. */
  collarY: number;
  /** Depth of a V neck at the front, metres. */
  vDepth: number;
  /** How far from the neck's axis the neckline reaches (beyond, the shoulders stay shirt). */
  neckRadius: number;
  stripeWidth: number;
  hoopWidth: number;
  sashWidth: number;
  checkSize: number;
  /** Side of the square chest print, metres. */
  printSize: number;
  /** Chest print centre relative to the upper spine bone, metres. */
  printY: number;
  numberHeight: number;
  /** Back number centre relative to the upper spine bone, metres. */
  numberY: number;
  /** Hairline above the head bone (top of the head), metres. */
  hairLine: number;
  /** Hairline at the back of the head, above the head bone, metres. */
  hairBack: number;
  /** Shade of the asset's joint pieces (1 = same as the rest). */
  jointTint: number;
}

export const DEFAULT_KIT_SHAPE: Readonly<KitShape> = {
  sleeveEnd: 0.4,
  longSleeveEnd: 0.97,
  cuff: 0.045,
  handStart: 1.02,
  waist: 0.07,
  shortsHem: 0.4,
  sockTop: 0.6,
  sockCuff: 0.07,
  bootTop: 0.95,
  trim: 0.72,
  collarWidth: 0.03,
  collarY: -0.02,
  vDepth: 0.09,
  neckRadius: 0.1,
  stripeWidth: 0.055,
  hoopWidth: 0.075,
  sashWidth: 0.12,
  checkSize: 0.085,
  printSize: 0.36,
  printY: -0.04,
  numberHeight: 0.2,
  numberY: -0.02,
  hairLine: 0.12,
  hairBack: 0.04,
  jointTint: 0.86,
};

/** Rest-pose landmarks of an asset, model space, metres. */
export interface KitRig {
  readonly hipsY: number;
  readonly hipY: number;
  readonly ankleY: number;
  readonly neckY: number;
  readonly headY: number;
  readonly chestY: number;
  /** Depth of the neck's axis (model z). */
  readonly neckZ: number;
  /** Height of the body, metres. */
  readonly height: number;
  /** False when the bones did not fit the body and the usual proportions were used. */
  readonly fromBones: boolean;
}

const PATTERN_INDEX: Readonly<Record<KitPattern, number>> = {
  plain: 0,
  stripes: 1,
  hoops: 2,
  sash: 3,
  checks: 4,
};
const COLLAR_INDEX: Readonly<Record<KitCollar, number>> = { crew: 0, v: 1, polo: 2 };

const ARM_BONE = /(Left|Right)(Arm|ForeArm|Hand)/;

// ─── Rig: per-vertex kit attributes, computed once per asset ─────────────────────────────────

const rigs = new WeakMap<THREE.Object3D, KitRig>();

/** World position, model space, of a vertex as three skins it (`dir`: a direction instead). */
function skinned(
  mesh: THREE.SkinnedMesh,
  index: number,
  local: THREE.Vector3,
  toModel: THREE.Matrix4,
): THREE.Vector3 {
  return mesh.applyBoneTransform(index, local).applyMatrix4(toModel);
}

/**
 * Adds the kit attributes (`kitRest`, `kitNormal`, `kitLimb`) to every skinned mesh of an
 * asset's template scene and returns its landmarks. Clones share the geometry, so this runs once
 * per asset.
 *
 * Everything is read in the template's own pose, exactly as three draws it: each vertex skinned
 * by its bones (`applyBoneTransform`) and each bone's world position. Nothing relies on the
 * inverse bind matrices, whose space depends on the exporter, and the skeleton is never posed
 * (`Skeleton.pose()` shrank the converted asset a hundredfold). Landmarks that do not fit the
 * body (wrong order, outside it) are replaced by its usual proportions.
 */
export function prepareKitRig(template: THREE.Object3D): KitRig {
  const cached = rigs.get(template);
  if (cached) return cached;

  const meshes: THREE.SkinnedMesh[] = [];
  template.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(object as THREE.SkinnedMesh);
  });
  template.updateMatrixWorld(true);
  const rootInv = template.matrixWorld.clone().invert();

  // Vertices and normals as drawn, model space.
  const v = new THREE.Vector3();
  const e = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  const drawn = meshes.map((mesh) => {
    const toModel = mesh.matrixWorld.clone().premultiply(rootInv);
    normalMatrix.getNormalMatrix(toModel);
    const positions = mesh.geometry.getAttribute('position');
    const normals = mesh.geometry.getAttribute('normal');
    const count = positions.count;
    const rest = new Float32Array(count * 3);
    const restNormal = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(positions, i);
      const p = skinned(mesh, i, v.clone(), toModel);
      rest.set([p.x, p.y, p.z], i * 3);
      // The normal skinned like the surface: a point a little along it, minus the vertex.
      let n = new THREE.Vector3(0, 1, 0);
      if (normals) {
        e.fromBufferAttribute(normals, i);
        const step = Math.max(1e-4, v.length() * 1e-3);
        n = skinned(mesh, i, v.clone().addScaledVector(e, step), toModel).sub(p);
      }
      // A degenerate normal (pole of a lathe, welded seam) would be NaN in the shader.
      if (n.lengthSq() < 1e-20) n.set(0, 1, 0);
      n.normalize();
      restNormal.set([n.x, n.y, n.z], i * 3);
    }
    return { mesh, rest, restNormal, count };
  });

  const box = new THREE.Box3();
  for (const { rest } of drawn) {
    for (let i = 0; i < rest.length; i += 3) box.expandByPoint(v.fromArray(rest, i));
  }
  const height = Math.max(1e-3, box.max.y - box.min.y);
  const at = (k: number): number => box.min.y + height * k;

  /** Mean world position of the named bones (model space), or null when one is missing. */
  const bone = (...names: readonly string[]): THREE.Vector3 | null => {
    const sum = new THREE.Vector3();
    for (const name of names) {
      const found = template.getObjectByName(`mixamorig${name}`);
      if (!found) return null;
      sum.add(found.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInv));
    }
    return sum.divideScalar(names.length);
  };
  const read = {
    hips: bone('Hips'),
    hip: bone('LeftUpLeg', 'RightUpLeg'),
    ankle: bone('LeftFoot', 'RightFoot'),
    chest: bone('Spine2'),
    neck: bone('Neck'),
    head: bone('Head'),
    shoulders: [bone('LeftArm'), bone('RightArm')],
    wrists: [bone('LeftHand'), bone('RightHand')],
  };
  const inside = (p: THREE.Vector3 | null): p is THREE.Vector3 =>
    p !== null &&
    box
      .clone()
      .expandByScalar(height * 0.05)
      .containsPoint(p);
  const fits =
    [
      read.hips,
      read.hip,
      read.ankle,
      read.chest,
      read.neck,
      read.head,
      ...read.shoulders,
      ...read.wrists,
    ].every(inside) &&
    read.ankle!.y < read.hip!.y &&
    read.hip!.y <= read.hips!.y + height * 0.02 &&
    read.hips!.y < read.chest!.y &&
    read.chest!.y < read.neck!.y &&
    read.neck!.y < read.head!.y;
  if (!fits) {
    console.warn('[kit] landmarks from the bones do not fit the body: using its proportions', {
      height,
      read,
    });
  }
  const guess = (x: number, k: number): THREE.Vector3 => new THREE.Vector3(x, at(k), 0);
  const w = height;
  const hips = fits ? read.hips! : guess(0, 0.555);
  const hip = fits ? read.hip! : guess(0, 0.515);
  const ankle = fits ? read.ankle! : guess(0, 0.05);
  const chest = fits ? read.chest! : guess(0, 0.75);
  const neck = fits ? read.neck! : guess(0, 0.833);
  const head = fits ? read.head! : guess(0, 0.88);
  // Without bones that fit, arms are guessed sideways (T pose).
  const shoulders = fits
    ? [read.shoulders[0]!, read.shoulders[1]!]
    : [guess(0.1 * w, 0.795), guess(-0.1 * w, 0.795)];
  const wrists = fits
    ? [read.wrists[0]!, read.wrists[1]!]
    : [guess(0.39 * w, 0.795), guess(-0.39 * w, 0.795)];

  const rig: KitRig = {
    hipsY: hips.y,
    hipY: hip.y,
    ankleY: ankle.y,
    neckY: neck.y,
    headY: head.y,
    chestY: chest.y,
    neckZ: neck.z,
    height,
    fromBones: fits,
  };

  const d = new THREE.Vector3();
  const legSpan = Math.max(1e-3, hip.y - ankle.y);
  for (const { mesh, rest, restNormal, count } of drawn) {
    const geometry = mesh.geometry;
    if (geometry.getAttribute('kitRest')) continue;
    const skinIndex = geometry.getAttribute('skinIndex');
    const skinWeight = geometry.getAttribute('skinWeight');
    const isArm = mesh.skeleton.bones.map((b) => ARM_BONE.test(b.name));
    const limb = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      v.fromArray(rest, i * 3);
      let arm = 0;
      if (skinIndex && skinWeight) {
        for (let k = 0; k < 4; k++) {
          if (isArm[skinIndex.getComponent(i, k)]) arm += skinWeight.getComponent(i, k);
        }
      }
      // Along the nearer arm: 0 at the shoulder joint, 1 at the wrist.
      const side = v.distanceToSquared(shoulders[0]!) <= v.distanceToSquared(shoulders[1]!) ? 0 : 1;
      const shoulder = shoulders[side]!;
      d.subVectors(wrists[side]!, shoulder);
      const armT = d.dot(v.clone().sub(shoulder)) / Math.max(1e-9, d.lengthSq());
      const legT = (hip.y - v.y) / legSpan;
      limb.set([arm, armT, legT], i * 3);
    }
    geometry.setAttribute('kitRest', new THREE.BufferAttribute(rest, 3));
    geometry.setAttribute('kitNormal', new THREE.BufferAttribute(restNormal, 3));
    geometry.setAttribute('kitLimb', new THREE.BufferAttribute(limb, 3));
  }
  rigs.set(template, rig);
  return rig;
}

// ─── Shader ───────────────────────────────────────────────────────────────────────────────────

const VERTEX_HEAD = /* glsl */ `
attribute vec3 kitRest;
attribute vec3 kitNormal;
attribute vec3 kitLimb;
varying vec3 vKitRest;
varying vec3 vKitNormal;
varying vec3 vKitLimb;
`;

const VERTEX_BODY = /* glsl */ `
vKitRest = kitRest;
vKitNormal = kitNormal;
vKitLimb = kitLimb;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform vec3 kBody;
uniform vec3 kStripe;
uniform vec3 kSleeves;
uniform vec3 kCollar;
uniform vec3 kShorts;
uniform vec3 kTrim;
uniform vec3 kSocks;
uniform vec3 kCuff;
uniform vec3 kSkin;
uniform vec3 kHair;
uniform vec3 kBoots;
uniform vec3 kHands;
uniform vec4 kStyle;   // pattern, collar style, hair, long sleeves
uniform vec4 kNumber;  // tens (-1 none), units (-1 none), has prints, joint piece
uniform vec4 kRig1;    // hips y, hip joint y, ankle y, neck y
uniform vec4 kRig2;    // head y, chest y, neck z
uniform vec4 kShape1;  // sleeve end, long sleeve end, cuff, hand start
uniform vec4 kShape2;  // waist, shorts hem, sock top, sock cuff
uniform vec4 kShape3;  // boot top, trim, collar width, collar y
uniform vec4 kShape4;  // stripe, hoop, sash, check
uniform vec4 kShape5;  // print size, print y, number height, number y
uniform vec4 kShape6;  // hair line, hair back, v depth, joint tint
uniform vec4 kShape7;  // neck radius
uniform sampler2D kPrints;
varying vec3 vKitRest;
varying vec3 vKitNormal;
varying vec3 vKitLimb;

// 1 above the edge, 0 below, antialiased over one pixel.
float kitStep(float edge, float x) {
  float w = max(fwidth(x), 1e-4);
  return smoothstep(edge - w, edge + w, x);
}

// Triangle wave: 1 at multiples of 2·width, 0 halfway between (stripes without seams).
float kitTri(float x, float width) {
  return abs(fract(x / (2.0 * width)) * 2.0 - 1.0);
}

float kitPattern(vec3 p) {
  int pattern = int(kStyle.x + 0.5);
  float y = p.y - kRig2.y;
  if (pattern == 1) return 1.0 - kitStep(0.5, kitTri(p.x, kShape4.x));
  if (pattern == 2) return 1.0 - kitStep(0.5, kitTri(y, kShape4.y));
  if (pattern == 3) return 1.0 - kitStep(kShape4.z * 0.5, abs(p.x + y) * 0.7071);
  if (pattern == 4) {
    float a = kitStep(0.5, kitTri(p.x, kShape4.w));
    float b = kitStep(0.5, kitTri(y, kShape4.w));
    return a * b + (1.0 - a) * (1.0 - b);
  }
  return 0.0;
}

vec4 kitDigit(float digit, vec2 uv) {
  float col = mod(digit, 5.0);
  float row = floor(digit / 5.0);
  vec2 at = vec2(0.5 + (col + uv.x) * 0.1, 0.5 - 0.5 * row + 0.5 * uv.y);
  return texture2D(kPrints, at);
}

// Colour and roughness of the kit at this point of the body.
vec3 kitColour(out float rough) {
  vec3 p = vKitRest;
  vec3 n = normalize(vKitNormal);
  float arm = kitStep(0.5, vKitLimb.x);
  float armT = vKitLimb.y;
  float legT = vKitLimb.z;
  float neckY = kRig1.w + kShape3.w;

  // Shirt: body and pattern.
  vec3 col = mix(kBody, kStripe, kitPattern(p));
  rough = 0.74;

  // Prints: crest and sponsor on the chest, number on the back.
  if (kNumber.z > 0.5) {
    float size = kShape5.x;
    vec2 front = vec2(p.x / size + 0.5, (p.y - kRig2.y - kShape5.y) / size + 0.5);
    if (n.z > 0.0 && all(greaterThan(front, vec2(0.0))) && all(lessThan(front, vec2(1.0)))) {
      vec4 print = texture2D(kPrints, vec2(front.x * 0.5, front.y));
      col = mix(col, print.rgb, print.a * smoothstep(0.05, 0.35, n.z));
    }
    float h = kShape5.z;
    float v = (p.y - (kRig2.y + kShape5.w - 0.5 * h)) / h;
    if (n.z < 0.0 && v > 0.0 && v < 1.0) {
      float w = h * 0.4;
      float gap = h * 0.05;
      float digit = -1.0;
      float u = 0.0;
      if (kNumber.x >= 0.0) {
        if (p.x >= 0.5 * gap && p.x <= 0.5 * gap + w) { digit = kNumber.x; u = (0.5 * gap + w - p.x) / w; }
        else if (p.x <= -0.5 * gap && p.x >= -0.5 * gap - w) { digit = kNumber.y; u = (-0.5 * gap - p.x) / w; }
      } else if (kNumber.y >= 0.0 && abs(p.x) <= 0.5 * w) {
        digit = kNumber.y;
        u = (0.5 * w - p.x) / w;
      }
      if (digit >= 0.0) {
        vec4 print = kitDigit(digit, vec2(u, v));
        col = mix(col, print.rgb, print.a * smoothstep(0.05, 0.35, -n.z));
      }
    }
  }

  // Neckline: the collar band, then skin. A V neck dips at the front; a polo's band is wider.
  int collarStyle = int(kStyle.y + 0.5);
  float band = kShape3.z * (collarStyle == 2 ? 1.7 : 1.0);
  float line = neckY;
  if (collarStyle == 1 && n.z > 0.15) line -= kShape6.z * max(0.0, 1.0 - abs(p.x) / (kShape6.z * 0.8));
  // Only around the neck: further out, the top of the shoulders stays shirt (the head, above
  // them, is skin whatever its width).
  float around = max(
    1.0 - kitStep(kShape7.x, length(vec2(p.x, p.z - kRig2.z))),
    kitStep(kRig2.x - 0.04, p.y)
  );
  col = mix(col, kCollar, kitStep(line - band, p.y) * around);
  float bare = kitStep(line, p.y) * around;
  col = mix(col, kSkin, bare);
  rough = mix(rough, 0.55, bare);
  // Hair: over the top of the head, lower at the back.
  if (kStyle.z > 0.5) {
    float top = kitStep(kRig2.x + kShape6.x, p.y);
    float back = kitStep(kRig2.x + kShape6.y, p.y) * kitStep(0.15, -n.z);
    float hair = max(top, back) * kitStep(kRig2.x - 0.02, p.y);
    col = mix(col, kHair, hair);
    rough = mix(rough, 0.85, hair);
  }

  // Below the waist: shorts (side trim), bare knees, socks (cuff), boots.
  float lower = 1.0 - kitStep(kRig1.x + kShape2.x, p.y);
  vec3 leg = mix(kShorts, kTrim, step(0.0, p.x * n.x) * kitStep(kShape3.y, abs(n.x)));
  float legRough = 0.6;
  float knee = kitStep(kShape2.y, legT);
  leg = mix(leg, kSkin, knee);
  legRough = mix(legRough, 0.55, knee);
  float sock = kitStep(kShape2.z, legT);
  leg = mix(leg, mix(kCuff, kSocks, kitStep(kShape2.z + kShape2.w, legT)), sock);
  legRough = mix(legRough, 0.88, sock);
  float boot = kitStep(kShape3.x, legT);
  leg = mix(leg, kBoots, boot);
  legRough = mix(legRough, 0.32, boot);
  col = mix(col, leg, lower);
  rough = mix(rough, legRough, lower);

  // Arms: sleeve, its cuff, the bare forearm, the hand (or the keeper's glove).
  float end = kStyle.w > 0.5 ? kShape1.y : kShape1.x;
  vec3 limb = mix(kSleeves, kCollar, kitStep(end - kShape1.z, armT));
  float limbRough = 0.74;
  float forearm = kitStep(end, armT);
  limb = mix(limb, kSkin, forearm);
  limbRough = mix(limbRough, 0.55, forearm);
  float hand = kitStep(kShape1.w, armT);
  limb = mix(limb, kHands, hand);
  limbRough = mix(limbRough, kStyle.w > 0.5 ? 0.62 : 0.55, hand);
  col = mix(col, limb, arm);
  rough = mix(rough, limbRough, arm);

  return col * mix(1.0, kShape6.w, kNumber.w);
}
`;

// ─── Uniforms ─────────────────────────────────────────────────────────────────────────────────

/** Shape uniforms: shared by every kit material, so the lab's sliders move every character. */
const shapeUniforms = {
  kShape1: { value: new THREE.Vector4() },
  kShape2: { value: new THREE.Vector4() },
  kShape3: { value: new THREE.Vector4() },
  kShape4: { value: new THREE.Vector4() },
  kShape5: { value: new THREE.Vector4() },
  kShape6: { value: new THREE.Vector4() },
  kShape7: { value: new THREE.Vector4() },
};

/** Sets where the kit's edges fall, for every character (see `KitShape`). */
export function setKitShape(shape: Readonly<KitShape>): void {
  shapeUniforms.kShape1.value.set(
    shape.sleeveEnd,
    shape.longSleeveEnd,
    shape.cuff,
    shape.handStart,
  );
  shapeUniforms.kShape2.value.set(shape.waist, shape.shortsHem, shape.sockTop, shape.sockCuff);
  shapeUniforms.kShape3.value.set(shape.bootTop, shape.trim, shape.collarWidth, shape.collarY);
  shapeUniforms.kShape4.value.set(
    shape.stripeWidth,
    shape.hoopWidth,
    shape.sashWidth,
    shape.checkSize,
  );
  shapeUniforms.kShape5.value.set(shape.printSize, shape.printY, shape.numberHeight, shape.numberY);
  shapeUniforms.kShape6.value.set(shape.hairLine, shape.hairBack, shape.vDepth, shape.jointTint);
  shapeUniforms.kShape7.value.set(shape.neckRadius, 0, 0, 0);
}
setKitShape(DEFAULT_KIT_SHAPE);

const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
blank.needsUpdate = true;

/** One texture per print canvas (a team shares its canvas). */
const printTextures = new WeakMap<HTMLCanvasElement, THREE.CanvasTexture>();

function printTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  let texture = printTextures.get(canvas);
  if (!texture) {
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    printTextures.set(canvas, texture);
  }
  return texture;
}

type LookUniforms = ReturnType<typeof lookUniforms>;

function lookUniforms() {
  const colour = () => ({ value: new THREE.Color() });
  return {
    kBody: colour(),
    kStripe: colour(),
    kSleeves: colour(),
    kCollar: colour(),
    kShorts: colour(),
    kTrim: colour(),
    kSocks: colour(),
    kCuff: colour(),
    kSkin: colour(),
    kHair: colour(),
    kBoots: colour(),
    kHands: colour(),
    kStyle: { value: new THREE.Vector4() },
    kRig1: { value: new THREE.Vector4() },
    kRig2: { value: new THREE.Vector4() },
    kPrints: { value: blank as THREE.Texture },
  };
}

/**
 * The materials of one character: the body and the asset's joint pieces share the look's
 * uniforms (one `setLook` recolours both) and one shader program across every character.
 */
export class KitMaterials {
  readonly body: THREE.MeshStandardMaterial;
  readonly joints: THREE.MeshStandardMaterial;
  private readonly uniforms: LookUniforms = lookUniforms();

  constructor(rig: KitRig, look: CharacterLook) {
    this.uniforms.kRig1.value.set(rig.hipsY, rig.hipY, rig.ankleY, rig.neckY);
    this.uniforms.kRig2.value.set(rig.headY, rig.chestY, rig.neckZ, 0);
    this.body = this.material(0);
    this.joints = this.material(1);
    this.setLook(look);
  }

  private material(joint: number): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.02 });
    const number = { value: new THREE.Vector4() };
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms, shapeUniforms, { kNumber: number });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_BODY}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\nfloat kitRough;\ndiffuseColor.rgb = kitColour(kitRough);',
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = kitRough;',
        );
    };
    material.customProgramCacheKey = () => 'ld-kit-1';
    // Each material keeps its own kNumber (the joint flag lives in .w), sharing x–z.
    material.userData['kNumber'] = number;
    number.value.w = joint;
    return material;
  }

  setLook(look: CharacterLook): void {
    const u = this.uniforms;
    const { kit } = look;
    u.kBody.value.set(kit.body);
    u.kStripe.value.set(kit.stripe);
    u.kSleeves.value.set(kit.sleeves);
    u.kCollar.value.set(kit.collar);
    u.kShorts.value.set(kit.shorts);
    u.kTrim.value.set(kit.shortsTrim);
    u.kSocks.value.set(kit.socks);
    u.kCuff.value.set(kit.socksCuff);
    u.kSkin.value.set(look.skin);
    u.kHair.value.set(look.hair ?? look.skin);
    u.kBoots.value.set(look.boots);
    u.kHands.value.set(look.gloves ?? look.skin);
    u.kStyle.value.set(
      PATTERN_INDEX[kit.pattern],
      COLLAR_INDEX[kit.collarStyle],
      look.hair === null ? 0 : 1,
      look.gloves === null ? 0 : 1,
    );
    const number = look.number === null ? null : Math.max(1, Math.min(99, Math.round(look.number)));
    const tens = number !== null && number >= 10 ? Math.floor(number / 10) : -1;
    const units = number === null ? -1 : number % 10;
    const prints = look.prints === null ? 0 : 1;
    for (const material of [this.body, this.joints]) {
      const value = (material.userData['kNumber'] as { value: THREE.Vector4 }).value;
      value.set(tens, units, prints, value.w);
    }
    u.kPrints.value = look.prints === null ? blank : printTexture(look.prints);
  }

  dispose(): void {
    this.body.dispose();
    this.joints.dispose();
  }
}

/** A plain two-colour kit (scenes that have no club yet): shirt, shorts, socks in the shirt. */
export function plainLook(shirt: number, shorts: number, skin = '#c58c64'): CharacterLook {
  const s = `#${shirt.toString(16).padStart(6, '0')}`;
  const b = `#${shorts.toString(16).padStart(6, '0')}`;
  return {
    kit: {
      pattern: 'plain',
      body: s,
      stripe: s,
      sleeves: s,
      collar: b,
      collarStyle: 'crew',
      shorts: b,
      shortsTrim: s,
      socks: s,
      socksCuff: b,
    },
    skin,
    hair: '#2a1d14',
    number: null,
    prints: null,
    gloves: null,
    boots: '#16181b',
  };
}
