// A pass key moment: the ball rolls to the receiver's run while markers try to cut it out and
// the keeper shifts across. Ends when the receiver meets the ball (then a first-time shot moment
// starts from that state), when it is intercepted, or when it is lost (out of play, out of reach).
// Pure and deterministic, stepped at the fixed tick rate like the shot moment.

import {
  startFlight,
  stepFlight,
  type FlightContext,
  type FlightEvent,
  type FlightState,
} from '../physics/flight.ts';
import { simulateFlight } from '../physics/flight.ts';
import type { BallState } from '../physics/ball.ts';
import type { PhysicsParams, PhysicsSurface } from '../physics/params.ts';
import { add, length, scale, sub, v3, type Vec3 } from '../physics/vec3.ts';
import { Rng, type Seed } from '../rng/index.ts';
import { TICK_DT, type Tick } from '../time/index.ts';
import { clamp, lerp } from '../math/index.ts';
import {
  createDefender,
  DEFAULT_DEFENDER_TUNING,
  defenderContact,
  stepDefender,
  touchedDefender,
  type DefenderState,
  type DefenderTuning,
} from './defenders.ts';
import {
  createKeeper,
  DEFAULT_KEEPER_TUNING,
  keeperContact,
  keeperFollow,
  keeperSetPosition,
  type KeeperState,
  type KeeperTuning,
} from './keeper.ts';
import { DEFAULT_RECEIVER_TUNING, planReception, type ReceiverTuning } from './pass.ts';
import { PITCH } from '../physics/constants.ts';
import type { DefenderSetup, KeeperSetup } from './shot-moment.ts';

export type PassOutcome = 'received' | 'intercepted' | 'lost' | 'offside';

export type PassEvent =
  | FlightEvent
  | { readonly tick: Tick; readonly type: 'received'; readonly by: number; readonly pos: Vec3 }
  /** The teammate who met the ball was beyond the second-last defender when it was played. */
  | { readonly tick: Tick; readonly type: 'offside'; readonly by: number; readonly pos: Vec3 }
  | {
      readonly tick: Tick;
      readonly type: 'intercepted';
      /** Index of the defender, or 'keeper'. */
      readonly by: number | 'keeper';
      readonly pos: Vec3;
      readonly speed: number;
    };

/** A teammate running for the ball. */
export interface ReceiverSetup {
  readonly from: Vec3;
  /** 1–99 pace (VIT). */
  readonly pace: number;
  /** Speed of his run when the pass is played (m/s): he is already on the move. */
  readonly speed?: number;
  /**
   * Direction he keeps running in (unit, horizontal) when the ball cannot reach him. Without it
   * he stands still then.
   */
  readonly run?: Vec3;
  readonly tuning?: ReceiverTuning;
}

export interface PassMomentSetup {
  /** Ball at the instant of the pass (after execution error). */
  readonly ball: BallState;
  readonly physics: PhysicsParams;
  readonly surface: PhysicsSurface;
  /** The teammates who run for the ball: whoever meets it first gets it. At least one. */
  readonly receivers: readonly ReceiverSetup[];
  /** Apply the offside rule at the instant of the pass (default true). */
  readonly offside?: boolean;
  readonly keeper: KeeperSetup | null;
  readonly defenders?: readonly DefenderSetup[];
  readonly defenderTuning?: DefenderTuning;
  readonly seed: Seed;
}

export interface ReceiverState {
  readonly feet: Vec3;
  readonly vel: Vec3;
  /** Where and when (absolute tick) he meets the ball, or null if he cannot. */
  readonly meet: { readonly tick: Tick; readonly feet: Vec3 } | null;
  /** Beyond the second-last defender and the ball when the pass was played. */
  readonly offside: boolean;
}

export interface PassMomentState {
  readonly tick: Tick;
  readonly flight: FlightState;
  readonly receivers: readonly ReceiverState[];
  readonly keeper: KeeperState | null;
  readonly defenders: readonly DefenderState[];
  readonly outcome: PassOutcome | null;
}

export interface PassMomentContext {
  readonly setup: PassMomentSetup;
  readonly flight: FlightContext;
  readonly receiverTunings: readonly ReceiverTuning[];
  readonly keeperTuning: KeeperTuning;
  readonly keeperRng: Rng;
  readonly defenderTuning: DefenderTuning;
  readonly defenderRng: Rng;
  readonly defenderSetups: readonly DefenderSetup[];
}

/** Markers' reaction to a pass, relative to their reaction to a shot. */
const PASS_READ_FACTOR = 1.6;
/** Longest a pass moment lasts (s) before the ball counts as lost. */
const MAX_SECONDS = 8;
/** Per tick, the slowing down of a teammate the ball will not reach (0.99⁴ᴵ²⁰: ~0.3 after 1 s). */
const COAST_DRAG = 0.99;

function plan(
  index: number,
  feet: Vec3,
  speed: number,
  tick: Tick,
  ball: BallState,
  context: PassMomentContext,
): ReceiverState['meet'] {
  const path = simulateFlight(ball, { ...context.flight, rng: null }, { maxTicks: 6 * 120 });
  const reception = planReception(
    feet,
    (context.setup.receivers[index] as ReceiverSetup).pace,
    path.samples,
    context.receiverTunings[index],
    speed,
  );
  return reception ? { tick: tick + reception.tick, feet: reception.feet } : null;
}

export function startPassMoment(setup: PassMomentSetup): {
  context: PassMomentContext;
  state: PassMomentState;
} {
  const root = Rng.create(setup.seed);
  const jitter = setup.physics.surfaces[setup.surface].bounceJitter > 0;
  const defenderRng = root.fork('defenders');
  const keeperRng = root.fork('keeper');
  const keeperTuning = setup.keeper?.tuning ?? DEFAULT_KEEPER_TUNING;
  const defenderTuning = setup.defenderTuning ?? DEFAULT_DEFENDER_TUNING;
  const setups = setup.defenders ?? [];
  const context: PassMomentContext = {
    setup,
    flight: {
      params: setup.physics,
      surface: setup.surface,
      rng: jitter ? root.fork('bounces') : null,
    },
    receiverTunings: setup.receivers.map((r) => r.tuning ?? DEFAULT_RECEIVER_TUNING),
    keeperTuning,
    keeperRng,
    defenderTuning,
    defenderRng,
    defenderSetups: setups,
  };
  const keeper = setup.keeper
    ? createKeeper(
        setup.keeper.feet ??
          keeperSetPosition(setup.ball.pos, setup.keeper.attributes, keeperTuning),
        setup.keeper.attributes,
        keeperTuning,
        keeperRng,
      )
    : null;
  // Markers facing a shooter read his body shape; a pass from elsewhere is read later.
  const reading: DefenderTuning = {
    ...defenderTuning,
    reactionRange: [
      defenderTuning.reactionRange[0] * PASS_READ_FACTOR,
      defenderTuning.reactionRange[1] * PASS_READ_FACTOR,
    ],
  };
  const defenders = setups.map((d) =>
    createDefender(d.role, d.feet ?? setup.ball.pos, d.attributes, reading, defenderRng),
  );
  const offsideLine =
    setup.offside === false
      ? Infinity
      : offsideLineX(
          setup.ball.pos.x,
          defenders.map((d) => d.feet),
          keeper?.feet ?? null,
        );
  const receivers = setup.receivers.map((r, i): ReceiverState => {
    const from = v3(r.from.x, 0, r.from.z);
    const speed = r.speed ?? 0;
    const meet = plan(i, from, speed, 0, setup.ball, context);
    const toMeet = meet ? sub(meet.feet, from) : (r.run ?? v3(0, 0, 0));
    const d = length(toMeet);
    return {
      feet: from,
      vel: d > 1e-6 ? scale(toMeet, speed / d) : v3(0, 0, 0),
      meet,
      offside: isOffside(from, offsideLine, setup.ball.pos.x),
    };
  });
  return {
    context,
    state: {
      tick: 0,
      flight: startFlight(setup.ball),
      receivers,
      keeper,
      defenders,
      outcome: null,
    },
  };
}

/** Runs the receiver towards his meeting point, arriving on time rather than early. */
function stepReceiver(
  index: number,
  receiver: ReceiverState,
  tick: Tick,
  context: PassMomentContext,
): ReceiverState {
  const meet = receiver.meet;
  const setup = context.setup.receivers[index] as ReceiverSetup;
  if (meet === null) {
    // The ball cannot reach him: he keeps running the way he was, slowing down, if he has a run.
    if (setup.run === undefined) return { ...receiver, vel: v3(0, 0, 0) };
    const vel = scale(receiver.vel, COAST_DRAG);
    return { ...receiver, feet: add(receiver.feet, scale(vel, TICK_DT)), vel };
  }
  const tuning = context.receiverTunings[index] as ReceiverTuning;
  const top = lerp(tuning.speedRange[0], tuning.speedRange[1], clamp((setup.pace - 1) / 98, 0, 1));
  const toMeet = sub(meet.feet, receiver.feet);
  const distance = length(toMeet);
  if (distance < 1e-6) return { ...receiver, vel: v3(0, 0, 0) };
  const ticksLeft = Math.max(1, meet.tick - tick + 1);
  const needed = distance / (ticksLeft * TICK_DT);
  const accelerated = length(receiver.vel) + (top / tuning.accelerationTime) * TICK_DT;
  // A bit of hurry: the plan keeps a margin, so he never has to wait for long nor arrive late.
  const speed = Math.min(top, accelerated, Math.max(needed * 1.3, 2));
  const stepLength = Math.min(distance, speed * TICK_DT);
  const dir = scale(toMeet, 1 / distance);
  return { ...receiver, feet: add(receiver.feet, scale(dir, stepLength)), vel: scale(dir, speed) };
}

export function stepPassMoment(
  state: PassMomentState,
  context: PassMomentContext,
): { state: PassMomentState; events: PassEvent[] } {
  const tick = state.tick + 1;
  const events: PassEvent[] = [];
  if (state.outcome !== null) return { state: { ...state, tick }, events };

  const stepped = stepFlight(state.flight, context.flight);
  let flight = stepped.state;
  for (const e of stepped.events) events.push(e);
  let outcome: PassOutcome | null = null;

  const defenders: DefenderState[] = [];
  for (let i = 0; i < state.defenders.length; i++) {
    const setupD = context.defenderSetups[i] as DefenderSetup;
    let next = stepDefender(
      state.defenders[i] as DefenderState,
      tick,
      flight.ball,
      setupD.attributes,
      context.defenderTuning,
      context.flight,
    );
    if (outcome === null) {
      const contact = defenderContact(
        next,
        tick,
        flight.ball,
        setupD.attributes,
        context.defenderTuning,
        context.defenderRng,
      );
      if (contact) {
        next = touchedDefender(next, tick);
        flight = { ...flight, ball: contact.ball };
        outcome = 'intercepted';
        events.push({ tick, type: 'intercepted', by: i, pos: contact.pos, speed: contact.speed });
      }
    }
    defenders.push(next);
  }

  let keeper = state.keeper;
  const keeperSetup = context.setup.keeper;
  if (keeper && keeperSetup) {
    keeper = keeperFollow(keeper, flight.ball.pos, keeperSetup.attributes, context.keeperTuning);
    if (outcome === null) {
      const contact = keeperContact(
        keeper,
        tick,
        flight.ball,
        keeperSetup.attributes,
        context.keeperTuning,
        context.keeperRng,
      );
      if (contact) {
        outcome = 'intercepted';
        if (contact.kind === 'parry') flight = { ...flight, ball: contact.ball };
        events.push({
          tick,
          type: 'intercepted',
          by: 'keeper',
          pos: contact.pos,
          speed: contact.speed,
        });
      }
    }
  }

  let receivers = state.receivers.map((r, i) => stepReceiver(i, r, tick, context));
  if (outcome === null) {
    const ball = flight.ball;
    const gap = (r: ReceiverState): number => length(sub(v3(ball.pos.x, 0, ball.pos.z), r.feet));
    const first = receivers.findIndex(
      (r, i) =>
        gap(r) <= (context.receiverTunings[i] as ReceiverTuning).controlRadius + 0.25 &&
        ball.pos.y <= (context.receiverTunings[i] as ReceiverTuning).maxHeight,
    );
    if (first >= 0) {
      const by = state.receivers[first] as ReceiverState;
      if (by.offside) {
        outcome = 'offside';
        events.push({ tick, type: 'offside', by: first, pos: ball.pos });
      } else {
        outcome = 'received';
        events.push({ tick, type: 'received', by: first, pos: ball.pos });
      }
    } else if (
      (flight.outcome !== null && flight.outcome !== 'stopped') ||
      tick * TICK_DT > MAX_SECONDS
    ) {
      outcome = 'lost';
    } else {
      // The path only drifts from the prediction on jittery bounces; re-plan then, or if late.
      const bounced = stepped.events.some((e) => e.type === 'bounce');
      receivers = receivers.map((r, i) => {
        const late = r.meet !== null && tick > r.meet.tick + 3;
        if (!late && !(bounced && context.flight.rng !== null)) return r;
        return { ...r, meet: plan(i, r.feet, length(r.vel), tick, ball, context) };
      });
      if (flight.outcome === 'stopped' && receivers.every((r) => r.meet === null)) outcome = 'lost';
    }
  }

  return { state: { tick, flight, receivers, keeper, defenders, outcome }, events };
}

export interface PassMomentResult {
  readonly outcome: PassOutcome | null;
  readonly events: readonly PassEvent[];
  readonly states: readonly PassMomentState[];
}

/** Runs a whole pass moment (tests, server validation). */
export function simulatePassMoment(setup: PassMomentSetup): PassMomentResult {
  const { context, state: initial } = startPassMoment(setup);
  let state = initial;
  const states: PassMomentState[] = [state];
  const events: PassEvent[] = [];
  while (state.outcome === null) {
    const next = stepPassMoment(state, context);
    state = next.state;
    states.push(state);
    for (const e of next.events) events.push(e);
  }
  return { outcome: state.outcome, events, states };
}

/** Defender setups carrying the players' current positions into the shot moment that follows. */
export function defendersAfterPass(
  setups: readonly DefenderSetup[],
  states: readonly DefenderState[],
): DefenderSetup[] {
  return setups.map((d, i) => {
    const s = states[i];
    return s ? { ...d, feet: v3(s.feet.x, 0, s.feet.z) } : d;
  });
}

/**
 * X of the offside line: the second-last opponent (the keeper counts) as seen from the goal at
 * +X. Nobody stands in front of the ball or the halfway line for it to matter.
 */
export function offsideLineX(
  ballX: number,
  defenders: readonly Vec3[],
  keeper: Vec3 | null,
): number {
  const xs = defenders.map((d) => d.x);
  if (keeper) xs.push(keeper.x);
  xs.sort((a, b) => b - a);
  // Fewer than two opponents: only the goal line remains.
  const line = xs[1] ?? xs[0] ?? PITCH.goalLineX;
  return Math.max(line, ballX, 0);
}

/** A little play: a player level with the line, or by a hair beyond it, is onside. */
const OFFSIDE_TOLERANCE = 0.15;

export function isOffside(feet: Vec3, line: number, ballX: number): boolean {
  return feet.x > Math.max(line, ballX) + OFFSIDE_TOLERANCE;
}
