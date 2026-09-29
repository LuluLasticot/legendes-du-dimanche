// Background players of a key moment: the other twenty or so players of an 11 v 11 match, who
// stand around without playing a part, so the pitch does not look empty behind the action. Only
// where they stand is decided here (pure, no RNG); they never touch the ball, so they keep out of
// the way of the shot: outside the lane between the ball and the goal, and clear of the players
// who do take part. Penalty: everyone stands outside the area and the arc (Laws of the Game, 14).

import { sqrt } from '../math/index.ts';
import { PITCH } from '../physics/constants.ts';
import { v3, type Vec3 } from '../physics/vec3.ts';
import type { Situation } from './situations.ts';

export interface BackgroundPlayer {
  /** Whose kit: the side attacking the goal at +X or the side defending it. */
  readonly side: 'attack' | 'defend';
  readonly feet: Vec3;
}

/** Width of the goal mouth (posts at z = ±this), and the room kept around the shot's lane. */
const POST_Z = 3.66;
const LANE_MARGIN = 2;
/** Nearest a background player may stand to a player who takes part (m). */
const PERSONAL_SPACE = 2.6;
/** Half width of the pitch, with a margin for the touchline. */
const EDGE = PITCH.width / 2 - 1.5;

// Candidate spots relative to the goal line (dx behind the line, so x = goalLineX − dx) and the
// centre (z). Each list is in order of importance: the first ones are the ones the camera sees.
type Spot = readonly [dx: number, z: number];

const DEFEND: readonly Spot[] = [
  [3.5, 9],
  [4, -9],
  [11, 13],
  [10, -12],
  [8, 6.5],
  [8.5, -6.5],
  [21, 12],
  [22, -10],
  [28, 6],
  [30, -6],
  [17, 0],
  [36, 16],
];

const ATTACK: readonly Spot[] = [
  [9, -8],
  [7.5, 11],
  [14, 15],
  [15, -13],
  [20, 6],
  [22, -5],
  [30, -14],
  [31, 13],
  [38, 3],
  [40, -9],
  [26, 0],
  [45, 15],
];

// Penalty: outside the area (x ≤ goalLineX − 16.5) and at least 9.15 m from the mark.
const PENALTY_DEFEND: readonly Spot[] = [
  [17.8, 11.4],
  [17.8, -11.4],
  [17.8, 17],
  [17.8, -17],
  [21, 13],
  [21, -13],
];
const PENALTY_ATTACK: readonly Spot[] = [
  [17.8, 8.6],
  [17.8, -8.6],
  [17.8, 14.2],
  [17.8, -14.2],
  [21, 10],
  [21, -10],
];

/** True if `p` is inside the triangle ball → posts, widened by the lane margin. */
function inLane(p: Vec3, ball: Vec3): boolean {
  if (p.x <= ball.x - LANE_MARGIN) return false;
  const span = PITCH.goalLineX - ball.x;
  const t = span > 1e-6 ? Math.min(1, Math.max(0, (p.x - ball.x) / span)) : 1;
  const half = LANE_MARGIN + POST_Z * t;
  const centre = ball.z * (1 - t);
  return Math.abs(p.z - centre) < half;
}

function toPlayers(
  side: BackgroundPlayer['side'],
  spots: readonly Spot[],
  mirror: number,
): BackgroundPlayer[] {
  return spots.map(([dx, z]) => ({ side, feet: v3(PITCH.goalLineX - dx, 0, z * mirror) }));
}

/**
 * Background players for a situation: at most `count`, interleaving the two sides so a small
 * count still shows both kits. `ball` is where the ball starts; `busy` are the feet of the
 * players who take part (shooter, keeper, wall, markers, receivers).
 */
export function backgroundPlayers(
  situation: Situation,
  ball: Vec3,
  busy: readonly Vec3[],
  count: number,
): BackgroundPlayer[] {
  const penalty = situation === 'penalty';
  // The ball's side of the pitch gets the first (most visible) spots.
  const mirror = ball.z < 0 ? -1 : 1;
  const defend = toPlayers('defend', penalty ? PENALTY_DEFEND : DEFEND, mirror);
  const attack = toPlayers('attack', penalty ? PENALTY_ATTACK : ATTACK, mirror);
  const usable = (p: BackgroundPlayer, taken: readonly Vec3[]): boolean => {
    if (Math.abs(p.feet.z) > EDGE || p.feet.x < -PITCH.goalLineX) return false;
    if (!penalty && inLane(p.feet, ball)) return false;
    return [...busy, ...taken].every((b) => dist(b, p.feet) >= PERSONAL_SPACE);
  };
  const chosen: BackgroundPlayer[] = [];
  const taken: Vec3[] = [];
  for (let i = 0; chosen.length < count && (i < defend.length || i < attack.length); i++) {
    for (const p of [attack[i], defend[i]]) {
      if (!p || chosen.length >= count || !usable(p, taken)) continue;
      chosen.push(p);
      taken.push(p.feet);
    }
  }
  return chosen;
}

function dist(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return sqrt(dx * dx + dz * dz);
}
