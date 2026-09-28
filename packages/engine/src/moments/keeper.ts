// Goalkeeper model for key moments (deterministic, fixed step).
//
// 1. Set position: on the bisector of the shooting angle, off the line by positioning.
// 2. Reaction delay (reflexes), then a noisy read of where the ball will cross the keeper's plane
//    (positioning; curl makes it harder).
// 3. Action: shuffle (close balls) or dive, bounded by a reach envelope (diving, height).
// 4. Contact: catch or parry, probability from handling, ball speed and stretch (seeded draw).
//
// Modes: 'react' (open play and free kicks, above), 'penalty' (on his line, commits at the kick:
// right side read or a guess) and 'player' (the dive is commanded by the player's swipe; the
// attributes still set reach, speed, late correction and handling).

import { clamp, lerp, sqrt } from '../math/index.ts';
import type { BallState } from '../physics/ball.ts';
import { BALL, GOAL, PITCH } from '../physics/constants.ts';
import { simulateFlight, type FlightContext } from '../physics/flight.ts';
import { add, dot, length, scale, sub, v3, type Vec3 } from '../physics/vec3.ts';
import type { Rng } from '../rng/index.ts';
import { secondsToTicks, TICK_DT, type Tick } from '../time/index.ts';

export interface KeeperAttributes {
  /** 1–99 card attributes. */
  readonly diving: number;
  readonly handling: number;
  readonly reflexes: number;
  readonly speed: number;
  readonly positioning: number;
  readonly heightCm: number;
}

type Range = readonly [atLow: number, atHigh: number];

export interface KeeperTuning {
  /** Reaction delay (s) at reflexes 1 → 99. */
  readonly reactionRange: Range;
  /** One-sigma error of the read crossing point (m) at positioning 1 → 99. */
  readonly readErrorRange: Range;
  /** Extra read error (m) per rad/s of sidespin: curlers are harder to read. */
  readonly curlReadPenalty: number;
  /** Lateral dive reach of the hands from the set position (m) at diving 1 → 99. */
  readonly diveReachRange: Range;
  /** Time to full extension of a dive (s) at diving 1 → 99. */
  readonly diveTimeRange: Range;
  /** Shuffle speed of the hands/feet (m/s) at speed 1 → 99. */
  readonly shuffleSpeedRange: Range;
  /** Jump above standing reach (m) at diving 1 → 99. */
  readonly jumpRange: Range;
  /** Distance off the goal line when set (m) at positioning 1 → 99. */
  readonly lineDepthRange: Range;
  /** Base catch probability at handling 1 → 99. */
  readonly catchRange: Range;
  /** Ball speed (m/s) under which catching is not penalised. */
  readonly catchSpeedFree: number;
  /** Catch probability lost per m/s above catchSpeedFree. */
  readonly catchSpeedPenalty: number;
  /** Catch probability lost at full dive extension. */
  readonly catchStretchPenalty: number;
  /** Speed kept by a parried ball (fraction of the incoming speed). */
  readonly parryRestitution: number;
  /** How far the hands can still correct during a dive (m) at reflexes 1 → 99. */
  readonly lateAdjustRange: Range;
  /** Furthest the keeper can shuffle from his set position before diving (m): a step or two. */
  readonly maxShuffle: number;
  /** Penalty: delay (s) between the kick and the keeper's commitment. */
  readonly penaltyReaction: number;
  /** Penalty: probability of reading the right side at positioning 1 → 99 (else a guess). */
  readonly penaltyReadRange: Range;
  /**
   * Player's keeper: how early a swipe may come (s) and still be held until the right moment,
   * at reflexes 1 → 99. A swipe earlier than that dives at once and lands too early.
   */
  readonly playerHoldRange: Range;
  /** Player's keeper: share of the way from the swiped spot to the ball, on the right side,
   * at positioning 1 → 99. */
  readonly playerAssistRange: Range;
}

export type KeeperMode = 'react' | 'penalty' | 'player';

export const DEFAULT_KEEPER_TUNING: KeeperTuning = {
  reactionRange: [0.32, 0.13],
  readErrorRange: [0.9, 0.18],
  curlReadPenalty: 0.006,
  diveReachRange: [1.2, 1.95],
  diveTimeRange: [0.62, 0.42],
  shuffleSpeedRange: [1.6, 3],
  jumpRange: [0.25, 0.6],
  lineDepthRange: [0.3, 1],
  catchRange: [0.45, 0.92],
  catchSpeedFree: 12,
  catchSpeedPenalty: 0.03,
  catchStretchPenalty: 0.3,
  parryRestitution: 0.38,
  lateAdjustRange: [0.05, 0.22],
  maxShuffle: 0.5,
  penaltyReaction: 0.06,
  penaltyReadRange: [0.28, 0.58],
  playerHoldRange: [0.15, 0.4],
  playerAssistRange: [0.3, 0.7],
};

const BODY_RADIUS = 0.2;
const HANDS_RADIUS = 0.14;
/** Hands in front of the body, towards the ball (−X for the goal at +X). */
const HANDS_FORWARD = 0.25;
/** Ticks during which a second contact is ignored (the ball is leaving the keeper). */
const CONTACT_COOLDOWN = 12;

export type KeeperPhase = 'set' | 'tracking' | 'diving' | 'grounded' | 'holding';

export interface KeeperState {
  readonly mode: KeeperMode;
  readonly phase: KeeperPhase;
  /** Feet position on the ground. */
  readonly feet: Vec3;
  /** Feet position when set (before the shot). */
  readonly setFeet: Vec3;
  /** Centre of both hands. */
  readonly hands: Vec3;
  /** Top of the body segment (shoulders/head). */
  readonly head: Vec3;
  /** Tick at which the keeper reacts (reads the shot). */
  readonly reactionTick: Tick;
  /** Where the keeper goes with his hands (after the read), or null before it. */
  readonly target: Vec3 | null;
  /** Tick at which the ball is expected to reach the keeper's plane (from the read). */
  readonly arrivalTick: Tick | null;
  /** Where the ball really crosses the keeper's plane (known once read). */
  readonly crossing: Vec3 | null;
  /** Initial read error; it shrinks as the ball gets closer (the keeper keeps adjusting). */
  readonly readOffset: Vec3;
  readonly readTick: Tick;
  readonly diveFrom: Vec3 | null;
  readonly diveStartTick: Tick;
  readonly diveTicks: number;
  /** −1 dives to his left side (−Z), +1 right (+Z), 0 no dive. */
  readonly diveSide: -1 | 0 | 1;
  readonly lastContactTick: Tick;
  /** Player's keeper: the swiped dive, held until `startTick` (then the dive starts). */
  readonly command: {
    readonly target: Vec3;
    readonly startTick: Tick;
    readonly crossing: Vec3 | null;
    readonly arrivalTick: Tick | null;
  } | null;
}

export type KeeperContact =
  | { readonly kind: 'catch'; readonly pos: Vec3; readonly speed: number }
  | {
      readonly kind: 'parry';
      readonly pos: Vec3;
      readonly speed: number;
      readonly ball: BallState;
    };

const t01 = (value: number): number => clamp((value - 1) / 98, 0, 1);
const pick = (range: Range, attribute: number): number => lerp(range[0], range[1], t01(attribute));

function standingReach(attributes: KeeperAttributes): number {
  return (attributes.heightCm / 100) * 1.28;
}

/** Keeper plane: X where the hands meet the ball. */
function handsPlaneX(feet: Vec3): number {
  return feet.x - HANDS_FORWARD;
}

function restingHands(feet: Vec3): Vec3 {
  return v3(handsPlaneX(feet), 1.15, feet.z);
}

function restingHead(feet: Vec3, attributes: KeeperAttributes): Vec3 {
  return v3(feet.x, (attributes.heightCm / 100) * 0.92, feet.z);
}

/** Set position for a ball at `ballPos`: on the bisector of the angle to both posts. */
export function keeperSetPosition(
  ballPos: Vec3,
  attributes: KeeperAttributes,
  tuning: KeeperTuning = DEFAULT_KEEPER_TUNING,
): Vec3 {
  const gx = PITCH.goalLineX;
  const hw = GOAL.width / 2;
  // Unit vectors from the ball to each post; their sum points along the bisector.
  const toPost = (z: number): Vec3 => {
    const d = v3(gx - ballPos.x, 0, z - ballPos.z);
    return scale(d, 1 / length(d));
  };
  const bisector = add(toPost(-hw), toPost(hw));
  const b = scale(bisector, 1 / length(bisector));
  const depth = pick(tuning.lineDepthRange, attributes.positioning);
  // Point on the bisector at `depth` in front of the goal line.
  const t = (gx - depth - ballPos.x) / b.x;
  const z = clamp(ballPos.z + b.z * t, -hw + 0.3, hw - 0.3);
  return v3(gx - depth, 0, z);
}

export function createKeeper(
  feet: Vec3,
  attributes: KeeperAttributes,
  tuning: KeeperTuning,
  rng: Rng,
  mode: KeeperMode = 'react',
): KeeperState {
  const base =
    mode === 'penalty' ? tuning.penaltyReaction : pick(tuning.reactionRange, attributes.reflexes);
  const reaction = base * (1 + rng.normal(0, 0.08));
  return {
    mode,
    phase: 'set',
    feet,
    setFeet: feet,
    hands: restingHands(feet),
    head: restingHead(feet, attributes),
    reactionTick: Math.max(1, secondsToTicks(reaction)),
    target: null,
    arrivalTick: null,
    crossing: null,
    readOffset: v3(0, 0, 0),
    readTick: 0,
    diveFrom: null,
    diveStartTick: 0,
    diveTicks: 0,
    diveSide: 0,
    lastContactTick: -1000,
    command: null,
  };
}

/**
 * Clamps a hands target to what the keeper can reach from his feet: an elliptic envelope,
 * full lateral reach low down, less reach the higher the ball (top corners stay out of reach).
 */
function reachableTarget(
  target: Vec3,
  feet: Vec3,
  attributes: KeeperAttributes,
  tuning: KeeperTuning,
): Vec3 {
  const lateralReach = pick(tuning.diveReachRange, attributes.diving) + 0.45;
  const top = standingReach(attributes) + pick(tuning.jumpRange, attributes.diving);
  const centreY = 1;
  const upReach = top - centreY;
  const y = clamp(target.y, 0.12, top);
  // Getting down to a ball at the foot of the post costs reach too, a bit less than going up.
  const dy = y >= centreY ? (y - centreY) / upReach : ((centreY - y) / (centreY - 0.12)) * 0.6;
  const lateralAtY = lateralReach * sqrt(Math.max(0, 1 - dy * dy));
  const lateral = clamp(target.z - feet.z, -lateralAtY, lateralAtY);
  return v3(handsPlaneX(feet), y, feet.z + lateral);
}

/** Reads the shot: predicted crossing of the keeper's plane and its tick, with a seeded error. */
function readShot(
  ball: BallState,
  tick: Tick,
  keeper: KeeperState,
  attributes: KeeperAttributes,
  tuning: KeeperTuning,
  flight: FlightContext,
  rng: Rng,
): { crossing: Vec3; offset: Vec3; arrivalTick: Tick } | null {
  const planeX = handsPlaneX(keeper.feet);
  if (ball.vel.x <= 0.5 || ball.pos.x >= planeX) return null;
  const prediction = simulateFlight(ball, { ...flight, rng: null }, { maxTicks: 360 });
  for (let i = 1; i < prediction.samples.length; i++) {
    const a = (prediction.samples[i - 1] as BallState).pos;
    const b = (prediction.samples[i] as BallState).pos;
    if (a.x < planeX && b.x >= planeX) {
      const f = (planeX - a.x) / (b.x - a.x);
      const crossing = add(a, scale(sub(b, a), f));
      const sigma =
        pick(tuning.readErrorRange, attributes.positioning) +
        tuning.curlReadPenalty * Math.abs(ball.spin.y);
      return {
        crossing,
        offset: v3(0, rng.normal(0, sigma * 0.6), rng.normal(0, sigma)),
        arrivalTick: tick + i,
      };
    }
  }
  return null;
}

/** Ticks a dive covering `distance` takes. */
function diveDuration(
  distance: number,
  attributes: KeeperAttributes,
  tuning: KeeperTuning,
): number {
  const reach = pick(tuning.diveReachRange, attributes.diving);
  const time =
    pick(tuning.diveTimeRange, attributes.diving) *
    clamp(0.55 + (0.45 * distance) / reach, 0.55, 1);
  return Math.max(1, secondsToTicks(time));
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** Dive towards `target` (hands), starting now; a close target is taken standing. */
function commitTo(
  keeper: KeeperState,
  tick: Tick,
  target: Vec3,
  crossing: Vec3 | null,
  arrivalTick: Tick | null,
  attributes: KeeperAttributes,
  tuning: KeeperTuning,
): KeeperState {
  const reachable = reachableTarget(target, keeper.feet, attributes, tuning);
  const gap = length(sub(reachable, keeper.hands));
  const read = {
    ...keeper,
    crossing,
    arrivalTick,
    readTick: tick,
    readOffset: v3(0, 0, 0),
    target: reachable,
  };
  // Close ball: stay up and track it with the hands.
  if (gap < 0.55) return { ...read, phase: 'tracking' };
  return {
    ...read,
    phase: 'diving',
    diveFrom: keeper.hands,
    diveStartTick: tick,
    diveTicks: diveDuration(gap, attributes, tuning),
    diveSide: reachable.z < keeper.feet.z ? -1 : 1,
  };
}

/**
 * The player's swipe, made playable: on the right side, the target is pulled towards the ball
 * (positioning); a swipe a little early is held until the dive meets the ball (reflexes).
 */
function playerCommand(
  keeper: KeeperState,
  tick: Tick,
  swiped: Vec3,
  ball: BallState,
  attributes: KeeperAttributes,
  tuning: KeeperTuning,
  flight: FlightContext,
  rng: Rng,
): NonNullable<KeeperState['command']> {
  const read = readShot(ball, tick, keeper, attributes, tuning, flight, rng);
  if (read === null) return { target: swiped, startTick: tick, crossing: null, arrivalTick: null };
  const toSwipe = swiped.z - keeper.feet.z;
  const toBall = read.crossing.z - keeper.feet.z;
  const rightSide = toSwipe * toBall > 0 || Math.abs(toBall) < 0.5;
  const assist = rightSide ? pick(tuning.playerAssistRange, attributes.positioning) : 0;
  const target = v3(
    swiped.x,
    lerp(swiped.y, read.crossing.y, assist),
    lerp(swiped.z, read.crossing.z, assist),
  );
  const reachable = reachableTarget(target, keeper.feet, attributes, tuning);
  const duration = diveDuration(length(sub(reachable, keeper.hands)), attributes, tuning);
  const ideal = read.arrivalTick - duration - 1;
  const hold = secondsToTicks(pick(tuning.playerHoldRange, attributes.reflexes));
  return {
    target,
    startTick: Math.max(tick, Math.min(ideal, tick + hold)),
    crossing: read.crossing,
    arrivalTick: read.arrivalTick,
  };
}

/** Penalty: at the kick, the keeper reads the right side (positioning) or guesses one. */
function penaltyCommit(
  keeper: KeeperState,
  tick: Tick,
  ball: BallState,
  attributes: KeeperAttributes,
  tuning: KeeperTuning,
  flight: FlightContext,
  rng: Rng,
): KeeperState {
  const read = readShot(ball, tick, keeper, attributes, tuning, flight, rng);
  if (read === null) return { ...keeper, phase: 'tracking' };
  const readsIt = rng.chance(pick(tuning.penaltyReadRange, attributes.positioning));
  const stays = rng.chance(0.12);
  const side = rng.chance(0.5) ? -1 : 1;
  const height = 0.3 + rng.float() * 1.3;
  const guess = stays
    ? v3(handsPlaneX(keeper.feet), 1.1, keeper.feet.z)
    : v3(handsPlaneX(keeper.feet), height, keeper.feet.z + side * 2.6);
  const target = readsIt ? add(read.crossing, scale(read.offset, 1.5)) : guess;
  return commitTo(keeper, tick, target, read.crossing, read.arrivalTick, attributes, tuning);
}

/** Keeper's move before the shot (e.g. during a pass): back to the set position for `ballPos`. */
export function keeperFollow(
  keeper: KeeperState,
  ballPos: Vec3,
  attributes: KeeperAttributes,
  tuning: KeeperTuning,
): KeeperState {
  const wanted = keeperSetPosition(ballPos, attributes, tuning);
  const step = pick(tuning.shuffleSpeedRange, attributes.speed) * 1.4 * TICK_DT;
  const d = sub(wanted, keeper.feet);
  const gap = length(d);
  const feet = gap <= step ? wanted : add(keeper.feet, scale(d, step / gap));
  return {
    ...keeper,
    feet,
    setFeet: feet,
    hands: restingHands(feet),
    head: restingHead(feet, attributes),
  };
}

/**
 * Advances the keeper by one tick (before contact resolution). In 'player' mode, `command` is
 * the dive target swiped by the player this tick (null otherwise).
 */
export function stepKeeper(
  current: KeeperState,
  tick: Tick,
  ball: BallState,
  attributes: KeeperAttributes,
  tuning: KeeperTuning,
  flight: FlightContext,
  rng: Rng,
  command: Vec3 | null = null,
): KeeperState {
  let keeper = current;
  if (keeper.phase === 'holding') return keeper;

  if (keeper.phase === 'grounded') {
    // Landed: hands and head fall back to the ground.
    const fall = 3.5 * TICK_DT;
    return {
      ...keeper,
      hands: v3(keeper.hands.x, Math.max(0.25, keeper.hands.y - fall), keeper.hands.z),
      head: v3(keeper.head.x, Math.max(0.3, keeper.head.y - fall), keeper.head.z),
    };
  }

  if (keeper.phase === 'set' && keeper.mode === 'player') {
    if (keeper.command === null && command !== null) {
      keeper = {
        ...keeper,
        command: playerCommand(keeper, tick, command, ball, attributes, tuning, flight, rng),
      };
    }
    const c = keeper.command;
    if (c === null || tick < c.startTick) return keeper;
    return commitTo(keeper, tick, c.target, c.crossing, c.arrivalTick, attributes, tuning);
  }

  if (keeper.phase === 'set' && keeper.mode === 'penalty') {
    if (tick < keeper.reactionTick) return keeper;
    return penaltyCommit(keeper, tick, ball, attributes, tuning, flight, rng);
  }

  if (keeper.phase === 'set') {
    if (tick < keeper.reactionTick) return keeper;
    const read = readShot(ball, tick, keeper, attributes, tuning, flight, rng);
    if (read === null) return { ...keeper, phase: 'tracking' };
    return {
      ...keeper,
      phase: 'tracking',
      crossing: read.crossing,
      readOffset: read.offset,
      readTick: tick,
      arrivalTick: read.arrivalTick,
      target: add(read.crossing, read.offset),
    };
  }

  if (keeper.phase === 'tracking') {
    const arrivalTick = keeper.arrivalTick;
    if (keeper.crossing === null || arrivalTick === null) return keeper;
    // The read sharpens as the ball approaches: the error decays with the time left.
    const total = Math.max(1, arrivalTick - keeper.readTick);
    const decay = clamp((arrivalTick - tick) / total, 0, 1);
    const estimate = add(keeper.crossing, scale(keeper.readOffset, sqrt(decay)));
    keeper = { ...keeper, target: estimate };
    const reachable = reachableTarget(estimate, keeper.feet, attributes, tuning);
    const gap = length(sub(reachable, keeper.hands));
    const ticksLeft = arrivalTick - tick;
    // Close ball: take it standing, hands moving to it at shuffle speed.
    if (gap < 0.55) {
      const step = pick(tuning.shuffleSpeedRange, attributes.speed) * 1.6 * TICK_DT;
      const move =
        gap <= step
          ? sub(reachable, keeper.hands)
          : scale(sub(reachable, keeper.hands), step / gap);
      return { ...keeper, hands: add(keeper.hands, move) };
    }
    const duration = diveDuration(gap, attributes, tuning);
    if (ticksLeft <= duration + 1) {
      return {
        ...keeper,
        phase: 'diving',
        target: reachable,
        diveFrom: keeper.hands,
        diveStartTick: tick,
        diveTicks: duration,
        diveSide: reachable.z < keeper.feet.z ? -1 : 1,
      };
    }
    // Time to spare: shuffle across to shorten the dive.
    const step = pick(tuning.shuffleSpeedRange, attributes.speed) * TICK_DT;
    const dz = clamp(estimate.z - keeper.feet.z, -step, step);
    const setZ = keeper.setFeet.z;
    const feet = v3(
      keeper.feet.x,
      0,
      clamp(keeper.feet.z + dz, setZ - tuning.maxShuffle, setZ + tuning.maxShuffle),
    );
    return { ...keeper, feet, hands: restingHands(feet), head: restingHead(feet, attributes) };
  }

  // Diving: hands travel along an eased path, the body follows them. A late correction towards
  // the real ball is possible, limited by reflexes.
  const committed = keeper.target ?? keeper.hands;
  let target = committed;
  if (keeper.crossing !== null) {
    const late = pick(tuning.lateAdjustRange, attributes.reflexes);
    const pDive = clamp((tick - keeper.diveStartTick) / keeper.diveTicks, 0, 1);
    const wanted = reachableTarget(keeper.crossing, keeper.feet, attributes, tuning);
    target = v3(
      committed.x,
      committed.y + clamp(wanted.y - committed.y, -late, late) * pDive,
      committed.z + clamp(wanted.z - committed.z, -late, late) * pDive,
    );
  }
  const from = keeper.diveFrom ?? keeper.hands;
  const p = clamp((tick - keeper.diveStartTick) / keeper.diveTicks, 0, 1);
  const e = easeOutQuad(p);
  const hands = add(from, scale(sub(target, from), e));
  const feet = v3(
    keeper.feet.x,
    0,
    lerp(keeper.feet.z, keeper.feet.z + (target.z - keeper.feet.z) * 0.02, e),
  );
  const toHands = sub(hands, feet);
  const reach = length(toHands);
  const head =
    reach > 1e-6
      ? add(feet, scale(toHands, clamp(1 - 0.35 / reach, 0.3, 1)))
      : restingHead(feet, attributes);
  return { ...keeper, hands, feet, head, phase: p >= 1 ? 'grounded' : 'diving' };
}

function closestOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ab = sub(b, a);
  const t = clamp(dot(sub(p, a), ab) / dot(ab, ab), 0, 1);
  return add(a, scale(ab, t));
}

/** Resolves a contact between the ball and the keeper this tick, if any. */
export function keeperContact(
  keeper: KeeperState,
  tick: Tick,
  ball: BallState,
  attributes: KeeperAttributes,
  tuning: KeeperTuning,
  rng: Rng,
): KeeperContact | null {
  if (keeper.phase === 'holding' || tick - keeper.lastContactTick < CONTACT_COOLDOWN) return null;
  const bodyBottom = v3(keeper.feet.x, 0.25, keeper.feet.z);
  const handsGap = length(sub(ball.pos, keeper.hands));
  const bodyPoint = closestOnSegment(ball.pos, bodyBottom, keeper.head);
  const bodyGap = length(sub(ball.pos, bodyPoint));
  // The arms bridge body and hands: treat the segment head → hands as reachable too.
  const armPoint = closestOnSegment(ball.pos, keeper.head, keeper.hands);
  const armGap = length(sub(ball.pos, armPoint));

  let point: Vec3;
  let part: 'hands' | 'arms' | 'body';
  if (handsGap < BALL.radius + HANDS_RADIUS) {
    point = keeper.hands;
    part = 'hands';
  } else if (armGap < BALL.radius + HANDS_RADIUS * 0.8) {
    point = armPoint;
    part = 'arms';
  } else if (bodyGap < BALL.radius + BODY_RADIUS) {
    point = bodyPoint;
    part = 'body';
  } else {
    return null;
  }

  const offset = sub(ball.pos, point);
  const gap = length(offset);
  const normal = gap > 1e-6 ? scale(offset, 1 / gap) : v3(-1, 0, 0);
  const vn = dot(ball.vel, normal);
  if (vn >= 0) return null; // already moving away

  const speed = length(ball.vel);
  const stretch =
    keeper.phase === 'diving' || keeper.phase === 'grounded'
      ? clamp((tick - keeper.diveStartTick) / Math.max(1, keeper.diveTicks), 0, 1)
      : 0;
  let pCatch =
    pick(tuning.catchRange, attributes.handling) -
    Math.max(0, speed - tuning.catchSpeedFree) * tuning.catchSpeedPenalty -
    stretch * tuning.catchStretchPenalty;
  if (part === 'arms') pCatch *= 0.5;
  if (part === 'body') pCatch *= 0.7;
  pCatch = clamp(pCatch, 0.02, 0.97);

  if (rng.chance(pCatch)) return { kind: 'catch', pos: ball.pos, speed };

  // Parry: the keeper palms the ball away from goal — back into the field, wide and up (over
  // the bar or round the post for high/wide balls). Never towards his own net.
  const side = ball.pos.z >= keeper.feet.z ? 1 : -1;
  const high = clamp((ball.pos.y - 1.6) / 0.8, 0, 1);
  const wide = clamp(Math.abs(ball.pos.z) / (GOAL.width / 2), 0, 1);
  const away = v3(-(0.9 - 0.5 * high), 0.35 + 0.9 * high, side * (0.4 + 0.8 * wide));
  const jitter = v3(0, rng.normal(0, 0.12), rng.normal(0, 0.2));
  const dir = add(away, jitter);
  const outSpeed = Math.max(4, speed * tuning.parryRestitution);
  const vel = scale(dir, outSpeed / Math.max(1e-6, length(dir)));
  const pos = add(
    point,
    scale(normal, (part === 'body' ? BODY_RADIUS : HANDS_RADIUS) + BALL.radius + 1e-3),
  );
  return {
    kind: 'parry',
    pos,
    speed,
    ball: { pos, vel, spin: scale(ball.spin, 0.3), grounded: false },
  };
}

/** After a catch: the keeper holds the ball in his hands. */
export function holdingKeeper(keeper: KeeperState, tick: Tick): KeeperState {
  return { ...keeper, phase: 'holding', lastContactTick: tick };
}

/** After a parry: remember the contact (cooldown) and keep going. */
export function parriedKeeper(keeper: KeeperState, tick: Tick): KeeperState {
  return { ...keeper, lastContactTick: tick };
}

/** Distance helper exported for tests and the renderer. */
export function keeperReachEnvelope(
  attributes: KeeperAttributes,
  tuning: KeeperTuning = DEFAULT_KEEPER_TUNING,
): {
  lateral: number;
  top: number;
} {
  return {
    lateral: pick(tuning.diveReachRange, attributes.diving) + 0.45,
    top: standingReach(attributes) + pick(tuning.jumpRange, attributes.diving),
  };
}

/**
 * The ball changed direction (deflection) before the keeper committed: he has to react again
 * (new delay, new read). Once diving, he is wrong-footed and keeps his dive.
 */
export function keeperReReact(
  keeper: KeeperState,
  tick: Tick,
  attributes: KeeperAttributes,
  tuning: KeeperTuning,
  rng: Rng,
): KeeperState {
  if (keeper.phase !== 'set' && keeper.phase !== 'tracking') return keeper;
  const reaction = pick(tuning.reactionRange, attributes.reflexes) * (1 + rng.normal(0, 0.08));
  return {
    ...keeper,
    phase: 'set',
    reactionTick: tick + Math.max(1, secondsToTicks(reaction)),
    target: null,
    crossing: null,
    arrivalTick: null,
  };
}
