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
import { length, v3, type Vec3 } from '../physics/vec3.ts';
import { Rng, type Seed } from '../rng/index.ts';
import { TICK_DT, type Tick } from '../time/index.ts';
import {
  createDefender,
  DEFAULT_DEFENDER_TUNING,
  defenderContact,
  defenderHeadHeight,
  defenderReachHeight,
  defenderTopSpeed,
  stepDefender,
  touchedDefender,
  wallPositions,
  type DefenderAttributes,
  type DefenderRole,
  type DefenderState,
  type DefenderTuning,
} from './defenders.ts';
import {
  createKeeper,
  DEFAULT_KEEPER_TUNING,
  holdingKeeper,
  keeperContact,
  keeperDownTick,
  keeperRunSpeed,
  keeperStandingReach,
  keeperReReact,
  keeperSetPosition,
  parriedKeeper,
  standingKeeper,
  stepKeeper,
  type KeeperAttributes,
  type KeeperDown,
  type KeeperMode,
  type KeeperState,
  type KeeperTuning,
} from './keeper.ts';
import {
  attackerMover,
  CHASE_MAX_SECONDS,
  keeperMover,
  outfieldMover,
  startChase,
  stepChase,
  type ChaseMovers,
  type ChaseState,
  type ReboundSetup,
} from './rebound.ts';

/**
 * 'rebound': one of ours won the second ball after a save or the woodwork (a second shot
 * follows). 'cleared': the defence won it.
 */
export type MomentOutcome = FlightOutcome | 'saved' | 'blocked' | 'rebound' | 'cleared';

export type MomentEvent =
  | FlightEvent
  | { readonly tick: Tick; readonly type: 'keeper-react'; readonly target: Vec3 | null }
  | {
      readonly tick: Tick;
      readonly type: 'keeper-dive';
      readonly side: -1 | 0 | 1;
      readonly target: Vec3;
    }
  | {
      readonly tick: Tick;
      readonly type: 'save';
      readonly kind: 'catch' | 'parry';
      readonly pos: Vec3;
      readonly speed: number;
    }
  | {
      readonly tick: Tick;
      readonly type: 'block';
      /** Index of the defender in the setup. */
      readonly defender: number;
      readonly pos: Vec3;
      readonly speed: number;
    }
  /** One of ours (index in the rebound setup, 0 = the shooter) wins the second ball. */
  | { readonly tick: Tick; readonly type: 'rebound'; readonly by: number; readonly pos: Vec3 }
  /** A defender (index in the setup) wins the second ball and clears it. */
  | { readonly tick: Tick; readonly type: 'cleared'; readonly by: number; readonly pos: Vec3 };

export interface DefenderSetup {
  readonly role: DefenderRole;
  /** Feet position; walls are placed automatically when omitted. */
  readonly feet?: Vec3;
  readonly attributes: DefenderAttributes;
}

/** A dive swiped by the player (keeper in 'player' mode), in ticks of the moment. */
export interface KeeperCommand {
  readonly tick: Tick;
  /** Where the hands go (a point on the goal plane). */
  readonly target: Vec3;
}

export interface KeeperSetup {
  readonly attributes: KeeperAttributes;
  readonly tuning?: KeeperTuning;
  /** Feet position; set position on the bisector when omitted. */
  readonly feet?: Vec3;
  readonly mode?: KeeperMode;
  /** 'player' mode only: the first command at or after tick 1 is the dive. */
  readonly commands?: readonly KeeperCommand[];
  /** Still down after a dive when the moment starts (second ball). */
  readonly down?: KeeperDown;
}

export interface ShotMomentSetup {
  /** Ball at the instant of the strike (after execution error). */
  readonly ball: BallState;
  readonly physics: PhysicsParams;
  readonly surface: PhysicsSurface;
  readonly keeper: KeeperSetup | null;
  readonly defenders?: readonly DefenderSetup[];
  readonly defenderTuning?: DefenderTuning;
  /** Sub-seed of the moment: keeper reaction/read/catch draws and bounce jitter. */
  readonly seed: Seed;
  /** Who follows up a save or a post (no second ball without it). */
  readonly rebound?: ReboundSetup;
}

export interface ShotMomentState {
  readonly tick: Tick;
  readonly flight: FlightState;
  readonly keeper: KeeperState | null;
  readonly defenders: readonly DefenderState[];
  readonly outcome: MomentOutcome | null;
  /** Last player to touch the ball: anything but a goal afterwards is a save or a block. */
  readonly lastTouch: 'keeper' | 'defender' | null;
  /** The race for the second ball, once the keeper has parried or the ball hit the woodwork. */
  readonly chase: ChaseState | null;
}

export interface ShotMomentContext {
  readonly setup: ShotMomentSetup;
  readonly flight: FlightContext;
  readonly keeperTuning: KeeperTuning;
  readonly keeperRng: Rng;
  readonly defenderTuning: DefenderTuning;
  readonly defenderRng: Rng;
  readonly defenderSetups: readonly DefenderSetup[];
  readonly chaseMovers: ChaseMovers | null;
}

/** Creates the mutable context (generators) and the initial state of a shot moment. */
export function startShotMoment(setup: ShotMomentSetup): {
  context: ShotMomentContext;
  state: ShotMomentState;
} {
  const root = Rng.create(setup.seed);
  const keeperTuning = setup.keeper?.tuning ?? DEFAULT_KEEPER_TUNING;
  const keeperRng = root.fork('keeper');
  const jitter = setup.physics.surfaces[setup.surface].bounceJitter > 0;
  const defenderTuning = setup.defenderTuning ?? DEFAULT_DEFENDER_TUNING;
  const defenderRng = root.fork('defenders');
  const setups = setup.defenders ?? [];
  const context: ShotMomentContext = {
    setup,
    flight: {
      params: setup.physics,
      surface: setup.surface,
      rng: jitter ? root.fork('bounces') : null,
    },
    keeperTuning,
    keeperRng,
    defenderTuning,
    defenderRng,
    defenderSetups: setups,
    chaseMovers: setup.rebound
      ? {
          attackers: setup.rebound.attackers.map((a) => attackerMover(a.pace)),
          defenders: setups.map((d) =>
            outfieldMover(
              defenderTopSpeed(d.attributes, defenderTuning),
              defenderTuning.accelerationTime,
              defenderReachHeight(d.attributes, defenderTuning),
            ),
          ),
          keeper: setup.keeper
            ? keeperMover(
                keeperRunSpeed(setup.keeper.attributes),
                keeperStandingReach(setup.keeper.attributes),
              )
            : null,
        }
      : null,
  };
  const keeper = setup.keeper
    ? createKeeper(
        setup.keeper.feet ??
          keeperSetPosition(setup.ball.pos, setup.keeper.attributes, keeperTuning),
        setup.keeper.attributes,
        keeperTuning,
        keeperRng,
        setup.keeper.mode ?? 'react',
        setup.keeper.down ?? null,
      )
    : null;
  const wallSlots = wallPositions(
    setup.ball.pos,
    setups.filter((d) => d.role === 'wall' && !d.feet).length,
  );
  let wallIndex = 0;
  const defenders = setups.map((d) => {
    const feet = d.feet ?? wallSlots[wallIndex++] ?? setup.ball.pos;
    return createDefender(d.role, feet, d.attributes, defenderTuning, defenderRng);
  });
  return {
    context,
    state: {
      tick: 0,
      flight: startFlight(setup.ball),
      keeper,
      defenders,
      outcome: null,
      lastTouch: null,
      chase: null,
    },
  };
}

/** The player's dive target for this tick: the first command, applied at max(1, its tick). */
function keeperCommandAt(setup: KeeperSetup, tick: Tick): Vec3 | null {
  const first = setup.commands?.[0];
  if (first === undefined) return null;
  return Math.max(1, first.tick) === tick ? first.target : null;
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
  // One of ours has the second ball: the moment stops there, a second shot follows.
  if (state.outcome === 'rebound') return { state: { ...state, tick }, events };

  const stepped = stepFlight(state.flight, context.flight);
  let flight = stepped.state;
  for (const e of stepped.events) events.push(e);
  let chase = state.chase;
  // While the second ball is contested, a ball at rest is still to be won.
  const chasing = chase !== null && state.outcome === null;
  let outcome: MomentOutcome | null = state.outcome ?? flight.outcome;
  if (chasing && outcome === 'stopped') outcome = null;
  let lastTouch = state.lastTouch;
  const live = (): boolean => !chasing && (state.outcome === null || state.outcome === 'stopped');

  // Defenders first (they stand between the ball and the goal), in a fixed order.
  let keeper = state.keeper;
  let defenders: DefenderState[] = [];
  let deflected = false;
  for (let i = 0; i < state.defenders.length; i++) {
    const d = state.defenders[i] as DefenderState;
    const setupD = context.defenderSetups[i] as DefenderSetup;
    // In the chase, a defender who has set off is moved by it (below).
    const running = chase !== null && tick >= (chase.defenders[i]?.startTick ?? Infinity);
    let next = running
      ? d
      : stepDefender(
          d,
          tick,
          flight.ball,
          setupD.attributes,
          context.defenderTuning,
          context.flight,
        );
    if (live()) {
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
        flight = { ...flight, ball: contact.ball, outcome: null };
        outcome = null;
        lastTouch = 'defender';
        deflected = true;
        events.push({ tick, type: 'block', defender: i, pos: contact.pos, speed: contact.speed });
      }
    }
    defenders.push(next);
  }

  let parried = false;
  if (keeper && keeperSetup) {
    const running = chase !== null && tick >= (chase.keeper?.startTick ?? Infinity);
    if (deflected) {
      keeper = keeperReReact(
        keeper,
        tick,
        keeperSetup.attributes,
        context.keeperTuning,
        context.keeperRng,
      );
    }
    const before = keeper.phase;
    if (!running) {
      keeper = stepKeeper(
        keeper,
        tick,
        flight.ball,
        keeperSetup.attributes,
        context.keeperTuning,
        context.flight,
        context.keeperRng,
        keeperCommandAt(keeperSetup, tick),
      );
    }
    if (before === 'set' && keeper.phase !== 'set' && !chasing)
      events.push({ tick, type: 'keeper-react', target: keeper.target });
    if (before !== 'diving' && keeper.phase === 'diving' && keeper.target) {
      events.push({ tick, type: 'keeper-dive', side: keeper.diveSide, target: keeper.target });
    }
    // Only a live ball in front of the goal can be saved.
    if (live()) {
      const contact = keeperContact(
        keeper,
        tick,
        flight.ball,
        keeperSetup.attributes,
        context.keeperTuning,
        context.keeperRng,
      );
      if (contact?.kind === 'catch') {
        keeper = holdingKeeper(keeper, tick);
        flight = {
          ...flight,
          ball: { ...flight.ball, pos: keeper.hands, vel: v3(0, 0, 0) },
          outcome: null,
        };
        outcome = 'saved';
        lastTouch = 'keeper';
        events.push({ tick, type: 'save', kind: 'catch', pos: contact.pos, speed: contact.speed });
      } else if (contact?.kind === 'parry') {
        keeper = parriedKeeper(keeper, tick);
        flight = { ...flight, ball: contact.ball, outcome: null };
        outcome = null;
        lastTouch = 'keeper';
        parried = true;
        events.push({ tick, type: 'save', kind: 'parry', pos: contact.pos, speed: contact.speed });
      }
    }
  }

  // A parry or the woodwork, and the ball is still in play: everyone goes for the second ball.
  const rebound = context.setup.rebound;
  const woodwork = stepped.events.some((e) => e.type === 'frame');
  if (chase === null && rebound && (parried || woodwork) && outcome === null) {
    chase = startChase({
      tick,
      attackers: rebound.attackers,
      defenders: defenders.map((d) => d.feet),
      keeper: keeper ? { feet: keeper.feet, downUntil: keeperDownTick(keeper) } : null,
    });
  }

  if (chase !== null && context.chaseMovers && outcome === null) {
    const result = stepChase(chase, tick, flight.ball, context.chaseMovers, context.flight, {
      bounced: context.flight.rng !== null && stepped.events.some((e) => e.type === 'bounce'),
      defenders: defenders.map((d) => d.feet),
      keeper: keeper?.feet ?? null,
    });
    const run = result.chase;
    chase = run;
    defenders = defenders.map((d, i) => {
      const r = run.defenders[i];
      if (!r || tick < r.startTick) return d;
      const head = defenderHeadHeight((context.defenderSetups[i] as DefenderSetup).attributes);
      // Off the wall and running: a defender like the others.
      return {
        ...d,
        role: 'marker' as const,
        feet: r.feet,
        head: v3(r.feet.x, head, r.feet.z),
        vel: r.vel,
        lunging: false,
      };
    });
    if (keeper && keeperSetup && run.keeper && tick >= run.keeper.startTick)
      keeper = standingKeeper(keeper, run.keeper.feet, keeperSetup.attributes);

    const winner = result.winner;
    const ball = flight.ball;
    if (winner?.side === 'attack') {
      outcome = 'rebound';
      events.push({ tick, type: 'rebound', by: winner.index, pos: ball.pos });
    } else if (winner?.side === 'defence') {
      // Cleared upfield, away from goal.
      outcome = 'cleared';
      const side = ball.pos.z >= 0 ? 1 : -1;
      flight = {
        ...flight,
        ball: kickedBall(
          v3(ball.pos.x, Math.max(ball.pos.y, 0.11), ball.pos.z),
          v3(-15, 7.5, side * 4),
          v3(0, 0, 0),
        ),
        outcome: null,
      };
      events.push({ tick, type: 'cleared', by: winner.index, pos: ball.pos });
    } else if (winner?.side === 'keeper' && keeper) {
      keeper = holdingKeeper(keeper, tick);
      flight = { ...flight, ball: { ...ball, pos: keeper.hands, vel: v3(0, 0, 0) }, outcome: null };
      outcome = 'saved';
      lastTouch = 'keeper';
      events.push({ tick, type: 'save', kind: 'catch', pos: ball.pos, speed: length(ball.vel) });
    } else if ((tick - run.startTick) * TICK_DT > CHASE_MAX_SECONDS) {
      outcome = 'cleared';
    }
  }

  let final: MomentOutcome | null = outcome ?? flight.outcome;
  if (chase !== null && state.outcome === null && final === 'stopped') final = null;
  if (
    final !== null &&
    final !== 'goal' &&
    final !== 'saved' &&
    final !== 'rebound' &&
    final !== 'cleared' &&
    lastTouch !== null
  ) {
    final = lastTouch === 'keeper' ? 'saved' : 'blocked';
  }
  return {
    state: { tick, flight, keeper, defenders, outcome: final, lastTouch, chase },
    events,
  };
}

export interface ShotMomentResult {
  readonly outcome: MomentOutcome | null;
  readonly outcomeTick: Tick | null;
  readonly events: readonly MomentEvent[];
  readonly states: readonly ShotMomentState[];
}

/** Runs a whole shot moment (tests, server validation, auto-resolution). */
export function simulateShotMoment(
  setup: ShotMomentSetup,
  maxTicks = 720,
  ticksAfterOutcome = 0,
): ShotMomentResult {
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

/**
 * The second shot after one of ours won the second ball (`state.outcome === 'rebound'`): the
 * keeper where he is (still down if he has not got up yet), the defenders where they are, no
 * further second ball. `strike` is the ball as struck again.
 */
export function secondBallSetup(
  first: ShotMomentSetup,
  state: ShotMomentState,
  strike: BallState,
  seed: Seed,
): ShotMomentSetup {
  const keeperSetup = first.keeper;
  const keeper = state.keeper;
  const runner = state.chase?.keeper ?? null;
  let secondKeeper: KeeperSetup | null = null;
  if (keeperSetup && keeper) {
    const base = { attributes: keeperSetup.attributes, tuning: keeperSetup.tuning };
    const still = runner !== null && state.tick < runner.startTick;
    const lying = keeper.phase === 'diving' || keeper.phase === 'grounded';
    secondKeeper =
      still && lying
        ? {
            ...base,
            feet: v3(keeper.feet.x, 0, keeper.feet.z),
            down: {
              hands: keeper.hands,
              head: keeper.head,
              seconds: (runner.startTick - state.tick) * TICK_DT,
            },
          }
        : { ...base, feet: v3(keeper.feet.x, 0, keeper.feet.z) };
  }
  return {
    ball: strike,
    physics: first.physics,
    surface: first.surface,
    keeper: secondKeeper,
    defenders: state.defenders.map((d, i) => ({
      role: 'marker' as const,
      feet: v3(d.feet.x, 0, d.feet.z),
      attributes: (first.defenders?.[i] as DefenderSetup).attributes,
    })),
    ...(first.defenderTuning ? { defenderTuning: first.defenderTuning } : {}),
    seed,
  };
}
