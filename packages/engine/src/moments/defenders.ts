// Outfield defenders in key moments (deterministic, fixed step): the free-kick wall and markers
// closing a shot down. Each defender is a body capsule feet → head; markers run to the earliest
// point of the ball's path they can reach and lunge (or jump) at the last moment.

import { clamp, lerp, sqrt } from '../math/index.ts';
import type { BallState } from '../physics/ball.ts';
import { BALL, GOAL, PITCH } from '../physics/constants.ts';
import { simulateFlight, type FlightContext } from '../physics/flight.ts';
import { add, dot, length, scale, sub, v3, type Vec3 } from '../physics/vec3.ts';
import type { Rng } from '../rng/index.ts';
import { secondsToTicks, TICK_DT, type Tick } from '../time/index.ts';

export interface DefenderAttributes {
  /** 1–99 card attributes (VIT, DÉF, PHY) and height. */
  readonly pace: number;
  readonly defending: number;
  readonly physical: number;
  readonly heightCm: number;
}

type Range = readonly [atLow: number, atHigh: number];

export interface DefenderTuning {
  /**
   * Reaction delay of a marker (s) at defending 1 → 99. Short: a defender facing the shooter
   * reads his body shape before the ball is struck.
   */
  readonly reactionRange: Range;
  /** Reaction delay of a wall jump (s) at defending 1 → 99. */
  readonly wallReactionRange: Range;
  /** Top running speed (m/s) at pace 1 → 99. */
  readonly speedRange: Range;
  /** Time to reach top speed (s). */
  readonly accelerationTime: number;
  /** Jump height (m) at physical 1 → 99. */
  readonly jumpRange: Range;
  /** Extra reach of a lunge / slide (m) at defending 1 → 99, for the lower body. */
  readonly lungeRange: Range;
  /** Seconds before the interception when the marker lunges. */
  readonly lungeTime: number;
  /** Speed kept by a blocked ball (fraction). */
  readonly deflectRestitution: number;
  /** Random spread of deflections (radians, one sigma). */
  readonly deflectSpread: number;
}

export const DEFAULT_DEFENDER_TUNING: DefenderTuning = {
  reactionRange: [0.3, 0.08],
  wallReactionRange: [0.26, 0.1],
  speedRange: [5.5, 8.2],
  accelerationTime: 0.45,
  jumpRange: [0.22, 0.55],
  lungeRange: [0.2, 0.55],
  lungeTime: 0.28,
  deflectRestitution: 0.4,
  deflectSpread: 0.25,
};

/**
 * 'wall': jumps in the free-kick wall. 'marker': closes the shooter down. 'cover': holds his
 * position (marking a runner in the box); he only blocks what comes at him, and goes for loose
 * balls after a save or a post.
 */
export type DefenderRole = 'wall' | 'marker' | 'cover';

export interface DefenderState {
  readonly role: DefenderRole;
  /** Feet on the ground (y = 0 unless jumping). */
  readonly feet: Vec3;
  readonly head: Vec3;
  /** Horizontal running velocity. */
  readonly vel: Vec3;
  readonly reactionTick: Tick;
  /** Interception point on the ground and when the ball gets there, once read. */
  readonly target: Vec3 | null;
  readonly targetTick: Tick | null;
  readonly jumpStartTick: Tick | null;
  readonly lunging: boolean;
  readonly lastContactTick: Tick;
}

export interface DefenderContact {
  readonly pos: Vec3;
  readonly speed: number;
  readonly ball: BallState;
}

const BODY_RADIUS = 0.24;
const CONTACT_COOLDOWN = 10;
const G = 9.81;

const t01 = (value: number): number => clamp((value - 1) / 98, 0, 1);
const pick = (range: Range, attribute: number): number => lerp(range[0], range[1], t01(attribute));

function headHeight(attributes: DefenderAttributes): number {
  return (attributes.heightCm / 100) * 0.95;
}

/**
 * Free-kick wall positions: 9.15 m from the ball, first player on the line ball → just outside
 * the near post, the others side by side towards the centre of the goal.
 */
export function wallPositions(ballPos: Vec3, count: number): Vec3[] {
  const nearPostZ = ballPos.z >= 0 ? GOAL.width / 2 + 0.3 : -(GOAL.width / 2 + 0.3);
  const toPost = v3(PITCH.goalLineX - ballPos.x, 0, nearPostZ - ballPos.z);
  const dir = scale(toPost, 1 / length(toPost));
  const anchor = add(ballPos, scale(dir, 9.15));
  // Perpendicular on the ground, pointing towards the goal centre.
  let perp = v3(-dir.z, 0, dir.x);
  if (dot(perp, v3(0, 0, -nearPostZ)) < 0) perp = scale(perp, -1);
  const out: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const p = add(anchor, scale(perp, i * 0.5));
    out.push(v3(p.x, 0, p.z));
  }
  return out;
}

export function createDefender(
  role: DefenderRole,
  feet: Vec3,
  attributes: DefenderAttributes,
  tuning: DefenderTuning,
  rng: Rng,
): DefenderState {
  const range = role === 'wall' ? tuning.wallReactionRange : tuning.reactionRange;
  const reaction = pick(range, attributes.defending) * (1 + rng.normal(0, 0.1));
  return {
    role,
    feet,
    head: v3(feet.x, headHeight(attributes), feet.z),
    vel: v3(0, 0, 0),
    reactionTick: Math.max(1, secondsToTicks(reaction)),
    target: null,
    targetTick: null,
    jumpStartTick: null,
    lunging: false,
    lastContactTick: -1000,
  };
}

/** Top running speed of a defender (m/s). */
export function defenderTopSpeed(attributes: DefenderAttributes, tuning: DefenderTuning): number {
  return pick(tuning.speedRange, attributes.pace);
}

/** Highest ball a defender can play (header at the top of his jump), m. */
export function defenderReachHeight(
  attributes: DefenderAttributes,
  tuning: DefenderTuning,
): number {
  return headHeight(attributes) + pick(tuning.jumpRange, attributes.physical) + 0.15;
}

/** Standing head height (m). */
export function defenderHeadHeight(attributes: DefenderAttributes): number {
  return headHeight(attributes);
}

/** Height of a jump `t` seconds after take-off (0 on the ground). */
function jumpHeight(t: number, apex: number): number {
  if (t <= 0) return 0;
  const v0 = sqrt(2 * G * apex);
  return Math.max(0, v0 * t - 0.5 * G * t * t);
}

/** Distance a defender can run from standstill in `t` seconds. */
function runDistance(t: number, top: number, accelerationTime: number): number {
  if (t <= 0) return 0;
  if (t <= accelerationTime) return (0.5 * top * t * t) / accelerationTime;
  return top * (t - accelerationTime / 2);
}

/** Earliest point of the ball's path the marker can reach in time (or the closest miss). */
function planInterception(
  defender: DefenderState,
  tick: Tick,
  ball: BallState,
  attributes: DefenderAttributes,
  tuning: DefenderTuning,
  flight: FlightContext,
): { target: Vec3; targetTick: Tick } | null {
  const prediction = simulateFlight(ball, { ...flight, rng: null }, { maxTicks: 240 });
  const top = pick(tuning.speedRange, attributes.pace);
  const reachUp = headHeight(attributes) + pick(tuning.jumpRange, attributes.physical) + 0.15;
  const reach = BODY_RADIUS + BALL.radius + pick(tuning.lungeRange, attributes.defending);
  let best: { target: Vec3; targetTick: Tick; slack: number } | null = null;
  for (let i = 1; i < prediction.samples.length; i++) {
    const p = (prediction.samples[i] as BallState).pos;
    if (p.x >= PITCH.goalLineX) break;
    if (p.y > reachUp) continue;
    const dx = p.x - defender.feet.x;
    const dz = p.z - defender.feet.z;
    const needed = Math.max(0, sqrt(dx * dx + dz * dz) - reach);
    const slack = runDistance(i * TICK_DT, top, tuning.accelerationTime) - needed;
    if (slack >= 0) return { target: v3(p.x, 0, p.z), targetTick: tick + i };
    if (best === null || slack > best.slack)
      best = { target: v3(p.x, 0, p.z), targetTick: tick + i, slack };
  }
  return best ? { target: best.target, targetTick: best.targetTick } : null;
}

export function stepDefender(
  defender: DefenderState,
  tick: Tick,
  ball: BallState,
  attributes: DefenderAttributes,
  tuning: DefenderTuning,
  flight: FlightContext,
): DefenderState {
  const standingHead = headHeight(attributes);
  const apex = pick(tuning.jumpRange, attributes.physical);

  if (defender.role === 'wall') {
    const jumpStart = defender.jumpStartTick ?? (tick >= defender.reactionTick ? tick : null);
    const h = jumpStart === null ? 0 : jumpHeight((tick - jumpStart) * TICK_DT, apex);
    return {
      ...defender,
      jumpStartTick: jumpStart,
      feet: v3(defender.feet.x, h, defender.feet.z),
      head: v3(defender.feet.x, standingHead + h, defender.feet.z),
    };
  }

  // Cover: stays where he is until the ball is loose (see rebound.ts).
  if (defender.role === 'cover') return defender;

  // Marker.
  if (tick < defender.reactionTick) return defender;
  let current = defender;
  if (current.target === null) {
    const plan = planInterception(current, tick, ball, attributes, tuning, flight);
    if (plan === null) return current;
    current = { ...current, target: plan.target, targetTick: plan.targetTick };
  }
  const target = current.target ?? current.feet;
  const targetTick = current.targetTick ?? tick;

  // Run towards the interception point, accelerating up to top speed.
  const top = pick(tuning.speedRange, attributes.pace);
  const ground = v3(current.feet.x, 0, current.feet.z);
  const toTarget = sub(target, ground);
  const distance = length(toTarget);
  const speed = length(current.vel);
  const nextSpeed = Math.min(top, speed + (top / tuning.accelerationTime) * TICK_DT);
  const stepLength = Math.min(distance, nextSpeed * TICK_DT);
  const dir = distance > 1e-6 ? scale(toTarget, 1 / distance) : v3(0, 0, 0);
  const moved = add(ground, scale(dir, stepLength));
  const vel = distance > 1e-6 ? scale(dir, nextSpeed) : v3(0, 0, 0);

  const ticksLeft = targetTick - tick;
  const lunging = ticksLeft <= secondsToTicks(tuning.lungeTime);
  // Header: jump so that the apex meets the ball.
  const apexTicks = secondsToTicks(sqrt((2 * apex) / G));
  const ballHigh = ball.pos.y > standingHead - 0.2;
  const jumpStart =
    current.jumpStartTick ?? (ballHigh && ticksLeft <= apexTicks && ticksLeft >= 0 ? tick : null);
  const h = jumpStart === null ? 0 : jumpHeight((tick - jumpStart) * TICK_DT, apex);
  return {
    ...current,
    feet: v3(moved.x, h, moved.z),
    head: v3(moved.x, standingHead + h, moved.z),
    vel,
    lunging,
    jumpStartTick: jumpStart,
  };
}

function closestOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ab = sub(b, a);
  const t = clamp(dot(sub(p, a), ab) / dot(ab, ab), 0, 1);
  return add(a, scale(ab, t));
}

/** Resolves a contact between the ball and a defender this tick, if any. */
export function defenderContact(
  defender: DefenderState,
  tick: Tick,
  ball: BallState,
  attributes: DefenderAttributes,
  tuning: DefenderTuning,
  rng: Rng,
): DefenderContact | null {
  if (tick - defender.lastContactTick < CONTACT_COOLDOWN) return null;
  const bottom = v3(defender.feet.x, defender.feet.y + 0.1, defender.feet.z);
  const point = closestOnSegment(ball.pos, bottom, defender.head);
  const offset = sub(ball.pos, point);
  const gap = length(offset);
  // A lunge extends the reach of the lower body (outstretched leg).
  const lowerBody = point.y - defender.feet.y < 1;
  const radius =
    BODY_RADIUS +
    (defender.lunging && lowerBody ? pick(tuning.lungeRange, attributes.defending) : 0);
  if (gap >= radius + BALL.radius) return null;

  const normal = gap > 1e-6 ? scale(offset, 1 / gap) : v3(-1, 0, 0);
  const vn = dot(ball.vel, normal);
  if (vn >= 0) return null;
  const speed = length(ball.vel);
  // Reflect on the body, lose pace, plus a random ricochet.
  const reflected = sub(ball.vel, scale(normal, 2 * vn));
  const jitter = v3(
    rng.normal(0, tuning.deflectSpread),
    rng.normal(0, tuning.deflectSpread) * 0.6,
    rng.normal(0, tuning.deflectSpread),
  );
  const dir0 = scale(reflected, 1 / Math.max(1e-6, length(reflected)));
  const dir = add(dir0, jitter);
  const out = speed * tuning.deflectRestitution;
  const vel = scale(dir, out / Math.max(1e-6, length(dir)));
  const pos = add(point, scale(normal, radius + BALL.radius + 1e-3));
  return { pos, speed, ball: { pos, vel, spin: scale(ball.spin, 0.2), grounded: false } };
}

export function touchedDefender(defender: DefenderState, tick: Tick): DefenderState {
  return { ...defender, lastContactTick: tick };
}
