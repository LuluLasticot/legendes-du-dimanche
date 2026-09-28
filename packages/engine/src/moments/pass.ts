// Passes in key moments (deterministic): the player traces where the ball must go, the passer
// weights it so that it arrives when the receiver does, then the passer's execution error is
// applied. The receiver runs to the earliest point of the real ball path he can reach.

import { clamp, degToRad, lerp, sinCos, sqrt } from '../math/index.ts';
import { kickedBall, stepBall, type BallState } from '../physics/ball.ts';
import { BALL, PITCH } from '../physics/constants.ts';
import type { PhysicsParams, PhysicsSurface } from '../physics/params.ts';
import { scale, v3, type Vec3 } from '../physics/vec3.ts';
import type { Rng } from '../rng/index.ts';
import { TICK_DT, type Tick } from '../time/index.ts';

type Range = readonly [atLow: number, atHigh: number];

/** Pass-related attributes on the 1–99 card scale. */
export interface PassAttributes {
  readonly passing: number;
  readonly composure: number;
}

export interface PassTuning {
  /** Hardest pass (m/s) at passing 1 → 99. */
  readonly maxSpeedRange: Range;
  /** Softest pass (m/s). */
  readonly minSpeed: number;
  /** Slowest acceptable speed of the ball when it reaches the target (m/s). */
  readonly minArrivalSpeed: number;
  /** One-sigma direction error (degrees) at passing 1 → 99. */
  readonly errorDegRange: Range;
  /** Error multiplier at full pressure and zero composure (added to 1). */
  readonly pressurePenalty: number;
  /** Relative one-sigma error on the pace, scaled by the angular error. */
  readonly paceErrorRatio: number;
}

export const DEFAULT_PASS_TUNING: PassTuning = {
  maxSpeedRange: [17, 26],
  minSpeed: 5,
  minArrivalSpeed: 5,
  errorDegRange: [7, 1],
  pressurePenalty: 0.8,
  paceErrorRatio: 0.8,
};

export interface PasserProfile {
  readonly minSpeed: number;
  readonly maxSpeed: number;
  readonly minArrivalSpeed: number;
  /** One-sigma direction error, radians. */
  readonly errorRad: number;
  readonly paceErrorRatio: number;
}

const t01 = (value: number): number => clamp((value - 1) / 98, 0, 1);
const pick = (range: Range, attribute: number): number => lerp(range[0], range[1], t01(attribute));

export function passerProfile(
  attributes: PassAttributes,
  pressure: number,
  tuning: PassTuning = DEFAULT_PASS_TUNING,
): PasserProfile {
  return {
    minSpeed: tuning.minSpeed,
    maxSpeed: pick(tuning.maxSpeedRange, attributes.passing),
    minArrivalSpeed: tuning.minArrivalSpeed,
    errorRad:
      degToRad(pick(tuning.errorDegRange, attributes.passing)) *
      (1 + clamp(pressure, 0, 1) * (1 - t01(attributes.composure)) * tuning.pressurePenalty),
    paceErrorRatio: tuning.paceErrorRatio,
  };
}

/** Ball passed along the ground from `from` in direction `dir` (unit, horizontal). */
function groundPass(from: Vec3, dir: Vec3, speed: number): BallState {
  return kickedBall(v3(from.x, BALL.radius, from.z), scale(dir, speed), v3(0, 0, 0));
}

/** Rolls a ground pass until it has covered `distance`: ticks taken and speed on arrival. */
function rollTo(
  from: Vec3,
  dir: Vec3,
  speed: number,
  distance: number,
  physics: PhysicsParams,
  surface: PhysicsSurface,
): { ticks: Tick; arrivalSpeed: number } | null {
  let state = groundPass(from, dir, speed);
  const maxTicks = 6 * 120;
  for (let tick = 1; tick <= maxTicks; tick++) {
    state = stepBall(state, physics, surface, TICK_DT, null).state;
    const along = (state.pos.x - from.x) * dir.x + (state.pos.z - from.z) * dir.z;
    const v = sqrt(state.vel.x * state.vel.x + state.vel.z * state.vel.z);
    if (along >= distance) return { ticks: tick, arrivalSpeed: v };
    if (v < 0.05) return null;
  }
  return null;
}

/** Smallest speed in [lo, hi] satisfying the monotone predicate `ok` (hi if none). */
function bisectSpeed(lo: number, hi: number, ok: (speed: number) => boolean): number {
  if (ok(lo)) return lo;
  if (!ok(hi)) return hi;
  let a = lo;
  let b = hi;
  for (let i = 0; i < 20; i++) {
    const m = (a + b) / 2;
    if (ok(m)) b = m;
    else a = m;
  }
  return b;
}

export interface PassSolution {
  readonly velocity: Vec3;
  /** Predicted ticks for the ideal pass to reach the target, or null if it stops short. */
  readonly arrivalTicks: Tick | null;
}

/**
 * Weights a ground pass to `target`: it gets there no earlier than `wantedTicks` (the receiver's
 * run) but still rolling at `minArrivalSpeed` at least, within the passer's range.
 */
export function solvePass(
  from: Vec3,
  target: Vec3,
  wantedTicks: Tick,
  profile: PasserProfile,
  physics: PhysicsParams,
  surface: PhysicsSurface,
): PassSolution {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const distance = sqrt(dx * dx + dz * dz);
  if (distance < 0.5) throw new RangeError('Pass target too close to the ball');
  const dir = v3(dx / distance, 0, dz / distance);
  const roll = (speed: number): ReturnType<typeof rollTo> =>
    rollTo(from, dir, speed, distance, physics, surface);
  // Fastest arrival the receiver can use, and the pace that keeps the ball alive on arrival.
  const onTime = bisectSpeed(profile.minSpeed, profile.maxSpeed, (s) => {
    const r = roll(s);
    return r !== null && r.ticks <= wantedTicks;
  });
  const alive = bisectSpeed(profile.minSpeed, profile.maxSpeed, (s) => {
    const r = roll(s);
    return r !== null && r.arrivalSpeed >= profile.minArrivalSpeed;
  });
  const speed = Math.max(onTime, alive);
  return { velocity: scale(dir, speed), arrivalTicks: roll(speed)?.ticks ?? null };
}

/** Seeded execution error of the passer: direction and pace. */
export function applyPassError(velocity: Vec3, profile: PasserProfile, rng: Rng): Vec3 {
  const speed = sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
  if (speed === 0) return velocity;
  const [s, c] = sinCos(rng.normal(0, profile.errorRad));
  const dx = velocity.x / speed;
  const dz = velocity.z / speed;
  const newSpeed = speed * (1 + rng.normal(0, profile.errorRad * profile.paceErrorRatio));
  return v3((dx * c - dz * s) * newSpeed, 0, (dx * s + dz * c) * newSpeed);
}

// ─── Receiver ────────────────────────────────────────────────────────────────

export interface ReceiverTuning {
  /** Top running speed (m/s) at pace 1 → 99. */
  readonly speedRange: Range;
  /** Time to reach top speed (s). */
  readonly accelerationTime: number;
  /** Reach of the foot around the body (m). */
  readonly controlRadius: number;
  /** Highest ball the receiver can strike first time (m). */
  readonly maxHeight: number;
  /** Time margin kept when planning the run (s): he gets there slightly early, never late. */
  readonly planMargin: number;
}

export const DEFAULT_RECEIVER_TUNING: ReceiverTuning = {
  speedRange: [6, 8.8],
  accelerationTime: 0.5,
  controlRadius: 0.55,
  maxHeight: 1.1,
  planMargin: 0.15,
};

/**
 * Distance run in `t` seconds starting at speed `v0`, accelerating at top/accelerationTime up
 * to `top`.
 */
export function runDistance(t: number, top: number, accelerationTime: number, v0 = 0): number {
  if (t <= 0) return 0;
  const a = top / accelerationTime;
  const start = Math.min(v0, top);
  const toTop = (top - start) / a;
  if (t <= toTop) return start * t + 0.5 * a * t * t;
  return start * toTop + 0.5 * a * toTop * toTop + top * (t - toTop);
}

/** Ticks the receiver needs to cover `distance`, starting at `speed` (m/s). */
export function runTicks(distance: number, pace: number, tuning: ReceiverTuning, speed = 0): Tick {
  const top = pick(tuning.speedRange, pace);
  let ticks = 0;
  while (runDistance(ticks * TICK_DT, top, tuning.accelerationTime, speed) < distance) ticks++;
  return ticks;
}

/**
 * Ticks for the receiver to be in position at `target` (within control radius, with the planning
 * margin): the pass should arrive then, not before.
 */
export function receptionTicks(
  from: Vec3,
  target: Vec3,
  pace: number,
  speed: number,
  tuning: ReceiverTuning = DEFAULT_RECEIVER_TUNING,
): Tick {
  const d = sqrt(
    (target.x - from.x) * (target.x - from.x) + (target.z - from.z) * (target.z - from.z),
  );
  return (
    runTicks(Math.max(0, d - tuning.controlRadius), pace, tuning, speed) +
    Math.ceil(tuning.planMargin / TICK_DT) +
    2
  );
}

export interface Reception {
  /** Tick (from the start of `path`) at which the receiver meets the ball. */
  readonly tick: Tick;
  /** Where he strikes it (ball position). */
  readonly ball: Vec3;
  /** Where his feet are then (short of the ball by the control radius). */
  readonly feet: Vec3;
}

/**
 * Earliest point of the predicted ball path (`path[i]` = ball at tick i) the receiver can meet
 * in time, low enough to strike. Null if the ball never gets within reach in play.
 */
export function planReception(
  from: Vec3,
  pace: number,
  path: readonly BallState[],
  tuning: ReceiverTuning = DEFAULT_RECEIVER_TUNING,
  /** Current running speed (m/s). */
  speed = 0,
): Reception | null {
  const top = pick(tuning.speedRange, pace);
  for (let i = 1; i < path.length; i++) {
    const p = (path[i] as BallState).pos;
    if (p.x > PITCH.goalLineX - 0.5 || p.z * p.z > (PITCH.width / 2) * (PITCH.width / 2)) break;
    if (p.y > tuning.maxHeight) continue;
    const dx = p.x - from.x;
    const dz = p.z - from.z;
    const d = sqrt(dx * dx + dz * dz);
    const needed = Math.max(0, d - tuning.controlRadius);
    const time = i * TICK_DT - tuning.planMargin;
    if (runDistance(time, top, tuning.accelerationTime, speed) >= needed) {
      const f = d > 1e-6 ? needed / d : 0;
      return { tick: i, ball: p, feet: v3(from.x + dx * f, 0, from.z + dz * f) };
    }
  }
  // The ball comes to rest in play: the receiver goes to it.
  const last = path[path.length - 1];
  if (last === undefined || !last.grounded) return null;
  const p = last.pos;
  if (p.x > PITCH.goalLineX - 0.5 || p.z * p.z > (PITCH.width / 2) * (PITCH.width / 2)) return null;
  const dx = p.x - from.x;
  const dz = p.z - from.z;
  const d = sqrt(dx * dx + dz * dz);
  const needed = Math.max(0, d - tuning.controlRadius);
  const f = d > 1e-6 ? needed / d : 0;
  return {
    tick: Math.max(path.length - 1, runTicks(needed, pace, tuning)),
    ball: p,
    feet: v3(from.x + dx * f, 0, from.z + dz * f),
  };
}

/** Ball state for a ground pass (exported for the renderer's prediction line). */
export function passBall(from: Vec3, velocity: Vec3): BallState {
  return kickedBall(v3(from.x, BALL.radius, from.z), velocity, v3(0, 0, 0));
}
