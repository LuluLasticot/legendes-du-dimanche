// A shot key moment: ball flight + goalkeeper, stepped together at the fixed tick rate.
// Pure and deterministic: same setup (including the seed) → same ticks, events and outcome, so
// the server can re-simulate it and the renderer can replay it from any camera.

import { kickedBall, type BallState } from '../physics/ball.ts';
import {
  startFlight,
  stepFlight,
  type FlightContext,
  type FlightEvent,
  type FlightOutcome,
  type FlightState,
} from '../physics/flight.ts';
import type { PhysicsParams, PhysicsSurface } from '../physics/params.ts';
import type { Vec3 } from '../physics/vec3.ts';
import { Rng, type Seed } from '../rng/index.ts';
import type { Tick } from '../time/index.ts';
import {
  createKeeper,
  DEFAULT_KEEPER_TUNING,
  holdingKeeper,
  keeperContact,
  keeperSetPosition,
  parriedKeeper,
  stepKeeper,
  type KeeperAttributes,
  type KeeperState,
  type KeeperTuning,
} from './keeper.ts';

export type MomentOutcome = FlightOutcome | 'saved';

export type MomentEvent =
  | FlightEvent
  | { readonly tick: Tick; readonly type: 'keeper-react'; readonly target: Vec3 | null }
  | { readonly tick: Tick; readonly type: 'keeper-dive'; readonly side: -1 | 0 | 1; readonly target: Vec3 }
  | { readonly tick: Tick; readonly type: 'save'; readonly kind: 'catch' | 'parry'; readonly pos: Vec3; readonly speed: number };

export interface ShotMomentSetup {
  /** Ball at the instant of the strike (after execution error). */
  readonly ball: BallState;
  readonly physics: PhysicsParams;
  readonly surface: PhysicsSurface;
  readonly keeper: { readonly attributes: KeeperAttributes; readonly tuning?: KeeperTuning } | null;
  /** Sub-seed of the moment: keeper reaction/read/catch draws and bounce jitter. */
  readonly seed: Seed;
}

export interface ShotMomentState {
  readonly tick: Tick;
  readonly flight: FlightState;
  readonly keeper: KeeperState | null;
  readonly outcome: MomentOutcome | null;
  /** The keeper got a touch: anything but a goal afterwards counts as a save. */
  readonly parried: boolean;
}

export interface ShotMomentContext {
  readonly setup: ShotMomentSetup;
  readonly flight: FlightContext;
  readonly keeperTuning: KeeperTuning;
  readonly keeperRng: Rng;
}

/** Creates the mutable context (generators) and the initial state of a shot moment. */
export function startShotMoment(setup: ShotMomentSetup): { context: ShotMomentContext; state: ShotMomentState } {
  const root = Rng.create(setup.seed);
  const keeperTuning = setup.keeper?.tuning ?? DEFAULT_KEEPER_TUNING;
  const keeperRng = root.fork('keeper');
  const jitter = setup.physics.surfaces[setup.surface].bounceJitter > 0;
  const context: ShotMomentContext = {
    setup,
    flight: { params: setup.physics, surface: setup.surface, rng: jitter ? root.fork('bounces') : null },
    keeperTuning,
    keeperRng,
  };
  const keeper = setup.keeper
    ? createKeeper(keeperSetPosition(setup.ball.pos, setup.keeper.attributes, keeperTuning), setup.keeper.attributes, keeperTuning, keeperRng)
    : null;
  return { context, state: { tick: 0, flight: startFlight(setup.ball), keeper, outcome: null, parried: false } };
}

export function stepShotMoment(
  state: ShotMomentState,
  context: ShotMomentContext,
): { state: ShotMomentState; events: MomentEvent[] } {
  const tick = state.tick + 1;
  const events: MomentEvent[] = [];
  const keeperSetup = context.setup.keeper;

  // Ball held by the keeper: nothing flies any more.
  if (state.keeper?.phase === 'holding') {
    const held = { ...state.flight.ball, pos: state.keeper.hands };
    return { state: { ...state, tick, flight: { ...state.flight, tick, ball: held } }, events };
  }

  const stepped = stepFlight(state.flight, context.flight);
  let flight = stepped.state;
  for (const e of stepped.events) events.push(e);
  let outcome: MomentOutcome | null = state.outcome ?? flight.outcome;

  let keeper = state.keeper;
  let parried = state.parried;
  if (keeper && keeperSetup) {
    const before = keeper.phase;
    keeper = stepKeeper(keeper, tick, flight.ball, keeperSetup.attributes, context.keeperTuning, context.flight, context.keeperRng);
    if (before === 'set' && keeper.phase !== 'set') events.push({ tick, type: 'keeper-react', target: keeper.target });
    if (before !== 'diving' && keeper.phase === 'diving' && keeper.target) {
      events.push({ tick, type: 'keeper-dive', side: keeper.diveSide, target: keeper.target });
    }
    // Only a live ball in front of the goal can be saved.
    if (state.outcome === null || state.outcome === 'stopped') {
      const contact = keeperContact(keeper, tick, flight.ball, keeperSetup.attributes, context.keeperTuning, context.keeperRng);
      if (contact?.kind === 'catch') {
        keeper = holdingKeeper(keeper, tick);
        flight = { ...flight, ball: { ...flight.ball, pos: keeper.hands, vel: { x: 0, y: 0, z: 0 } }, outcome: null };
        outcome = 'saved';
        events.push({ tick, type: 'save', kind: 'catch', pos: contact.pos, speed: contact.speed });
      } else if (contact?.kind === 'parry') {
        keeper = parriedKeeper(keeper, tick);
        flight = { ...flight, ball: contact.ball, outcome: null };
        outcome = null;
        parried = true;
        events.push({ tick, type: 'save', kind: 'parry', pos: contact.pos, speed: contact.speed });
      }
    }
  }

  let final: MomentOutcome | null = outcome ?? flight.outcome;
  if (parried && final !== null && final !== 'goal') final = 'saved';
  return { state: { tick, flight, keeper, outcome: final, parried }, events };
}

export interface ShotMomentResult {
  readonly outcome: MomentOutcome | null;
  readonly outcomeTick: Tick | null;
  readonly events: readonly MomentEvent[];
  readonly states: readonly ShotMomentState[];
}

/** Runs a whole shot moment (tests, server validation, auto-resolution). */
export function simulateShotMoment(setup: ShotMomentSetup, maxTicks = 720, ticksAfterOutcome = 0): ShotMomentResult {
  const { context, state: initial } = startShotMoment(setup);
  let state = initial;
  const states: ShotMomentState[] = [state];
  const events: MomentEvent[] = [];
  let outcomeTick: Tick | null = null;
  while (state.tick < maxTicks) {
    const next = stepShotMoment(state, context);
    state = next.state;
    states.push(state);
    for (const e of next.events) events.push(e);
    if (outcomeTick === null && state.outcome !== null) outcomeTick = state.tick;
    if (outcomeTick !== null && state.tick - outcomeTick >= ticksAfterOutcome) break;
  }
  return { outcome: state.outcome, outcomeTick, events, states };
}

/** Convenience: moment from a strike (position, velocity, spin). */
export function shotMomentFromStrike(
  from: Vec3,
  velocity: Vec3,
  spin: Vec3,
  rest: Omit<ShotMomentSetup, 'ball'>,
): ShotMomentSetup {
  return { ...rest, ball: kickedBall(from, velocity, spin) };
}
