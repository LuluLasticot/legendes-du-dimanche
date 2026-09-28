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
import type { DefenderSetup, KeeperSetup } from './shot-moment.ts';

export type PassOutcome = 'received' | 'intercepted' | 'lost';

export type PassEvent =
  | FlightEvent
  | { readonly tick: Tick; readonly type: 'received'; readonly pos: Vec3 }
  | {
      readonly tick: Tick;
      readonly type: 'intercepted';
      /** Index of the defender, or 'keeper'. */
      readonly by: number | 'keeper';
      readonly pos: Vec3;
      readonly speed: number;
    };

export interface PassMomentSetup {
  /** Ball at the instant of the pass (after execution error). */
  readonly ball: BallState;
  readonly physics: PhysicsParams;
  readonly surface: PhysicsSurface;
  readonly receiver: {
    readonly from: Vec3;
    /** 1–99 pace (VIT). */
    readonly pace: number;
    /** Speed of his run when the pass is played (m/s): he is already on the move. */
    readonly speed?: number;
    readonly tuning?: ReceiverTuning;
  };
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
}

export interface PassMomentState {
  readonly tick: Tick;
  readonly flight: FlightState;
  readonly receiver: ReceiverState;
  readonly keeper: KeeperState | null;
  readonly defenders: readonly DefenderState[];
  readonly outcome: PassOutcome | null;
}

export interface PassMomentContext {
  readonly setup: PassMomentSetup;
  readonly flight: FlightContext;
  readonly receiverTuning: ReceiverTuning;
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

function plan(
  feet: Vec3,
  speed: number,
  tick: Tick,
  ball: BallState,
  context: PassMomentContext,
): ReceiverState['meet'] {
  const path = simulateFlight(ball, { ...context.flight, rng: null }, { maxTicks: 6 * 120 });
  const reception = planReception(
    feet,
    context.setup.receiver.pace,
    path.samples,
    context.receiverTuning,
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
    receiverTuning: setup.receiver.tuning ?? DEFAULT_RECEIVER_TUNING,
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
  const from = v3(setup.receiver.from.x, 0, setup.receiver.from.z);
  const speed = setup.receiver.speed ?? 0;
  const meet = plan(from, speed, 0, setup.ball, context);
  const toMeet = meet ? sub(meet.feet, from) : v3(0, 0, 0);
  const d = length(toMeet);
  return {
    context,
    state: {
      tick: 0,
      flight: startFlight(setup.ball),
      receiver: { feet: from, vel: d > 1e-6 ? scale(toMeet, speed / d) : v3(0, 0, 0), meet },
      keeper,
      defenders,
      outcome: null,
    },
  };
}

/** Runs the receiver towards his meeting point, arriving on time rather than early. */
function stepReceiver(
  receiver: ReceiverState,
  tick: Tick,
  context: PassMomentContext,
): ReceiverState {
  const meet = receiver.meet;
  if (meet === null) return { ...receiver, vel: v3(0, 0, 0) };
  const tuning = context.receiverTuning;
  const top = lerp(
    tuning.speedRange[0],
    tuning.speedRange[1],
    clamp((context.setup.receiver.pace - 1) / 98, 0, 1),
  );
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

  let receiver = stepReceiver(state.receiver, tick, context);
  if (outcome === null) {
    const ball = flight.ball;
    const gap = length(sub(v3(ball.pos.x, 0, ball.pos.z), receiver.feet));
    const reach = context.receiverTuning.controlRadius + 0.25;
    if (gap <= reach && ball.pos.y <= context.receiverTuning.maxHeight) {
      outcome = 'received';
      events.push({ tick, type: 'received', pos: ball.pos });
    } else if (
      (flight.outcome !== null && flight.outcome !== 'stopped') ||
      tick * TICK_DT > MAX_SECONDS
    ) {
      outcome = 'lost';
    } else {
      // The path only drifts from the prediction on jittery bounces; re-plan then, or if late.
      const bounced = stepped.events.some((e) => e.type === 'bounce');
      const late = receiver.meet !== null && tick > receiver.meet.tick + 3;
      if (late || (bounced && context.flight.rng !== null)) {
        const speed = length(receiver.vel);
        receiver = { ...receiver, meet: plan(receiver.feet, speed, tick, ball, context) };
      }
      if (receiver.meet === null && flight.outcome === 'stopped') outcome = 'lost';
    }
  }

  return { state: { tick, flight, receiver, keeper, defenders, outcome }, events };
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
