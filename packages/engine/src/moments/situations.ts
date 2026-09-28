// The playable situations of the prototype and their fixed geometry: pass then first-time shot,
// direct free kick, penalty, and the keeper's save (the player dives, an opponent shoots).
// Positions use the attacked goal at +X (line at PITCH.goalLineX), centre of the goal at z = 0.

import { clamp, sqrt } from '../math/index.ts';
import type { PhysicsParams, PhysicsSurface } from '../physics/params.ts';
import { GOAL, PITCH } from '../physics/constants.ts';
import { v3, type Vec3 } from '../physics/vec3.ts';
import type { Rng } from '../rng/index.ts';
import type { DefenderAttributes } from './defenders.ts';
import {
  applyExecutionError,
  solveShot,
  type ShooterProfile,
  type ShotTuning,
  DEFAULT_SHOT_TUNING,
} from './shot.ts';
import type { DefenderSetup } from './shot-moment.ts';

export const SITUATIONS = ['free', 'pass', 'free-kick', 'penalty', 'keeper'] as const;
export type Situation = (typeof SITUATIONS)[number];

/** Penalty mark: 11 m from the goal line. */
export const PENALTY_DISTANCE = 11;

/** Ball on the penalty mark. */
export function penaltySpot(): Vec3 {
  return v3(PITCH.goalLineX - PENALTY_DISTANCE, 0, 0);
}

/** Keeper on his line, centred (Laws of the Game, law 14). */
export function penaltyKeeperFeet(): Vec3 {
  return v3(PITCH.goalLineX - 0.1, 0, 0);
}

/** Players a keeper would put in the wall for a free kick at `distance` m (0 if too far). */
export function wallSize(distance: number, offset: number): number {
  const d = sqrt(distance * distance + offset * offset);
  if (d > 34) return 0;
  if (d > 28) return 2;
  if (d > 24) return 3;
  if (d > 20) return 4;
  return 5;
}

/** Speed of the receiver's run when the pass is played (m/s). */
export const RECEIVER_RUN_SPEED = 5;

/** Layout of a pass situation: passer (ball), receiver's starting point and markers. */
export interface PassLayout {
  readonly ball: Vec3;
  readonly receiver: Vec3;
  readonly markers: readonly Vec3[];
}

/**
 * Pass layouts: a wide player cuts it back to a runner arriving in the box, a through ball from
 * midfield, and a square ball on the edge of the box.
 */
export const PASS_LAYOUTS: readonly PassLayout[] = [
  {
    ball: v3(PITCH.goalLineX - 6, 0, 15),
    receiver: v3(PITCH.goalLineX - 19, 0, 5),
    markers: [v3(PITCH.goalLineX - 16, 0, 7), v3(PITCH.goalLineX - 6, 0, -4)],
  },
  {
    ball: v3(PITCH.goalLineX - 32, 0, -3),
    receiver: v3(PITCH.goalLineX - 23, 0, 10),
    markers: [v3(PITCH.goalLineX - 20, 0, 8), v3(PITCH.goalLineX - 17, 0, -1)],
  },
  {
    ball: v3(PITCH.goalLineX - 22, 0, 16),
    receiver: v3(PITCH.goalLineX - 24, 0, 1),
    markers: [v3(PITCH.goalLineX - 17, 0, 3)],
  },
];

export function passLayout(index: number): PassLayout {
  const n = PASS_LAYOUTS.length;
  return PASS_LAYOUTS[((index % n) + n) % n] as PassLayout;
}

export function markerSetups(
  layout: PassLayout,
  count: number,
  attributes: DefenderAttributes,
): DefenderSetup[] {
  return layout.markers
    .slice(0, clamp(count, 0, layout.markers.length))
    .map((feet) => ({ role: 'marker' as const, feet, attributes }));
}

/**
 * Penalty power gauge: the player stops a sweeping cursor. Power follows the gauge; past the
 * sweet spot the strike gets harder to control (a gauge at the top is often skied).
 */
export function penaltyGauge(gauge: number): { power: number; difficulty: number } {
  const g = clamp(gauge, 0, 1);
  const over = clamp((g - 0.82) / 0.18, 0, 1);
  return { power: g, difficulty: over * over };
}

/**
 * Opponent strike for the keeper situation: the shooter picks a spot (corners more often, like
 * real finishers), a pace and some curl, then his execution error applies.
 */
export function opponentShot(
  from: Vec3,
  profile: ShooterProfile,
  physics: PhysicsParams,
  surface: PhysicsSurface,
  rng: Rng,
  tuning: ShotTuning = DEFAULT_SHOT_TUNING,
): { velocity: Vec3; spin: Vec3; target: Vec3 } {
  const halfWidth = GOAL.width / 2 - 0.35;
  const side = rng.chance(0.5) ? -1 : 1;
  // Bias towards the posts: |z| = halfWidth · (1 − u²).
  const u = rng.float();
  const z = side * halfWidth * (1 - u * u * 0.9);
  const high = rng.chance(0.4);
  const y = high ? 1.4 + rng.float() * 0.75 : 0.2 + rng.float() * 0.6;
  const target = v3(PITCH.goalLineX, y, z);
  const power = 0.65 + rng.float() * 0.35;
  const bulge = clamp(rng.normal(0, 0.35), -1, 1);
  const solution = solveShot(
    from,
    { target, power, bulge, lob: false },
    profile,
    physics,
    surface,
    {
      tuning,
    },
  );
  const struck = applyExecutionError(solution, profile, rng.fork('execution'), tuning);
  return { ...struck, target };
}
