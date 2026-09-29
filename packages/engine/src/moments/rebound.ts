// Second balls (deterministic): after the keeper parries or the ball comes off the woodwork and
// stays in play, everybody goes for it. Our shooter and his teammates follow up; the defenders,
// and the keeper once he is back on his feet, try to get there first. Whoever reaches the ball
// first (low enough to play it) wins it: one of ours ⇒ a second shot, the keeper ⇒ he gathers it,
// a defender ⇒ he clears it. Ties go to the defence.
//
// Each runner starts after a reaction delay, then runs to the earliest point of the ball's
// predicted path he can reach (re-planned when a bounce on a bumpy pitch changes the path, or when
// he is late). The same code runs on the client and for server validation.

import { clamp, lerp, sqrt } from '../math/index.ts';
import type { BallState } from '../physics/ball.ts';
import { PITCH } from '../physics/constants.ts';
import { simulateFlight, type FlightContext } from '../physics/flight.ts';
import { add, length, scale, sub, v3, type Vec3 } from '../physics/vec3.ts';
import { secondsToTicks, TICK_DT, type Tick } from '../time/index.ts';
import { runDistance } from './pass.ts';
import type { Situation } from './situations.ts';

/** One of ours who follows up. */
export interface ReboundAttacker {
  readonly feet: Vec3;
  /** 1–99 pace (VIT). */
  readonly pace: number;
  /** Seconds before he sets off (the shooter finishes his swing first). */
  readonly reaction?: number;
}

/** Who follows up a save or a post (the defence comes from the moment itself). */
export interface ReboundSetup {
  /** The shooter first, then his teammates. */
  readonly attackers: readonly ReboundAttacker[];
}

/** How a runner moves and what he can reach. */
export interface Mover {
  readonly top: number;
  readonly accelerationTime: number;
  /** Highest ball he can play (m). */
  readonly reachUp: number;
  /** Horizontal distance from his feet at which he plays the ball (m). */
  readonly radius: number;
}

export interface Runner {
  readonly feet: Vec3;
  readonly vel: Vec3;
  /** First tick he may move. */
  readonly startTick: Tick;
  /** Where and when he meets the ball, once planned (null: he cannot, or not planned yet). */
  readonly meet: { readonly tick: Tick; readonly feet: Vec3 } | null;
  readonly planned: boolean;
}

export type ChaseWinner =
  | { readonly side: 'attack'; readonly index: number }
  | { readonly side: 'defence'; readonly index: number }
  | { readonly side: 'keeper' };

export interface ChaseState {
  readonly startTick: Tick;
  readonly attackers: readonly Runner[];
  /** One per defender of the moment, same order. */
  readonly defenders: readonly Runner[];
  readonly keeper: Runner | null;
}

// ─── Tuning ───────────────────────────────────────────────────────────────────

/** Reaction of a teammate who was already on his toes (s). */
export const ATTACKER_REACTION = 0.2;
/** The shooter finishes his follow-through before he sets off (s). */
export const SHOOTER_REACTION = 0.35;
/** After a penalty run-up he is off balance, and teammates wait for the kick at the arc (s). */
export const PENALTY_SHOOTER_REACTION = 0.75;
/** Defenders turn and go (s). */
export const DEFENDER_REACTION = 0.3;
/** A keeper standing when the ball came off him or the woodwork (s). */
export const KEEPER_REACTION = 0.25;
/** Getting up after a dive (s). */
export const KEEPER_GET_UP = 0.55;
/** Longest a chase lasts before the ball counts as cleared (s). */
export const CHASE_MAX_SECONDS = 4;

const ATTACKER_TOP: readonly [number, number] = [6, 8.8];
const ATTACKER_ACCELERATION = 0.5;
/** Highest ball one of ours can strike first time (m). */
const ATTACKER_REACH_UP = 1.1;
const PLAY_RADIUS = 0.8;
const KEEPER_RADIUS = 1;
/** Per tick, a runner with nothing to reach slows down. */
const COAST_DRAG = 0.985;
const PREDICTION_TICKS = 4 * 120;
const HALF_WIDTH = PITCH.width / 2;

export function attackerMover(pace: number): Mover {
  return {
    top: lerp(ATTACKER_TOP[0], ATTACKER_TOP[1], clamp((pace - 1) / 98, 0, 1)),
    accelerationTime: ATTACKER_ACCELERATION,
    reachUp: ATTACKER_REACH_UP,
    radius: PLAY_RADIUS,
  };
}

export function outfieldMover(top: number, accelerationTime: number, reachUp: number): Mover {
  return { top, accelerationTime, reachUp, radius: PLAY_RADIUS };
}

export function keeperMover(top: number, reachUp: number): Mover {
  return { top, accelerationTime: 0.5, reachUp, radius: KEEPER_RADIUS };
}

// ─── Who stands where ─────────────────────────────────────────────────────────

/**
 * Where our follow-up runners stand before the shot (besides the shooter): one on the far side
 * of the box for a shot or a free kick, one on the edge of the area for a penalty (outside the
 * area and the arc, Laws of the Game 14). None for the pass situation (its receivers follow up).
 */
export function reboundRunners(situation: Situation, ball: Vec3): Vec3[] {
  const g = PITCH.goalLineX;
  // Penalty: one teammate ready to follow in, on the edge of the area.
  if (situation === 'penalty') return [v3(g - 17.4, 0, 8.2)];
  if (situation === 'free' || situation === 'free-kick') {
    // Three runners in the box, in front of the shooter (so the camera sees them) but out of the
    // shot's way: far post, near post, and one arriving late. Beyond the wall on a free kick.
    const far = ball.z < 0 ? 1 : -1;
    const d = g - ball.x;
    return [
      alongLane(ball, clamp(Math.max(0.55 * d, 10.5), 0, d - 2.5), far, 2),
      alongLane(ball, clamp(Math.max(0.72 * d, 11.5), 0, d - 1.5), -far, 2.5),
      alongLane(ball, clamp(Math.max(0.4 * d, 9.5), 0, d - 3.5), far, 5),
    ];
  }
  return [];
}

/** Room kept around the shot's lane (the triangle ball → posts), m. */
const LANE_MARGIN = 1.5;
const POST_Z = 3.66;

/** Z of the middle of the shot's lane at `x` (from the ball to the centre of the goal). */
function laneCentre(x: number, ball: Vec3): number {
  const span = PITCH.goalLineX - ball.x;
  const t = span > 1e-6 ? clamp((x - ball.x) / span, 0, 1) : 1;
  return ball.z * (1 - t);
}

/**
 * A point `along` metres from the ball towards the centre of the goal, then `outside` metres
 * beyond the edge of the shot's lane, on `side` (+1: +Z).
 */
function alongLane(ball: Vec3, along: number, side: number, outside: number): Vec3 {
  const g = PITCH.goalLineX;
  const dx = g - ball.x;
  const dz = -ball.z;
  const len = sqrt(dx * dx + dz * dz) || 1;
  const x = ball.x + (dx / len) * along;
  const t = clamp((x - ball.x) / (dx || 1), 0, 1);
  const half = LANE_MARGIN + POST_Z * t;
  const edge = laneCentre(x, ball) + side * (half + outside);
  return v3(Math.min(x, g - 1), 0, clamp(edge, -HALF_WIDTH + 1.5, HALF_WIDTH - 1.5));
}

/** True if `p` stands out of the triangle between the ball and the posts (widened a little). */
export function clearOfShot(p: Vec3, ball: Vec3): boolean {
  if (p.x <= ball.x - LANE_MARGIN) return true;
  const span = PITCH.goalLineX - ball.x;
  const t = span > 1e-6 ? clamp((p.x - ball.x) / span, 0, 1) : 1;
  const half = LANE_MARGIN + POST_Z * t;
  return Math.abs(p.z - ball.z * (1 - t)) >= half;
}

function pickClear(ball: Vec3, candidates: readonly Vec3[]): Vec3 {
  return (
    candidates.find((c) => clearOfShot(c, ball)) ?? (candidates[candidates.length - 1] as Vec3)
  );
}

/**
 * Who follows up in a situation: the shooter first (from where he struck), then his teammates
 * (by default the runners of the situation). Same rule for the 3D moment and the automatic one.
 */
export function reboundSetup(
  situation: Situation,
  shooterFeet: Vec3,
  shooterPace: number,
  teammates: readonly { readonly feet: Vec3; readonly pace: number }[] = reboundRunners(
    situation,
    shooterFeet,
  ).map((feet) => ({ feet, pace: 65 })),
): ReboundSetup | undefined {
  if (situation === 'keeper') return undefined;
  return {
    attackers: [
      {
        feet: ground(shooterFeet),
        pace: shooterPace,
        reaction: situation === 'penalty' ? PENALTY_SHOOTER_REACTION : SHOOTER_REACTION,
      },
      // At a penalty everybody waits for the kick at the edge of the area, like the defenders.
      ...teammates.map((t) => ({
        feet: ground(t.feet),
        pace: t.pace,
        ...(situation === 'penalty' ? { reaction: DEFENDER_REACTION } : {}),
      })),
    ],
  };
}

/**
 * Defenders marking those runners (goal-side of them): they only block what comes at them and
 * go for loose balls. Penalty: on the edge of the area too.
 */
export function reboundCovers(situation: Situation, ball: Vec3): Vec3[] {
  const g = PITCH.goalLineX;
  // Level with the runners, on their inside (9.15 m from the mark, outside the area).
  if (situation === 'penalty') return [v3(g - 17, 0, 7), v3(g - 17, 0, -7)];
  // Goal-side of each runner, a little further from the shot's lane.
  return reboundRunners(situation, ball).map((r) => {
    const away = Math.sign(r.z - laneCentre(r.x, ball)) || 1;
    return pickClear(ball, [
      v3(Math.min(r.x + 1.4, g - 1), 0, r.z + away * 0.9),
      v3(Math.min(r.x + 1, g - 1), 0, r.z + away * 2),
    ]);
  });
}

// ─── The chase ────────────────────────────────────────────────────────────────

const ground = (p: Vec3): Vec3 => v3(p.x, 0, p.z);

function horizontalGap(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return sqrt(dx * dx + dz * dz);
}

function inPlay(p: Vec3): boolean {
  return (
    p.x < PITCH.goalLineX - 0.2 && p.x > -PITCH.goalLineX && p.z * p.z < HALF_WIDTH * HALF_WIDTH
  );
}

const idle = (feet: Vec3, startTick: Tick): Runner => ({
  feet: ground(feet),
  vel: v3(0, 0, 0),
  startTick,
  meet: null,
  planned: false,
});

export interface ChaseStart {
  readonly tick: Tick;
  readonly attackers: readonly ReboundAttacker[];
  readonly defenders: readonly Vec3[];
  /** Keeper's feet and, if he is down, the tick his dive ends. */
  readonly keeper: { readonly feet: Vec3; readonly downUntil: Tick | null } | null;
  /**
   * Attackers who were offside when the shot was struck: a ball off the keeper or the woodwork
   * does not put them back onside (Laws of the Game 11), so they stay out of it.
   */
  readonly offside?: readonly boolean[];
}

/** Start tick of a runner who never goes (offside). */
export const NEVER = Number.MAX_SAFE_INTEGER;

export function startChase(start: ChaseStart): ChaseState {
  const t = start.tick;
  const keeper = start.keeper;
  return {
    startTick: t,
    attackers: start.attackers.map((a, i) =>
      idle(
        a.feet,
        start.offside?.[i] === true
          ? NEVER
          : t + secondsToTicks(a.reaction ?? (i === 0 ? SHOOTER_REACTION : ATTACKER_REACTION)),
      ),
    ),
    defenders: start.defenders.map((feet) => idle(feet, t + secondsToTicks(DEFENDER_REACTION))),
    keeper: keeper
      ? idle(
          keeper.feet,
          keeper.downUntil !== null
            ? Math.max(t, keeper.downUntil) + secondsToTicks(KEEPER_GET_UP)
            : t + secondsToTicks(KEEPER_REACTION),
        )
      : null,
  };
}

/** Earliest point of `path` (path[i] = ball at `tick + i`) the runner can reach, playable. */
function plan(
  runner: Runner,
  mover: Mover,
  tick: Tick,
  path: readonly BallState[],
): Runner['meet'] {
  const speed = length(runner.vel);
  for (let i = 1; i < path.length; i++) {
    const p = (path[i] as BallState).pos;
    if (!inPlay(p)) return null;
    if (p.y > mover.reachUp) continue;
    const gap = horizontalGap(p, runner.feet);
    const needed = Math.max(0, gap - mover.radius * 0.8);
    const time = (tick + i - Math.max(tick, runner.startTick)) * TICK_DT;
    if (runDistance(time, mover.top, mover.accelerationTime, speed) >= needed) {
      const f = gap > 1e-6 ? needed / gap : 0;
      return {
        tick: tick + i,
        feet: v3(
          runner.feet.x + (p.x - runner.feet.x) * f,
          0,
          runner.feet.z + (p.z - runner.feet.z) * f,
        ),
      };
    }
  }
  // The ball comes to rest in play: he goes to it.
  const last = path[path.length - 1];
  if (last === undefined || !last.grounded || !inPlay(last.pos)) return null;
  return { tick: tick + path.length, feet: ground(last.pos) };
}

function move(runner: Runner, mover: Mover, tick: Tick): Runner {
  if (tick < runner.startTick) return runner;
  const meet = runner.meet;
  if (meet === null) {
    const vel = scale(runner.vel, COAST_DRAG);
    return { ...runner, feet: add(runner.feet, scale(vel, TICK_DT)), vel };
  }
  const toMeet = sub(meet.feet, runner.feet);
  const distance = length(toMeet);
  if (distance < 1e-6) return { ...runner, vel: v3(0, 0, 0) };
  const accelerated = length(runner.vel) + (mover.top / mover.accelerationTime) * TICK_DT;
  const ticksLeft = Math.max(1, meet.tick - tick + 1);
  // Flat out, unless he would get there far too early.
  const speed = Math.min(
    mover.top,
    accelerated,
    Math.max((distance / (ticksLeft * TICK_DT)) * 1.5, 2.5),
  );
  const dir = scale(toMeet, 1 / distance);
  return {
    ...runner,
    feet: add(runner.feet, scale(dir, Math.min(distance, speed * TICK_DT))),
    vel: scale(dir, speed),
  };
}

export interface ChaseMovers {
  readonly attackers: readonly Mover[];
  readonly defenders: readonly Mover[];
  readonly keeper: Mover | null;
}

/**
 * One tick of the chase: runners who may go plan (or re-plan) and move, then the first one to
 * reach the ball wins it. `feet` gives the defenders' and keeper's current positions, used for
 * those who have not set off yet (a wall still in the air, a keeper still diving).
 */
export function stepChase(
  chase: ChaseState,
  tick: Tick,
  ball: BallState,
  movers: ChaseMovers,
  flight: FlightContext,
  options: {
    /** The ball bounced on a bumpy pitch this tick: the prediction changed. */
    readonly bounced: boolean;
    readonly defenders: readonly Vec3[];
    readonly keeper: Vec3 | null;
  },
): { chase: ChaseState; winner: ChaseWinner | null } {
  let path: readonly BallState[] | null = null;
  const prediction = (): readonly BallState[] => {
    path ??= simulateFlight(ball, { ...flight, rng: null }, { maxTicks: PREDICTION_TICKS }).samples;
    return path;
  };
  const update = (runner: Runner, mover: Mover, feetNow: Vec3 | null): Runner => {
    let r = runner;
    if (tick < r.startTick) return feetNow ? { ...r, feet: ground(feetNow) } : r;
    const late = r.meet !== null && tick > r.meet.tick + 3;
    if (!r.planned || late || options.bounced)
      r = { ...r, meet: plan(r, mover, tick, prediction()), planned: true };
    return move(r, mover, tick);
  };

  const next: ChaseState = {
    ...chase,
    attackers: chase.attackers.map((r, i) => update(r, movers.attackers[i] as Mover, null)),
    defenders: chase.defenders.map((r, i) =>
      update(r, movers.defenders[i] as Mover, options.defenders[i] ?? null),
    ),
    keeper:
      chase.keeper && movers.keeper ? update(chase.keeper, movers.keeper, options.keeper) : null,
  };

  const reaches = (r: Runner, m: Mover): boolean =>
    tick >= r.startTick && ball.pos.y <= m.reachUp && horizontalGap(ball.pos, r.feet) <= m.radius;
  if (!inPlay(ball.pos)) return { chase: next, winner: null };
  if (next.keeper && movers.keeper && reaches(next.keeper, movers.keeper))
    return { chase: next, winner: { side: 'keeper' } };
  const d = next.defenders.findIndex((r, i) => reaches(r, movers.defenders[i] as Mover));
  if (d >= 0) return { chase: next, winner: { side: 'defence', index: d } };
  const a = next.attackers.findIndex((r, i) => reaches(r, movers.attackers[i] as Mover));
  if (a >= 0) return { chase: next, winner: { side: 'attack', index: a } };
  return { chase: next, winner: null };
}

/** Nobody can get to the ball any more (it is rolling out, or out of everyone's reach). */
export function chaseHopeless(chase: ChaseState, tick: Tick): boolean {
  const runners = [...chase.attackers, ...chase.defenders, ...(chase.keeper ? [chase.keeper] : [])];
  return runners
    .filter((r) => r.startTick !== NEVER)
    .every((r) => tick >= r.startTick && r.planned && r.meet === null);
}
