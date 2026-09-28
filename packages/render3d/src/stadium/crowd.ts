// The crowd of an amateur Sunday (GDD §7.4: "une tribune d'une trentaine de personnes"): a few
// dozen low-poly spectators in the little stand, regulars leaning on the rail by the buvette and
// a handful standing behind the goal. Three instanced meshes (bodies, heads, arms), so the whole
// crowd costs three draw calls. They sway while waiting, jump with their arms up on a goal and
// put their hands on their heads on a near miss.

import { Rng } from '@legendes/engine';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type CrowdReaction = 'goal' | 'ooh' | 'dismay';

interface Spectator {
  readonly position: THREE.Vector3;
  readonly yaw: number;
  readonly scale: number;
  /** Idle rhythm. */
  readonly phase: number;
  readonly tempo: number;
  /** Seconds between the event and this spectator's reaction. */
  readonly delay: number;
  /** Arms resting position (folded on the rail, along the body in the stand). */
  readonly restArms: number;
  reaction: CrowdReaction | null;
  /** Seconds since the reaction started (negative while waiting for the delay). */
  time: number;
}

/** Where people stand: steps of the stand, the rail by the buvette, behind the attacked goal. */
export interface CrowdLayout {
  readonly stand: { readonly x0: number; readonly length: number; readonly z0: number };
  readonly stepDepth: number;
  readonly stepHeight: number;
  readonly steps: number;
  /** Rail by the clubhouse (spectators face +Z). */
  readonly railZ: number;
  readonly railX: readonly [number, number];
  /** Rail behind the attacked goal (spectators face −X). */
  readonly endX: number;
}

const JACKETS = [
  0x1d2b4f, 0x3b3f45, 0x5a2a27, 0x2f4a3a, 0x6b5a3a, 0x1f1f22, 0x7a1f1f, 0x284a6b, 0x4b3b5a,
  0x0f5132, 0x0f5132, 0xd4a017,
];
const SKINS = [0xf1c7a5, 0xe0ac86, 0xc58c64, 0x8d5a3b, 0x6b4028, 0xd8a47f];

/** Reaction length (s): after it the spectator goes back to waiting. */
const DURATION: Readonly<Record<CrowdReaction, number>> = { goal: 4.5, ooh: 2.2, dismay: 3 };

export class Crowd {
  readonly group = new THREE.Group();
  private readonly spectators: Spectator[] = [];
  private readonly bodies: THREE.InstancedMesh;
  private readonly heads: THREE.InstancedMesh;
  private readonly arms: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly armMatrix = new THREE.Matrix4();
  private readonly shoulder = new THREE.Matrix4();
  private readonly rotation = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scaleVector = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private time = 0;

  constructor(layout: CrowdLayout, density = 1) {
    const rng = Rng.create('crowd');
    const add = (position: THREE.Vector3, yaw: number, restArms: number): void => {
      this.spectators.push({
        position,
        yaw: yaw + rng.normal(0, 0.12),
        scale: rng.range(0.92, 1.08),
        phase: rng.range(0, Math.PI * 2),
        tempo: rng.range(0.6, 1.4),
        delay: rng.range(0, 0.3),
        restArms,
        reaction: null,
        time: 0,
      });
    };
    const keep = (): boolean => rng.float() < density;

    // The stand: scattered on the steps, more in the middle, some gaps (it is not full).
    const { x0, length, z0 } = layout.stand;
    for (let step = 0; step < layout.steps; step++) {
      for (let x = x0 + 1; x < x0 + length - 0.5; x += rng.range(0.7, 2.6)) {
        const middle = 1 - Math.abs((x - x0) / length - 0.5) * 1.2;
        if (rng.float() > 0.55 * middle || !keep()) continue;
        const y = layout.stepHeight * (step + 1);
        const z = z0 + step * layout.stepDepth + layout.stepDepth * 0.5;
        add(new THREE.Vector3(x, y, z), Math.PI, 0.15);
      }
    }
    // Regulars leaning on the rail by the buvette.
    for (let x = layout.railX[0]; x < layout.railX[1]; x += rng.range(0.8, 3.5)) {
      if (!keep()) continue;
      add(new THREE.Vector3(x, 0, layout.railZ - 0.45), 0, 1.35);
    }
    // A few behind the goal, in the shooter's line of sight.
    for (const z of [-11, -9.6, -3.5, 5.2, 6.1, 10.5]) {
      if (!keep()) continue;
      add(new THREE.Vector3(layout.endX + 0.45, 0, z + rng.normal(0, 0.3)), -Math.PI / 2, 1.3);
    }

    const count = this.spectators.length;
    const jacket = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    this.bodies = new THREE.InstancedMesh(bodyGeometry(), jacket, count);
    this.heads = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.12, 1).translate(0, 1.62, 0),
      skin,
      count,
    );
    this.arms = new THREE.InstancedMesh(armsGeometry(), jacket, count);
    const colour = new THREE.Color();
    this.spectators.forEach((_, i) => {
      const jacketColour = JACKETS[rng.int(0, JACKETS.length - 1)] ?? 0x3b3f45;
      this.bodies.setColorAt(i, colour.setHex(jacketColour));
      this.arms.setColorAt(i, colour.setHex(jacketColour));
      this.heads.setColorAt(i, colour.setHex(SKINS[rng.int(0, SKINS.length - 1)] ?? 0xc58c64));
    });
    for (const mesh of [this.bodies, this.heads, this.arms]) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
    }
    this.update(0);
  }

  get size(): number {
    return this.spectators.length;
  }

  /** The crowd reacts to what happened on the pitch. */
  react(kind: CrowdReaction): void {
    for (const s of this.spectators) {
      // A goal overrides a near miss; the same reaction restarts.
      s.reaction = kind;
      s.time = -s.delay;
    }
  }

  /** Advances the animation by `dt` seconds (simulated: it slows down with slow motion). */
  update(dt: number): void {
    this.time += dt;
    this.spectators.forEach((s, i) => {
      let jump = 0;
      let arms = s.restArms + 0.08 * Math.sin(this.time * s.tempo * 1.3 + s.phase);
      let lean = 0;
      let sway = 0.05 * Math.sin(this.time * s.tempo + s.phase);
      if (s.reaction) {
        s.time += dt;
        const duration = DURATION[s.reaction];
        if (s.time > duration) s.reaction = null;
        else if (s.time > 0) {
          // Rise fast, calm down over the reaction.
          const e =
            Math.min(1, s.time / 0.2) *
            (1 - Math.max(0, (s.time - duration * 0.55) / (duration * 0.45)));
          if (s.reaction === 'goal') {
            jump = Math.abs(Math.sin(s.time * 8.5 + s.phase)) * 0.28 * e;
            arms = lerp(arms, 2.9 + 0.2 * Math.sin(s.time * 12 + s.phase), e);
            sway *= 1 + 3 * e;
          } else {
            // Hands to the head; the disappointed lean back, then look down.
            arms = lerp(arms, 2.45, e);
            lean = (s.reaction === 'ooh' ? -0.12 : 0.18) * e;
          }
        }
      }
      this.euler.set(lean, s.yaw + sway, 0, 'YXZ');
      this.quaternion.setFromEuler(this.euler);
      this.scaleVector.setScalar(s.scale);
      this.offset.copy(s.position).setY(s.position.y + jump);
      this.matrix.compose(this.offset, this.quaternion, this.scaleVector);
      this.bodies.setMatrixAt(i, this.matrix);
      this.heads.setMatrixAt(i, this.matrix);
      // Arms pivot at the shoulders: 0 hangs down, π points straight up (forward first).
      this.shoulder.makeTranslation(0, 1.42, 0);
      this.rotation.makeRotationX(-arms);
      this.armMatrix.multiplyMatrices(this.matrix, this.shoulder).multiply(this.rotation);
      this.arms.setMatrixAt(i, this.armMatrix);
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    this.arms.instanceMatrix.needsUpdate = true;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Legs and torso, feet at the origin, facing +Z. */
function bodyGeometry(): THREE.BufferGeometry {
  const parts = [
    new THREE.BoxGeometry(0.14, 0.8, 0.16).translate(-0.09, 0.4, 0),
    new THREE.BoxGeometry(0.14, 0.8, 0.16).translate(0.09, 0.4, 0),
    new THREE.CylinderGeometry(0.2, 0.18, 0.66, 7).translate(0, 1.13, 0),
    new THREE.CylinderGeometry(0.05, 0.06, 0.1, 5).translate(0, 1.5, 0),
  ];
  return mergeGeometries(parts);
}

/** Both arms hanging from the shoulder pivot (origin), along −Y. */
function armsGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    new THREE.BoxGeometry(0.09, 0.6, 0.09).translate(-0.25, -0.28, 0),
    new THREE.BoxGeometry(0.09, 0.6, 0.09).translate(0.25, -0.28, 0),
  ]);
}
