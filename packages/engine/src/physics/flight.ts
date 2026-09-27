// Ball flight in the world: integrator + goal frame + net + out-of-play detection, one tick at a
// time. `stepFlight` is the building block of key moments; `simulateFlight` runs a whole flight
// (trajectory prediction, shot solver, tests).

import type { Rng } from '../rng/index.ts';
import { TICK_DT, type Tick } from '../time/index.ts';
import { stepBall, type BallState } from './ball.ts';
import { BALL, GOAL, PITCH } from './constants.ts';
import { collideFrame, containInNet, inGoalMouth, type FramePart } from './goal.ts';
import type { PhysicsParams, PhysicsSurface } from './params.ts';
import { horizontalLength, type Vec3 } from './vec3.ts';

export type FlightOutcome = 'goal' | 'wide' | 'over' | 'touchline' | 'stopped';

export type FlightEvent =
  | { readonly tick: Tick; readonly type: 'bounce'; readonly pos: Vec3; readonly speed: number }
  | {
      readonly tick: Tick;
      readonly type: 'frame';
      readonly part: FramePart;
      readonly pos: Vec3;
      readonly speed: number;
    }
  | { readonly tick: Tick; readonly type: 'net'; readonly pos: Vec3; readonly speed: number }
  | {
      readonly tick: Tick;
      readonly type: 'outcome';
      readonly outcome: FlightOutcome;
      readonly pos: Vec3;
    };

export interface FlightState {
  readonly tick: Tick;
  readonly ball: BallState;
  /** Set once the flight is decided (goal, out of play, ball at rest). */
  readonly outcome: FlightOutcome | null;
}

export interface FlightContext {
  readonly params: PhysicsParams;
  readonly surface: PhysicsSurface;
  /** Generator for bounce jitter, or null for a jitter-free prediction. */
  readonly rng: Rng | null;
}

/** Horizontal speed under which a rolling ball is considered stopped. */
const STOP_SPEED = 0.05;

export function startFlight(ball: BallState): FlightState {
  return { tick: 0, ball, outcome: null };
}

/** Advances the flight by one tick and reports what happened during it. */
export function stepFlight(
  state: FlightState,
  ctx: FlightContext,
): { state: FlightState; events: FlightEvent[] } {
  const tick = state.tick + 1;
  const events: FlightEvent[] = [];
  const prev = state.ball;

  const stepped = stepBall(prev, ctx.params, ctx.surface, TICK_DT, ctx.rng);
  let ball = stepped.state;
  if (stepped.bounce !== null)
    events.push({ tick, type: 'bounce', pos: ball.pos, speed: stepped.bounce });

  let outcome = state.outcome;
  if (outcome === 'goal') {
    const net = containInNet(ball, ctx.params.frame, TICK_DT);
    ball = net.state;
    if (net.netImpact !== null && net.netImpact > 0.5) {
      events.push({ tick, type: 'net', pos: ball.pos, speed: net.netImpact });
    }
    return { state: { tick, ball, outcome }, events };
  }

  const frame = collideFrame(ball, ctx.params.frame, prev.pos);
  ball = frame.state;
  if (frame.hit !== null) {
    events.push({
      tick,
      type: 'frame',
      part: frame.hit.part,
      pos: ball.pos,
      speed: frame.hit.speed,
    });
  }

  if (outcome === null) {
    const line = PITCH.goalLineX + BALL.radius;
    if (prev.pos.x <= line && ball.pos.x > line) {
      outcome = inGoalMouth(ball.pos) ? 'goal' : ball.pos.y >= GOAL.height ? 'over' : 'wide';
    } else if (ball.pos.x < -line) {
      outcome = 'wide';
    } else if (
      ball.pos.z > PITCH.width / 2 + BALL.radius ||
      ball.pos.z < -PITCH.width / 2 - BALL.radius
    ) {
      outcome = 'touchline';
    } else if (ball.grounded && horizontalLength(ball.vel) < STOP_SPEED) {
      outcome = 'stopped';
    }
    if (outcome !== null) events.push({ tick, type: 'outcome', outcome, pos: ball.pos });
  }

  return { state: { tick, ball, outcome }, events };
}

export interface FlightOptions {
  /** Hard cap on the simulated duration, in ticks (default: 6 s). */
  readonly maxTicks?: number;
  /** Ticks simulated after the outcome (ball in the net, rolling out…), default 0. */
  readonly ticksAfterOutcome?: number;
}

export interface FlightResult {
  /** Ball state at every tick, index = tick (index 0 = initial state). */
  readonly samples: readonly BallState[];
  readonly events: readonly FlightEvent[];
  readonly outcome: FlightOutcome | null;
  /** Tick at which the outcome was decided, or null. */
  readonly outcomeTick: Tick | null;
}

export function simulateFlight(
  ball: BallState,
  ctx: FlightContext,
  options: FlightOptions = {},
): FlightResult {
  const maxTicks = options.maxTicks ?? 720;
  const after = options.ticksAfterOutcome ?? 0;
  const samples: BallState[] = [ball];
  const events: FlightEvent[] = [];
  let state = startFlight(ball);
  let outcomeTick: Tick | null = null;

  while (state.tick < maxTicks) {
    const next = stepFlight(state, ctx);
    state = next.state;
    samples.push(state.ball);
    for (const event of next.events) events.push(event);
    if (outcomeTick === null && state.outcome !== null) outcomeTick = state.tick;
    if (outcomeTick !== null && state.tick - outcomeTick >= after) break;
  }

  return { samples, events, outcome: state.outcome, outcomeTick };
}
