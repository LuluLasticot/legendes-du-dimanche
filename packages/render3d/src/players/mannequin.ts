// A stand-in character built in code: tapered capsules on a skeleton with the Mixamo bone names
// of the real asset, in its T rest pose, 1.8 m tall, facing +Z, with one looping idle clip.
// The real character (D-019) is not in the public repository; without it, `/lab/kits` and the
// kit tests still have a body to dress, with the same bones the kit shader reads.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CharacterAsset, CharacterMeta } from './character-asset.ts';

type V3 = readonly [number, number, number];

/** Rest positions (model space, metres) and parents of the bones. */
const BONES: ReadonlyArray<readonly [name: string, parent: string | null, at: V3]> = [
  ['Hips', null, [0, 1.0, 0]],
  ['Spine', 'Hips', [0, 1.1, 0.005]],
  ['Spine1', 'Spine', [0, 1.22, 0.01]],
  ['Spine2', 'Spine1', [0, 1.35, 0]],
  ['Neck', 'Spine2', [0, 1.5, -0.01]],
  ['Head', 'Neck', [0, 1.58, 0]],
  ['HeadTop_End', 'Head', [0, 1.8, 0.01]],
  ...(['Left', 'Right'] as const).flatMap((side) => {
    const s = side === 'Left' ? 1 : -1;
    return [
      [`${side}Shoulder`, 'Spine2', [0.06 * s, 1.44, -0.01]],
      [`${side}Arm`, `${side}Shoulder`, [0.18 * s, 1.43, -0.015]],
      [`${side}ForeArm`, `${side}Arm`, [0.45 * s, 1.43, -0.02]],
      [`${side}Hand`, `${side}ForeArm`, [0.7 * s, 1.43, -0.015]],
      [`${side}HandMiddle1`, `${side}Hand`, [0.8 * s, 1.43, -0.01]],
      [`${side}UpLeg`, 'Hips', [0.09 * s, 0.93, 0]],
      [`${side}Leg`, `${side}UpLeg`, [0.095 * s, 0.52, 0.005]],
      [`${side}Foot`, `${side}Leg`, [0.1 * s, 0.09, -0.02]],
      [`${side}ToeBase`, `${side}Foot`, [0.1 * s, 0.025, 0.11]],
      [`${side}Toe_End`, `${side}ToeBase`, [0.1 * s, 0.025, 0.19]],
    ] as const;
  }),
];

interface Piece {
  readonly from: V3;
  readonly to: V3;
  readonly r0: number;
  readonly r1: number;
  readonly bone: string;
  /** Bone the far end blends into (half and half at the joint). */
  readonly next?: string;
  /** Cross-section squash across (x) and front-back (z), for the trunk. */
  readonly squash?: readonly [number, number];
}

const at = (name: string): V3 => BONES.find(([n]) => n === name)![2];

function pieces(): Piece[] {
  const list: Piece[] = [
    {
      from: [0, 0.96, 0],
      to: at('Spine'),
      r0: 0.13,
      r1: 0.14,
      bone: 'Hips',
      next: 'Spine',
      squash: [1, 0.7],
    },
    {
      from: at('Spine'),
      to: at('Spine1'),
      r0: 0.14,
      r1: 0.15,
      bone: 'Spine',
      next: 'Spine1',
      squash: [1, 0.66],
    },
    {
      from: at('Spine1'),
      to: at('Spine2'),
      r0: 0.15,
      r1: 0.17,
      bone: 'Spine1',
      next: 'Spine2',
      squash: [1, 0.64],
    },
    {
      from: at('Spine2'),
      to: [0, 1.47, -0.01],
      r0: 0.17,
      r1: 0.12,
      bone: 'Spine2',
      next: 'Neck',
      squash: [1, 0.62],
    },
    { from: at('Neck'), to: [0, 1.6, 0], r0: 0.055, r1: 0.05, bone: 'Neck', next: 'Head' },
    {
      from: [0, 1.62, 0.01],
      to: [0, 1.76, 0.015],
      r0: 0.095,
      r1: 0.085,
      bone: 'Head',
      squash: [0.92, 1],
    },
  ];
  for (const side of ['Left', 'Right'] as const) {
    const s = side === 'Left' ? 1 : -1;
    list.push(
      {
        from: [0.08 * s, 1.43, -0.01],
        to: at(`${side}Arm`),
        r0: 0.06,
        r1: 0.065,
        bone: `${side}Shoulder`,
        next: `${side}Arm`,
      },
      {
        from: at(`${side}Arm`),
        to: at(`${side}ForeArm`),
        r0: 0.058,
        r1: 0.044,
        bone: `${side}Arm`,
        next: `${side}ForeArm`,
      },
      {
        from: at(`${side}ForeArm`),
        to: at(`${side}Hand`),
        r0: 0.044,
        r1: 0.032,
        bone: `${side}ForeArm`,
        next: `${side}Hand`,
      },
      {
        from: at(`${side}Hand`),
        to: [0.82 * s, 1.43, -0.01],
        r0: 0.038,
        r1: 0.03,
        bone: `${side}Hand`,
        squash: [1, 0.55],
      },
      {
        from: [0.09 * s, 0.97, 0],
        to: at(`${side}Leg`),
        r0: 0.09,
        r1: 0.06,
        bone: `${side}UpLeg`,
        next: `${side}Leg`,
      },
      {
        from: at(`${side}Leg`),
        to: at(`${side}Foot`),
        r0: 0.058,
        r1: 0.038,
        bone: `${side}Leg`,
        next: `${side}Foot`,
      },
      {
        from: [0.1 * s, 0.06, -0.05],
        to: at(`${side}Toe_End`),
        r0: 0.045,
        r1: 0.04,
        bone: `${side}Foot`,
        squash: [0.85, 0.7],
      },
    );
  }
  return list;
}

const UP = new THREE.Vector3(0, 1, 0);

/** A tapered capsule from `from` to `to`, skinned to its bone (and its child near the end). */
function capsule(piece: Piece, index: ReadonlyMap<string, number>): THREE.BufferGeometry {
  const a = new THREE.Vector3(...piece.from);
  const b = new THREE.Vector3(...piece.to);
  const length = a.distanceTo(b);
  const profile: THREE.Vector2[] = [];
  const caps = 5;
  for (let i = 0; i <= caps; i++) {
    const t = (i / caps) * (Math.PI / 2);
    // Never exactly on the axis: the pole keeps a normal.
    profile.push(
      new THREE.Vector2(Math.max(1e-3, piece.r0 * Math.sin(t)), -piece.r0 * Math.cos(t)),
    );
  }
  const rings = 8;
  for (let i = 1; i < rings; i++) {
    const s = i / rings;
    profile.push(new THREE.Vector2(piece.r0 + (piece.r1 - piece.r0) * s, length * s));
  }
  for (let i = caps; i >= 0; i--) {
    const t = (i / caps) * (Math.PI / 2);
    profile.push(
      new THREE.Vector2(Math.max(1e-3, piece.r1 * Math.sin(t)), length + piece.r1 * Math.cos(t)),
    );
  }
  const geometry = new THREE.LatheGeometry(profile, 18);
  geometry.deleteAttribute('uv');
  if (piece.squash) geometry.scale(piece.squash[0], 1, piece.squash[1]);

  // Skin weights from the height along the piece, before it is oriented.
  const position = geometry.getAttribute('position');
  const skinIndex = new Uint16Array(position.count * 4);
  const skinWeight = new Float32Array(position.count * 4);
  const own = index.get(piece.bone) ?? 0;
  const next = piece.next === undefined ? own : (index.get(piece.next) ?? own);
  for (let i = 0; i < position.count; i++) {
    const s = THREE.MathUtils.clamp(position.getY(i) / Math.max(1e-6, length), 0, 1.2);
    const blend = 0.5 * THREE.MathUtils.smoothstep(s, 0.7, 1);
    skinIndex.set([own, next, 0, 0], i * 4);
    skinWeight.set([1 - blend, blend, 0, 0], i * 4);
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));

  const direction = b.clone().sub(a).normalize();
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction));
  geometry.translate(a.x, a.y, a.z);
  return geometry;
}

function idleClip(): THREE.AnimationClip {
  const duration = 2.4;
  const times = [0, 0.6, 1.2, 1.8, 2.4];
  const rot = (axis: V3, angles: readonly number[]): number[] =>
    angles.flatMap((angle) =>
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis), angle).toArray(),
    );
  const track = (bone: string, axis: V3, angles: readonly number[]) =>
    new THREE.QuaternionKeyframeTrack(`mixamorig${bone}.quaternion`, times, rot(axis, angles));
  const arm = 1.25;
  return new THREE.AnimationClip('player_idle', duration, [
    track('LeftArm', [0, 0, 1], [-arm, -arm + 0.03, -arm, -arm + 0.03, -arm]),
    track('RightArm', [0, 0, 1], [arm, arm - 0.03, arm, arm - 0.03, arm]),
    track('LeftForeArm', [0, 1, 0], [-0.25, -0.3, -0.25, -0.3, -0.25]),
    track('RightForeArm', [0, 1, 0], [0.25, 0.3, 0.25, 0.3, 0.25]),
    track('Spine1', [1, 0, 0], [0, 0.025, 0, 0.025, 0]),
    track('Neck', [0, 1, 0], [0, 0.06, 0, -0.06, 0]),
  ]);
}

const CM_PER_M = 100;
let cached: CharacterAsset | null = null;

/** The stand-in character (built once). */
export function createMannequinAsset(): CharacterAsset {
  if (cached) return cached;
  // Built like the converted asset (convert-mixamo.mjs): bones and mesh in centimetres, under a
  // node scaled to metres. What reads the rig must not assume a skeleton in world units.
  const bones = new Map<string, THREE.Bone>();
  for (const [name, parent, position] of BONES) {
    const bone = new THREE.Bone();
    bone.name = `mixamorig${name}`;
    const p = new THREE.Vector3(...position);
    if (parent !== null) p.sub(new THREE.Vector3(...at(parent)));
    bone.position.copy(p).multiplyScalar(CM_PER_M);
    if (parent !== null) bones.get(parent)!.add(bone);
    bones.set(name, bone);
  }
  const list = [...bones.values()];
  const index = new Map([...bones.keys()].map((name, i) => [name, i] as const));
  const merged = mergeGeometries(pieces().map((piece) => capsule(piece, index)));
  if (!merged) throw new Error('mannequin: cannot merge geometry');
  merged.scale(CM_PER_M, CM_PER_M, CM_PER_M);
  merged.computeVertexNormals();

  const scene = new THREE.Group();
  scene.name = 'mannequin';
  const character = new THREE.Group();
  character.name = 'player';
  character.scale.setScalar(1 / CM_PER_M);
  const mesh = new THREE.SkinnedMesh(merged, new THREE.MeshStandardMaterial());
  mesh.name = 'Alpha_Surface';
  const hips = bones.get('Hips')!;
  character.add(hips, mesh);
  scene.add(character);
  scene.updateMatrixWorld(true);
  // Bound like GLTFLoader does, with glTF's convention: identity bind matrix, and inverse bind
  // matrices that take a vertex of the mesh (centimetres) straight to world space.
  const inverses = list.map((bone) => bone.matrixWorld.clone().invert().multiply(mesh.matrixWorld));
  mesh.bind(new THREE.Skeleton(list, inverses), new THREE.Matrix4());

  const clip = idleClip();
  const meta: CharacterMeta = {
    version: 1,
    facing: '+Z',
    triangles: (merged.index?.count ?? merged.getAttribute('position').count) / 3,
    clips: {
      player_idle: {
        duration: clip.duration,
        rootTravel: [0, 0],
        rest: { hands: [0, 0.9, 0.05], head: [0, 1.62, 0], hips: [0, 1, 0] },
      },
    },
  };
  cached = { scene, clips: new Map([[clip.name, clip]]), meta };
  return cached;
}
