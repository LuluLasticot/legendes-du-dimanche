// Converts the Mixamo sources (assets-src/mixamo/*.fbx, not in git) into the runtime character
// asset: one GLB (mesh, shared skeleton, every clip in place) + a metadata JSON with the timings
// the game needs (strike contact, dive extension…).
//
// The character is our modelled footballer rigged by Mixamo (character_footballer.fbx, D-039),
// whose kit zones are named materials; without it, the Mixamo Y Bot (character_ybot.fbx).
//
//   pnpm --filter @legendes/render3d convert:mixamo
//
// Output (gitignored, see docs/DECISIONS.md D-019): apps/web/public/assets/characters/

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  meshopt,
  prune,
  quantize,
  resample,
  simplify,
  weld,
} from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const SOURCE = new URL('../../../assets-src/mixamo/', import.meta.url);
const OUT = new URL('../../../apps/web/public/assets/characters/', import.meta.url);
/** Mixamo works in centimetres. */
const CM = 0.01;
/** Target share of the original triangles (≈ 10–12k triangles per player). */
const SIMPLIFY_RATIO = Number(process.env.SIMPLIFY_RATIO ?? 0.15);
/** A character already within budget (the modelled footballer: ~4.6k) is not simplified. */
const SIMPLIFY_ABOVE = 12_000;
/** Preferred character first. */
const CHARACTERS = ['character_footballer', 'character_ybot'];

// GLTFExporter needs FileReader (browser API) for binary output.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
  readAsDataURL(blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
};

/**
 * Clips to keep, with optional trimming (seconds) of very long takes. `walk`: the clip was made
 * on our footballer (assets-src/blender/build_walkout.py), not downloaded on the Y Bot — its
 * hips are not retargeted, and it keeps its root motion (the walk forward is part of the show).
 */
const CLIPS = {
  player_idle: {},
  player_run: {},
  player_sprint: {},
  player_penalty_kick: {},
  player_shot: {},
  player_pass: {},
  player_header: {},
  player_trip: {},
  defender_slide_tackle: {},
  defender_jump: {},
  gk_idle: {},
  gk_sidestep: {},
  gk_dive_left: {},
  gk_dive_right: {},
  gk_dive_low_left: {},
  gk_dive_low_right: {},
  gk_catch: {},
  gk_scoop: {},
  gk_jump_catch: {},
  gk_body_block_left: {},
  gk_body_block_right: {},
  gk_drop_kick: {},
  gk_overhand_throw: {},
  celebration_victory: {},
  celebration_fist_pump: {},
  celebration_dance: { end: 6 },
  celebration_phone: { end: 6 },
  reaction_disappointed: {},
  walkout_arms_crossed: { walk: true },
  walkout_crest: { walk: true },
  walkout_thumbs_back: { walk: true },
};

const loader = new FBXLoader();
function loadFbx(file) {
  const buffer = readFileSync(new URL(file, SOURCE));
  return loader.parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    '',
  );
}

const files = readdirSync(SOURCE).filter((f) => f.toLowerCase().endsWith('.fbx'));
const fileFor = (name) => files.find((f) => f.replace(/(\.fbx)+$/i, '') === name);

const characterFile = CHARACTERS.map(fileFor).find(Boolean);
if (!characterFile) throw new Error(`no character in assets-src/mixamo (${CHARACTERS.join(', ')})`);
console.log(`Loading character ${characterFile}…`);
const character = loadFbx(characterFile);
character.name = 'player';
// The footballer's second UV map backs up its zones in case Mixamo renamed the materials; it
// kept them, so the map is dead weight.
character.traverse((object) => {
  if (object.isMesh) object.geometry.deleteAttribute('uv1');
});

// The clips were downloaded on the Y Bot: their hips move on the Y Bot's legs. When the
// character's skeleton differs (Mixamo's auto-rig places the joints from the markers), the hips
// track is rescaled to its leg length so the feet stay on the ground.
const restOf = (root, name) => {
  root.updateMatrixWorld(true);
  return root.getObjectByName(`mixamorig${name}`)?.getWorldPosition(new THREE.Vector3()) ?? null;
};
const JOINTS = [
  'Hips',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'Spine2',
  'Neck',
  'Head',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
];
const referenceFile = fileFor('character_ybot');
const reference = referenceFile && referenceFile !== characterFile ? loadFbx(referenceFile) : null;
let legScale = 1;
if (reference) {
  console.log("Skeleton against the clips' (Y Bot), rest pose, metres:");
  let worst = 0;
  for (const joint of JOINTS) {
    const a = restOf(character, joint);
    const b = restOf(reference, joint);
    if (!a || !b) continue;
    const gap = a.distanceTo(b) * CM;
    worst = Math.max(worst, gap);
    console.log(
      `  ${joint.padEnd(12)} ${(a.y * CM).toFixed(3)} vs ${(b.y * CM).toFixed(3)}  gap ${gap.toFixed(3)}`,
    );
  }
  const leg = (root) => restOf(root, 'Hips').y - restOf(root, 'LeftFoot').y;
  legScale = leg(character) / leg(reference);
  console.log(`  hips track scaled ×${legScale.toFixed(3)}`);
  if (worst > 0.04) {
    console.warn(
      `  ⚠ joints up to ${(worst * 100).toFixed(0)} cm away from the clips' skeleton: knees or hips will bend in the wrong place — redo the Mixamo markers (docs/DECISIONS.md D-039)`,
    );
  }
}
const footRest = reference ? restOf(reference, 'LeftFoot').y : 0;
const characterFootRest = reference ? restOf(character, 'LeftFoot').y : 0;

/**
 * Clips made in Blender carry the rig object's own tracks and every bone's position and scale;
 * like Mixamo's, they keep the bones' rotations and the hips' position.
 */
function boneTracksOnly(clip) {
  clip.tracks = clip.tracks.filter(
    (t) =>
      t.name.startsWith('mixamorig') &&
      (t.name.endsWith('.quaternion') || t.name === 'mixamorigHips.position'),
  );
}

/** Removes horizontal root motion (hips x/z); keeps height. Returns the original hips path. */
function stripRootMotion(clip) {
  const hips = clip.tracks.find((t) => t.name === 'mixamorigHips.position');
  if (!hips) return null;
  const v = hips.values;
  // Retarget onto the character's legs: heights measured from the ankles, travel scaled alike.
  for (let i = 0; i < v.length; i += 3) {
    v[i] *= legScale;
    v[i + 1] = characterFootRest + (v[i + 1] - footRest) * legScale;
    v[i + 2] *= legScale;
  }
  const path = { times: Array.from(hips.times), x: [], z: [] };
  const x0 = v[0];
  const z0 = v[2];
  for (let i = 0; i < v.length; i += 3) {
    path.x.push((v[i] - x0) * CM);
    path.z.push((v[i + 2] - z0) * CM);
    v[i] = x0;
    v[i + 2] = z0;
  }
  return path;
}

const clips = [];
const meta = { version: 1, unitsPerMetre: 1, facing: '+Z', clips: {} };

// Pose sampler on the character (root motion already stripped from the clips, but the walks).
const mixer = new THREE.AnimationMixer(character);
const bone = (name) => character.getObjectByName(`mixamorig${name}`);
const bones = {
  hips: bone('Hips'),
  head: bone('Head'),
  leftHand: bone('LeftHand'),
  rightHand: bone('RightHand'),
  leftToe: bone('LeftToeBase'),
  rightToe: bone('RightToeBase'),
};
const world = (object) => object.getWorldPosition(new THREE.Vector3()).multiplyScalar(CM);

function sample(clip, step = 1 / 120) {
  mixer.stopAllAction();
  const action = mixer.clipAction(clip);
  action.reset().play();
  const frames = [];
  for (let t = 0; t <= clip.duration + 1e-6; t += step) {
    mixer.setTime(t);
    character.updateMatrixWorld(true);
    frames.push({
      t,
      hips: world(bones.hips),
      head: world(bones.head),
      hands: world(bones.leftHand).add(world(bones.rightHand)).multiplyScalar(0.5),
      leftToe: world(bones.leftToe),
      rightToe: world(bones.rightToe),
    });
  }
  action.stop();
  mixer.uncacheClip(clip);
  return frames;
}

const round = (v) => Math.round(v * 1000) / 1000;
const vec = (p) => [round(p.x), round(p.y), round(p.z)];

/** Strike contact: the frame where the kicking toe moves fastest (ignoring the clip's ends). */
function strikeContact(frames) {
  let best = { speed: 0, i: 0, foot: 'right' };
  const from = Math.max(1, Math.floor(frames.length * 0.1));
  const to = Math.floor(frames.length * 0.85);
  for (let i = from; i < to; i++) {
    const dt = frames[i].t - frames[i - 1].t;
    for (const foot of ['left', 'right']) {
      const key = `${foot}Toe`;
      const speed = frames[i][key].distanceTo(frames[i - 1][key]) / dt;
      if (speed > best.speed) best = { speed, i, foot };
    }
  }
  const f = frames[best.i];
  return {
    time: round(f.t),
    foot: best.foot,
    position: vec(f[`${best.foot}Toe`]),
    footSpeed: round(best.speed),
  };
}

/** Dive / catch extension: the frame where the hands are furthest from the start pose. */
function handsExtension(frames) {
  const start = frames[0].hands;
  let best = { d: -1, i: 0 };
  frames.forEach((f, i) => {
    const d = f.hands.distanceTo(start) + Math.max(0, f.hands.y - start.y) * 0.5;
    if (d > best.d && f.t < frames[frames.length - 1].t * 0.7) best = { d, i };
  });
  const f = frames[best.i];
  return { time: round(f.t), hands: vec(f.hands) };
}

/**
 * Dive extension from the (removed) root travel: the moment the body has covered 85 % of its
 * sideways flight. The hands alone mislead here: on low dives they reach furthest once the
 * keeper is already lying on the ground, seconds after the save.
 */
function diveExtension(frames, rootPath) {
  const travel = (i) => Math.hypot(rootPath.x[i], rootPath.z[i]);
  const total = travel(rootPath.times.length - 1);
  const i = rootPath.times.findIndex((_, k) => travel(k) >= total * 0.85);
  const t = rootPath.times[Math.max(0, i)];
  const f = frames.reduce((best, fr) => (Math.abs(fr.t - t) < Math.abs(best.t - t) ? fr : best));
  return { time: round(f.t), hands: vec(f.hands) };
}

function highestHead(frames) {
  let best = frames[0];
  for (const f of frames) if (f.head.y > best.head.y) best = f;
  return { time: round(best.t), head: vec(best.head) };
}

for (const [name, options] of Object.entries(CLIPS)) {
  const file = fileFor(name);
  if (!file) {
    console.warn(`  missing ${name}.fbx — skipped`);
    continue;
  }
  const source = loadFbx(file);
  let clip = source.animations[0];
  if (!clip) continue;
  clip.name = name;
  if (options.end !== undefined && clip.duration > options.end) {
    clip = THREE.AnimationUtils.subclip(clip, name, 0, Math.round(options.end * 30), 30);
  }
  if (options.walk) boneTracksOnly(clip);
  const rootPath = options.walk ? null : stripRootMotion(clip);
  const frames = sample(clip);
  const entry = {
    duration: round(clip.duration),
    rootTravel: rootPath ? [round(rootPath.x.at(-1)), round(rootPath.z.at(-1))] : [0, 0],
    rest: { hands: vec(frames[0].hands), head: vec(frames[0].head), hips: vec(frames[0].hips) },
  };
  if (/shot|penalty|pass|tackle/.test(name)) entry.contact = strikeContact(frames);
  if (/^gk_dive/.test(name) && rootPath) entry.extension = diveExtension(frames, rootPath);
  else if (/^gk_(catch|scoop|jump|body)/.test(name)) entry.extension = handsExtension(frames);
  if (/header|jump/.test(name)) entry.apex = highestHead(frames);
  meta.clips[name] = entry;
  clips.push(clip);
  console.log(
    `  ${name.padEnd(24)} ${clip.duration.toFixed(2)}s${entry.contact ? ` contact@${entry.contact.time}s (${entry.contact.foot})` : ''}${entry.extension ? ` extension@${entry.extension.time}s` : ''}`,
  );
}

console.log('Exporting GLB…');
character.scale.setScalar(CM);
character.updateMatrixWorld(true);
const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(character, {
  binary: true,
  animations: clips,
  onlyVisible: false,
});

console.log('Optimising (weld, simplify, resample, quantize, meshopt)…');
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const document = await io.readBinary(new Uint8Array(glb));
const trianglesBefore = countTriangles(document);
await document.transform(
  weld(),
  ...(trianglesBefore > SIMPLIFY_ABOVE
    ? [simplify({ simplifier: MeshoptSimplifier, ratio: SIMPLIFY_RATIO, error: 0.004 })]
    : []),
  resample({ tolerance: 1e-4 }),
  // Zone materials that look alike (shirt and sleeves of the preview kit) keep their names.
  dedup({ keepUniqueNames: true }),
  prune(),
  quantize(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
const trianglesAfter = countTriangles(document);
const out = await io.writeBinary(document);

function countTriangles(doc) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const index = prim.getIndices();
      n += (index ? index.getCount() : prim.getAttribute('POSITION').getCount()) / 3;
    }
  }
  return n;
}

meta.triangles = trianglesAfter;
mkdirSync(OUT, { recursive: true });
writeFileSync(new URL('player.glb', OUT), out);
writeFileSync(new URL('player.meta.json', OUT), `${JSON.stringify(meta, null, 2)}\n`);
console.log(
  `Done: player.glb ${(out.byteLength / 1024 / 1024).toFixed(2)} MB, ${clips.length} clips, triangles ${Math.round(trianglesBefore)} → ${Math.round(trianglesAfter)}`,
);
