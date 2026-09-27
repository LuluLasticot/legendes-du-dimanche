// Ball integrator: gravity, quadratic drag, Magnus lift, spin decay, wind, bounces and rolling.
// Semi-implicit Euler at the fixed tick rate; the shot solver uses the same integrator, so what
// the player aims is exactly what flies.

import { exp, sinCos } from '../math/index.ts';
import type { Rng } from '../rng/index.ts';
import { BALL } from './constants.ts';
import type { PhysicsParams, PhysicsSurface, SurfaceParams } from './params.ts';
import { addScaled, cross, length, scale, sub, v3, type Vec3 } from './vec3.ts';

export interface BallState {
  readonly pos: Vec3;
  readonly vel: Vec3;
  /** Angular velocity, rad/s (right-hand rule). +Y spin curls a ball travelling +X towards −Z. */
  readonly spin: Vec3;
  /** Rolling on the ground (no more bounces until kicked again). */
  readonly grounded: boolean;
}

export interface BallStepResult {
  readonly state: BallState;
  /** Vertical impact speed if the ball bounced during this step. */
  readonly bounce: number | null;
}

/** Spin decay time constant while rolling, seconds. */
const GROUND_SPIN_DECAY_TIME = 0.5;

/** Ball at rest on the ground. */
export function restingBall(x: number, z: number): BallState {
  return { pos: v3(x, BALL.radius, z), vel: v3(0, 0, 0), spin: v3(0, 0, 0), grounded: true };
}

/** Ball struck with the given velocity and spin (leaves the ground). */
export function kickedBall(pos: Vec3, vel: Vec3, spin: Vec3): BallState {
  return { pos, vel, spin, grounded: false };
}

/** Acceleration from gravity, drag and Magnus for a ball moving at `vel` with `spin`. */
export function airAcceleration(vel: Vec3, spin: Vec3, params: PhysicsParams): Vec3 {
  const { gravity, airDensity, dragCoefficient, magnusCoefficient, wind } = params.air;
  const rel = sub(vel, wind);
  const speed = length(rel);
  const kDrag = (0.5 * airDensity * dragCoefficient * BALL.area) / BALL.mass;
  const kMagnus = (0.5 * airDensity * BALL.area * BALL.radius * magnusCoefficient) / BALL.mass;
  const drag = scale(rel, -kDrag * speed);
  const magnus = scale(cross(spin, rel), kMagnus);
  return v3(drag.x + magnus.x, drag.y + magnus.y - gravity, drag.z + magnus.z);
}

function bounceOff(
  vel: Vec3,
  spin: Vec3,
  surface: SurfaceParams,
  rng: Rng | null,
): { vel: Vec3; spin: Vec3 } {
  let restitution = surface.restitution;
  let vx = vel.x * (1 - surface.bounceFriction);
  let vz = vel.z * (1 - surface.bounceFriction);
  if (surface.bounceJitter > 0 && rng !== null) {
    restitution *= 1 + surface.bounceJitter * (rng.float() * 2 - 1) * 0.5;
    const [s, c] = sinCos(surface.bounceJitter * (rng.float() * 2 - 1) * 0.35);
    const rx = vx * c - vz * s;
    vz = vx * s + vz * c;
    vx = rx;
  }
  return { vel: v3(vx, -vel.y * restitution, vz), spin: scale(spin, 1 - surface.bounceFriction) };
}

/**
 * Advances the ball by `dt` seconds on the given surface. `rng` feeds bounce jitter (stabilisé);
 * pass the moment's generator so bounces stay reproducible, or null for a jitter-free prediction.
 */
export function stepBall(
  ball: BallState,
  params: PhysicsParams,
  surfaceId: PhysicsSurface,
  dt: number,
  rng: Rng | null,
): BallStepResult {
  const surface = params.surfaces[surfaceId];
  const r = BALL.radius;

  if (ball.grounded && ball.vel.y <= 0) {
    // Rolling: rolling resistance + air drag, spin dies quickly.
    const acc = airAcceleration(ball.vel, v3(0, 0, 0), params);
    let vx = ball.vel.x + acc.x * dt;
    let vz = ball.vel.z + acc.z * dt;
    const speed = length(v3(vx, 0, vz));
    const decel = surface.rollingResistance * params.air.gravity * dt;
    if (speed <= decel) {
      vx = 0;
      vz = 0;
    } else {
      const k = (speed - decel) / speed;
      vx *= k;
      vz *= k;
    }
    const vel = v3(vx, 0, vz);
    return {
      state: {
        pos: v3(ball.pos.x + vx * dt, r, ball.pos.z + vz * dt),
        vel,
        spin: scale(ball.spin, exp(-dt / GROUND_SPIN_DECAY_TIME)),
        grounded: true,
      },
      bounce: null,
    };
  }

  const acc = airAcceleration(ball.vel, ball.spin, params);
  let vel = addScaled(ball.vel, acc, dt);
  let pos = addScaled(ball.pos, vel, dt);
  let spin = scale(ball.spin, exp(-dt / params.air.spinDecayTime));

  if (pos.y < r && vel.y < 0) {
    const impact = -vel.y;
    pos = v3(pos.x, r, pos.z);
    if (impact > surface.rollThreshold) {
      const bounced = bounceOff(vel, spin, surface, rng);
      return {
        state: { pos, vel: bounced.vel, spin: bounced.spin, grounded: false },
        bounce: impact,
      };
    }
    vel = v3(vel.x, 0, vel.z);
    spin = scale(spin, 1 - surface.bounceFriction);
    return { state: { pos, vel, spin, grounded: true }, bounce: null };
  }

  return { state: { pos, vel, spin, grounded: false }, bounce: null };
}
