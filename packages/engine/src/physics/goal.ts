// Goal frame (posts, crossbar) collisions and net containment, for the goal at +X.

import { clamp, pow } from '../math/index.ts';
import type { BallState } from './ball.ts';
import { BALL, GOAL, PITCH } from './constants.ts';
import type { FrameParams } from './params.ts';
import { add, addScaled, dot, length, scale, sub, v3, type Vec3 } from './vec3.ts';

export type FramePart = 'left-post' | 'right-post' | 'crossbar';

interface Segment {
  readonly part: FramePart;
  readonly a: Vec3;
  readonly b: Vec3;
}

/** Z of the post centre lines (inner width + post radius). */
const POST_Z = GOAL.width / 2 + GOAL.postRadius;
/** Y of the crossbar centre line. */
const BAR_Y = GOAL.height + GOAL.postRadius;

/** Left and right from the attacker's point of view (facing +X, +Z on the right). */
export const FRAME_SEGMENTS: readonly Segment[] = [
  { part: 'left-post', a: v3(PITCH.goalLineX, 0, -POST_Z), b: v3(PITCH.goalLineX, BAR_Y, -POST_Z) },
  { part: 'right-post', a: v3(PITCH.goalLineX, 0, POST_Z), b: v3(PITCH.goalLineX, BAR_Y, POST_Z) },
  {
    part: 'crossbar',
    a: v3(PITCH.goalLineX, BAR_Y, -POST_Z),
    b: v3(PITCH.goalLineX, BAR_Y, POST_Z),
  },
];

function closestPointOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ab = sub(b, a);
  const t = clamp(dot(sub(p, a), ab) / dot(ab, ab), 0, 1);
  return addScaled(a, ab, t);
}

export interface FrameHit {
  readonly part: FramePart;
  /** Normal impact speed, m/s. */
  readonly speed: number;
}

/** Sub-samples of the tick's motion checked against the frame (prevents tunnelling at 40 m/s). */
const FRAME_SUBSTEPS = 4;

/**
 * Resolves a collision with the goal frame along the tick's motion from `prevPos` (at most one
 * part per step, checked in a fixed order).
 */
export function collideFrame(
  ball: BallState,
  params: FrameParams,
  prevPos: Vec3 = ball.pos,
): { state: BallState; hit: FrameHit | null } {
  for (let i = 1; i <= FRAME_SUBSTEPS; i++) {
    const at = addScaled(prevPos, sub(ball.pos, prevPos), i / FRAME_SUBSTEPS);
    const result = collideFrameAt({ ...ball, pos: at }, params);
    if (result.hit !== null) return result;
  }
  return { state: ball, hit: null };
}

function collideFrameAt(
  ball: BallState,
  params: FrameParams,
): { state: BallState; hit: FrameHit | null } {
  const minDist = BALL.radius + GOAL.postRadius;
  for (const segment of FRAME_SEGMENTS) {
    const p = closestPointOnSegment(ball.pos, segment.a, segment.b);
    const d = sub(ball.pos, p);
    const dist = length(d);
    if (dist >= minDist || dist < 1e-9) continue;
    const n = scale(d, 1 / dist);
    const vn = dot(ball.vel, n);
    if (vn >= 0) continue;
    const vel = addScaled(ball.vel, n, -(1 + params.postRestitution) * vn);
    const pos = add(p, scale(n, minDist));
    return {
      state: { ...ball, pos, vel, spin: scale(ball.spin, 0.5), grounded: false },
      hit: { part: segment.part, speed: -vn },
    };
  }
  return { state: ball, hit: null };
}

/** True if the ball centre is inside the goal mouth (between posts, under the bar). */
export function inGoalMouth(pos: Vec3): boolean {
  return pos.z > -GOAL.width / 2 && pos.z < GOAL.width / 2 && pos.y < GOAL.height;
}

/**
 * Keeps a ball that went in inside the net and slows it down. Returns the impact speed on a net
 * wall if it hit one this step (drives the net deformation in the renderer).
 */
export function containInNet(
  ball: BallState,
  params: FrameParams,
  dt: number,
): { state: BallState; netImpact: number | null } {
  const r = BALL.radius;
  const back = PITCH.goalLineX + GOAL.netDepth - r;
  const side = GOAL.width / 2 - r;
  const roof = GOAL.height - r;
  let { x, y, z } = ball.pos;
  let { x: vx, y: vy, z: vz } = ball.vel;
  let impact: number | null = null;

  if (x > back && vx > 0) {
    impact = vx;
    x = back;
    vx *= -0.1;
  }
  if (z > side && vz > 0) {
    impact = Math.max(impact ?? 0, vz);
    z = side;
    vz *= -0.1;
  } else if (z < -side && vz < 0) {
    impact = Math.max(impact ?? 0, -vz);
    z = -side;
    vz *= -0.1;
  }
  if (y > roof && vy > 0) {
    impact = Math.max(impact ?? 0, vy);
    y = roof;
    vy *= -0.1;
  }

  const k = pow(params.netSpeedRetention, dt);
  return {
    state: {
      ...ball,
      pos: v3(x, y, z),
      vel: v3(vx * k, vy * k, vz * k),
      spin: scale(ball.spin, k),
    },
    netImpact: impact,
  };
}
