// From shot intent to initial ball conditions.
//
// 1. The shooter's attributes give caps (max speed, max spin) and an accuracy cone.
// 2. Solve (shooting method): find the launch direction that, at the requested pace and curl,
//    brings the ball through the target — with the same integrator as the real flight.
// 3. Execution error: seeded noise inside the accuracy cone (finishing, weak foot, pressure).

import { atan2, clamp, degToRad, lerp, sinCos, sqrt } from '../math/index.ts';
import { stepBall, kickedBall, type BallState } from '../physics/ball.ts';
import { BALL } from '../physics/constants.ts';
import type { PhysicsParams, PhysicsSurface } from '../physics/params.ts';
import { add, cross, scale, sub, v3, type Vec3 } from '../physics/vec3.ts';
import type { Rng } from '../rng/index.ts';
import { TICK_DT } from '../time/index.ts';

const UP = v3(0, 1, 0);
/** Largest yaw/pitch correction per solver iteration, radians. */
const MAX_STEP = 0.12;
const LOB_MIN_PITCH = 0.7;

export interface ShotIntent {
  /** Point the ball must pass through (e.g. a spot on the goal plane). */
  readonly target: Vec3;
  /** Pace in [0, 1] (gesture speed). */
  readonly power: number;
  /** Signed bow of the path in [−1, 1]: > 0 bows to the right, i.e. the ball curls left. */
  readonly bulge: number;
  /** Prefer the high (lob/chip) solution over the driven one. */
  readonly lob: boolean;
}

/** Shot-related attributes on the 1–99 card scale. */
export interface ShotAttributes {
  readonly shotPower: number;
  readonly curve: number;
  readonly finishing: number;
  readonly composure: number;
}

export interface ShotSituation {
  /** Struck with the weaker foot. */
  readonly weakFoot: boolean;
  /** Weak foot rating, 1–5 stars. */
  readonly weakFootStars: number;
  /** Pressure in [0, 1] (defenders close, last minute, penalty…). */
  readonly pressure: number;
  /**
   * Technical difficulty of the strike in [0, 1]: first-time shot on a fast ball, volley,
   * over-hit penalty… (0 = ball at rest).
   */
  readonly difficulty?: number;
}

export interface ShotTuning {
  /** Launch speed range (m/s) mapped on shot power 1 → 99. */
  readonly maxSpeedRange: readonly [number, number];
  /** Launch speed at zero power. */
  readonly minSpeed: number;
  /** Max sidespin (rad/s) mapped on curve 1 → 99. */
  readonly maxSpinRange: readonly [number, number];
  /** One-sigma angular error (degrees) mapped on finishing 1 → 99. */
  readonly errorDegRange: readonly [number, number];
  /** Extra error per missing weak-foot star (×). */
  readonly weakFootPenaltyPerStar: number;
  /** Error multiplier at full pressure and zero composure (added to 1). */
  readonly pressurePenalty: number;
  /** Backspin (rad/s) put on a lob. */
  readonly lobBackspin: number;
  /** Relative one-sigma error on pace and spin, scaled by the angular error. */
  readonly paceErrorRatio: number;
  /** Error multiplier at full technical difficulty (added to 1). */
  readonly difficultyPenalty: number;
}

export const DEFAULT_SHOT_TUNING: ShotTuning = {
  maxSpeedRange: [21, 34],
  minSpeed: 9,
  maxSpinRange: [18, 70],
  errorDegRange: [4.5, 0.6],
  weakFootPenaltyPerStar: 0.3,
  pressurePenalty: 1,
  lobBackspin: 25,
  paceErrorRatio: 0.6,
  difficultyPenalty: 1.5,
};

export interface ShooterProfile {
  readonly minSpeed: number;
  readonly maxSpeed: number;
  readonly maxSpin: number;
  /** One-sigma angular error, radians. */
  readonly errorRad: number;
}

export function shooterProfile(
  attributes: ShotAttributes,
  situation: ShotSituation,
  tuning: ShotTuning = DEFAULT_SHOT_TUNING,
): ShooterProfile {
  const t = (value: number): number => clamp((value - 1) / 98, 0, 1);
  const weakFootFactor = situation.weakFoot
    ? 1 + (5 - clamp(situation.weakFootStars, 1, 5)) * tuning.weakFootPenaltyPerStar
    : 1;
  const pressureFactor =
    1 + clamp(situation.pressure, 0, 1) * (1 - t(attributes.composure)) * tuning.pressurePenalty;
  return {
    minSpeed: tuning.minSpeed,
    maxSpeed: lerp(tuning.maxSpeedRange[0], tuning.maxSpeedRange[1], t(attributes.shotPower)),
    maxSpin: lerp(tuning.maxSpinRange[0], tuning.maxSpinRange[1], t(attributes.curve)),
    errorRad:
      degToRad(lerp(tuning.errorDegRange[0], tuning.errorDegRange[1], t(attributes.finishing))) *
      weakFootFactor *
      pressureFactor *
      (1 + clamp(situation.difficulty ?? 0, 0, 1) * tuning.difficultyPenalty),
  };
}

/**
 * Difficulty of a first-time strike on an incoming ball: the faster it comes, the more it has to
 * be redirected and the higher it is (volley), the harder the finish.
 */
export function firstTimeDifficulty(ball: BallState, shotDirection: Vec3): number {
  const hx = ball.vel.x;
  const hz = ball.vel.z;
  const speed = sqrt(hx * hx + hz * hz);
  const sd = sqrt(shotDirection.x * shotDirection.x + shotDirection.z * shotDirection.z);
  if (speed < 0.5 || sd < 1e-9) return clamp((ball.pos.y - 0.3) / 0.9, 0, 1) * 0.35;
  const cos = (hx * shotDirection.x + hz * shotDirection.z) / (speed * sd);
  // 0 when the ball already travels along the shot, 1 when it comes straight at the shooter.
  const turn = (1 - cos) / 2;
  const pace = clamp(speed / 18, 0, 1);
  const height = clamp((ball.pos.y - 0.3) / 0.9, 0, 1);
  return clamp(pace * (0.25 + 0.75 * turn) + 0.35 * height, 0, 1);
}

export interface ShotSolution {
  readonly velocity: Vec3;
  readonly spin: Vec3;
  /** Distance between the target and where the solved flight crosses the target plane. */
  readonly miss: number;
  readonly iterations: number;
  readonly converged: boolean;
}

export interface SolveOptions {
  readonly maxIterations?: number;
  /** Convergence tolerance, metres. */
  readonly tolerance?: number;
  readonly tuning?: ShotTuning;
}

/** Launch direction from the horizontal aim, a yaw offset and a pitch. */
function launchDirection(aim: Vec3, right: Vec3, yaw: number, pitch: number): Vec3 {
  const [sy, cy] = sinCos(yaw);
  const [sp, cp] = sinCos(pitch);
  const horizontal = add(scale(aim, cy), scale(right, sy));
  return add(scale(horizontal, cp), scale(UP, sp));
}

interface Crossing {
  /** Error to the right of the aim (m). */
  readonly lateral: number;
  /** Error above the target (m); a flight that lands before the plane gets a negative value. */
  readonly vertical: number;
  /** The ball touched the ground (or stopped) before the plane: lateral error is unknown. */
  readonly bounced: boolean;
}

/** Flies the ball (no jitter, no goal frame) until it crosses the plane through the target. */
function crossTargetPlane(
  ball: BallState,
  target: Vec3,
  aim: Vec3,
  right: Vec3,
  distance: number,
  physics: PhysicsParams,
  surface: PhysicsSurface,
): Crossing {
  const along = (p: Vec3): number => (p.x - ball.pos.x) * aim.x + (p.z - ball.pos.z) * aim.z;
  let state = ball;
  const maxTicks = 8 * 120;
  for (let tick = 0; tick < maxTicks; tick++) {
    const step = stepBall(state, physics, surface, TICK_DT, null);
    const next = step.state;
    const a0 = along(state.pos);
    const a1 = along(next.pos);
    if (step.bounce !== null && a1 < distance && target.y > BALL.radius + 0.05) {
      // Touched the ground before the target: the direct solution flies higher. Continuous with
      // the error of a flight that just reaches the plane at ground level.
      return {
        lateral: 0,
        vertical: BALL.radius - target.y - (distance - a1) * 0.5,
        bounced: true,
      };
    }
    if (a1 >= distance) {
      const f = a1 > a0 ? (distance - a0) / (a1 - a0) : 1;
      const p = add(state.pos, scale(sub(next.pos, state.pos), f));
      const d = sub(p, target);
      return { lateral: d.x * right.x + d.z * right.z, vertical: d.y, bounced: false };
    }
    state = next;
    if (state.grounded && a1 - a0 < 1e-4) break;
  }
  return {
    lateral: 0,
    vertical: BALL.radius - target.y - (distance - along(state.pos)) * 0.5,
    bounced: true,
  };
}

/**
 * Finds the launch velocity and spin that bring the ball from `from` through `intent.target`,
 * at the pace and curl allowed by `profile` (the ideal strike, before execution error).
 */
export function solveShot(
  from: Vec3,
  intent: ShotIntent,
  profile: ShooterProfile,
  physics: PhysicsParams,
  surface: PhysicsSurface,
  options: SolveOptions = {},
): ShotSolution {
  const maxIterations = options.maxIterations ?? 10;
  const tolerance = options.tolerance ?? 0.02;
  const tuning = options.tuning ?? DEFAULT_SHOT_TUNING;

  const dx = intent.target.x - from.x;
  const dz = intent.target.z - from.z;
  const distance = sqrt(dx * dx + dz * dz);
  if (distance < 0.5) throw new RangeError('Shot target too close to the ball');
  const aim = v3(dx / distance, 0, dz / distance);
  const right = cross(aim, UP);

  const speed = lerp(profile.minSpeed, profile.maxSpeed, clamp(intent.power, 0, 1));
  // +Y spin curls the ball to the left of its travel, so the path bows to the right.
  const sidespin = scale(UP, clamp(intent.bulge, -1, 1) * profile.maxSpin);
  const backspin = intent.lob ? scale(cross(aim, UP), -tuning.lobBackspin) : v3(0, 0, 0);
  const spin = add(sidespin, backspin);

  // Vacuum ballistic angle as the first guess (low or high root).
  const g = physics.air.gravity;
  const dy = intent.target.y - from.y;
  const s2 = speed * speed;
  const disc = s2 * s2 - g * (g * distance * distance + 2 * dy * s2);
  let pitch =
    disc > 0 ? atan2(s2 + (intent.lob ? 1 : -1) * sqrt(disc), g * distance) : 0.7853981633974483;
  pitch = intent.lob ? clamp(pitch, LOB_MIN_PITCH, 1.35) : clamp(pitch, -0.2, 1.1);
  let yaw = 0;

  let prevYaw = yaw;
  let prevPitch = pitch;
  let prevErr: Crossing | null = null;
  let err: Crossing = { lateral: 0, vertical: 0, bounced: false };
  let iterations = 0;

  for (; iterations < maxIterations; iterations++) {
    const velocity = scale(launchDirection(aim, right, yaw, pitch), speed);
    err = crossTargetPlane(
      kickedBall(from, velocity, spin),
      intent.target,
      aim,
      right,
      distance,
      physics,
      surface,
    );
    if (sqrt(err.lateral * err.lateral + err.vertical * err.vertical) < tolerance) break;

    // Newton steps with the geometric sensitivity (≈ distance per radian), refined by secant
    // steps when their slope has the expected sign; steps are bounded to stay on one branch
    // (driven or lob) of the solution.
    const pitchSign = intent.lob ? -1 : 1;
    let yawSlope = distance;
    let pitchSlope = pitchSign * distance;
    if (prevErr !== null) {
      const dYaw = yaw - prevYaw;
      const dPitch = pitch - prevPitch;
      if (!err.bounced && !prevErr.bounced && Math.abs(dYaw) > 1e-12) {
        const slope = (err.lateral - prevErr.lateral) / dYaw;
        if (slope > 0) yawSlope = slope;
      }
      if (Math.abs(dPitch) > 1e-12) {
        const slope = (err.vertical - prevErr.vertical) / dPitch;
        if (slope * pitchSign > 0) pitchSlope = slope;
      }
    }
    const nextYaw = err.bounced ? yaw : yaw - clamp(err.lateral / yawSlope, -MAX_STEP, MAX_STEP);
    const nextPitch = pitch - clamp(err.vertical / pitchSlope, -MAX_STEP, MAX_STEP);
    prevYaw = yaw;
    prevPitch = pitch;
    prevErr = err;
    yaw = clamp(nextYaw, -1.2, 1.2);
    // A lob stays above the max-range angle (≈ 40° with drag), a driven shot below it.
    pitch = intent.lob ? clamp(nextPitch, LOB_MIN_PITCH, 1.35) : clamp(nextPitch, -0.2, 1.1);
  }

  const miss = sqrt(err.lateral * err.lateral + err.vertical * err.vertical);
  return {
    velocity: scale(launchDirection(aim, right, yaw, pitch), speed),
    spin,
    miss,
    iterations: Math.min(iterations + 1, maxIterations),
    converged: miss < tolerance,
  };
}

/**
 * Applies the seeded execution error of the shooter to an ideal strike: angular noise in the
 * accuracy cone, plus proportional noise on pace and spin.
 */
export function applyExecutionError(
  solution: Pick<ShotSolution, 'velocity' | 'spin'>,
  profile: ShooterProfile,
  rng: Rng,
  tuning: ShotTuning = DEFAULT_SHOT_TUNING,
): { velocity: Vec3; spin: Vec3 } {
  const { velocity } = solution;
  const speed = sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
  if (speed === 0) return { velocity, spin: solution.spin };

  const horizontal = sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
  const aim =
    horizontal > 1e-9 ? v3(velocity.x / horizontal, 0, velocity.z / horizontal) : v3(1, 0, 0);
  const right = cross(aim, UP);
  const yaw = rng.normal(0, profile.errorRad);
  const pitch = atan2(velocity.y, horizontal) + rng.normal(0, profile.errorRad * 0.6);
  const relative = profile.errorRad * tuning.paceErrorRatio;
  const newSpeed = speed * (1 + rng.normal(0, relative));
  const spinFactor = 1 + rng.normal(0, relative * 2);

  return {
    velocity: scale(launchDirection(aim, right, yaw, pitch), newSpeed),
    spin: scale(solution.spin, spinFactor),
  };
}
