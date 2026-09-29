// Match simulation by phases (ARCHITECTURE §4.2). A phase: the carrier's decision (utility AI),
// duels against the nearest defenders, the ball moves on or changes hands, until a shot, a stop
// or a turnover. Deterministic: the same setup gives the same actions, events and score.
//
// Everything is computed in the attacking team's frame (see shape.ts) and stored in absolute
// coordinates for the renderer.

import { clamp, exp, hypot } from '../math/index.ts';
import { Rng } from '../rng/index.ts';
import { FORMATION_SLOTS } from './formations.ts';
import type { MatchPlayer, MatchSetup, MatchTeam, PlayerAttributes, Tactic } from './model.ts';
import { POSITION_LINE, type Position } from './positions.ts';
import { teamShape, toAbsolute, toTeamFrame, type Point } from './shape.ts';
import {
  collectifs,
  effectiveAttributes,
  lineupPlayers,
  playerById,
  playerRating,
  teamRating,
} from './team.ts';

export type Side = 0 | 1;

export type ActionKind =
  | 'kickoff'
  | 'pass'
  | 'long-pass'
  | 'dribble'
  | 'cross'
  | 'clearance'
  | 'shot'
  | 'tackle'
  | 'interception'
  | 'throw-in'
  | 'corner'
  | 'goal-kick'
  | 'free-kick'
  | 'penalty'
  | 'foul'
  | 'offside';

/** One ball movement, for the 2D renderer: who played it, where the ball ends, when. */
export interface MatchAction {
  /** Match clock at the end of the action (seconds; the second half starts again at 45:00). */
  readonly t: number;
  readonly half: 1 | 2;
  readonly team: Side;
  readonly kind: ActionKind;
  /** Player who played the ball (id) and who received it (id), if any. */
  readonly from: string;
  readonly to: string | null;
  /** Ball position at the end of the action, absolute frame. */
  readonly ball: Point;
  readonly success: boolean;
}

export type MatchEventKind =
  | 'kickoff'
  | 'goal'
  | 'save'
  | 'miss'
  | 'block'
  | 'post'
  | 'corner'
  | 'foul'
  | 'free-kick'
  | 'penalty'
  | 'chance'
  | 'half-time'
  | 'full-time'
  | 'yellow'
  | 'red'
  | 'injury'
  | 'offside'
  | 'sub';

export interface MatchEvent {
  /** Match clock (seconds; 45:00 again at the start of the second half). */
  readonly t: number;
  readonly half: 1 | 2;
  readonly kind: MatchEventKind;
  readonly team: Side;
  readonly player: string | null;
  /** Second player (assist, fouled player, keeper…). */
  readonly other: string | null;
  readonly xg: number | null;
  readonly score: readonly [number, number];
}

export interface TeamStats {
  shots: number;
  onTarget: number;
  xg: number;
  goals: number;
  passes: number;
  passesCompleted: number;
  corners: number;
  fouls: number;
  yellows: number;
  reds: number;
  subs: number;
  /** Seconds with the ball. */
  possession: number;
}

export interface MatchResult {
  readonly score: readonly [number, number];
  readonly events: readonly MatchEvent[];
  readonly actions: readonly MatchAction[];
  readonly stats: readonly [TeamStats, TeamStats];
  readonly duration: number;
}

export type ShotKind = 'open' | 'header' | 'free-kick' | 'penalty';

/** How a shot ends, whether simulated here or played in 3D. */
export type ShotOutcome =
  | 'goal'
  | 'save-catch'
  | 'save-parry'
  | 'block'
  | 'post'
  | 'miss'
  /** The pass to the shooter was played with him beyond the last defender (key moment only). */
  | 'offside';

/** The kind of 3D key moment (the Phase 1 situations). */
export type MomentKind = 'shot' | 'pass-shot' | 'free-kick' | 'penalty' | 'keeper';

/** A key moment for the player: everything the 3D scene needs to set it up. */
export interface MomentRequest {
  readonly id: number;
  readonly kind: MomentKind;
  readonly t: number;
  readonly half: 1 | 2;
  /** Side taking the shot (the opponent's for a 'keeper' moment). */
  readonly attacking: Side;
  readonly shooter: MatchPlayer;
  /** Shooter's attributes now (position, collectifs, fatigue). */
  readonly shooterAttributes: PlayerAttributes;
  readonly keeper: MatchPlayer;
  /** Where the ball is, in the attacking team's frame (y = 1: goal line attacked). */
  readonly spot: Point;
  readonly xg: number;
  /** Sub-seed of the moment (execution errors, keeper draws). */
  readonly seed: number;
}

export interface PlayedMoment {
  readonly id: number;
  readonly kind: MomentKind;
  readonly outcome: ShotOutcome;
}

export interface MatchOptions {
  /** The side the player controls (key moments), or null for a fully simulated match. */
  readonly userSide?: Side | null;
  /** Most key moments per match (GDD §7.1: 3 to 6). */
  readonly maxMoments?: number;
  /** Stop at half-time for the coach's changes (`resumeSecondHalf` to go on). */
  readonly pauseAtHalfTime?: boolean;
}

/** A change made by the player (half-time talk, live): part of the inputs that replay a match. */
export type MatchChange =
  | {
      readonly phase: number;
      readonly type: 'tactic';
      readonly side: Side;
      readonly tactic: Tactic;
    }
  | {
      readonly phase: number;
      readonly type: 'sub';
      readonly side: Side;
      readonly out: string;
      readonly in: string;
    };

/** Everything the player did in a match: replaying it with the same setup gives the same match. */
export interface MatchInputs {
  /** Outcomes of the key moments, in order. */
  readonly moments: readonly ShotOutcome[];
  readonly changes: readonly MatchChange[];
}

type Restart = 'kickoff' | 'throw-in' | 'corner' | 'goal-kick' | 'free-kick' | 'penalty' | null;

interface SideState {
  readonly team: MatchTeam;
  tactic: Tactic;
  /** On the pitch, by formation slot (substitutions replace entries). */
  readonly players: MatchPlayer[];
  readonly slots: readonly Position[];
  /** Attributes in the slot with collectifs, before fatigue. */
  readonly base: PlayerAttributes[];
  readonly collectif: readonly number[];
  /** Energy 100 → 0 (fatigue), knocks (−20 %), cards. */
  readonly energy: number[];
  readonly knocked: boolean[];
  readonly booked: boolean[];
  readonly sentOff: boolean[];
  readonly bench: MatchPlayer[];
  readonly keeperRating: number;
  readonly stats: TeamStats;
}

/** Substitutions per team (GDD §7.6). */
export const MAX_SUBS = 5;

const HALF = 45 * 60;
const logistic = (x: number): number => 1 / (1 + exp(-x));
/** Logit per attribute point in a duel: small, since a match is a thousand duels. */
const SKILL = 0.017;
/** Attribute points the home side gains in its duels (pitch, crowd, no bus trip). */
const HOME_BONUS = 4;
const PITCH_W = 68;
const PITCH_L = 105;

/** Expected goals of an open-play shot from `p` (team frame). */
export function shotXg(p: Point, header = false): number {
  const dx = (p.x - 0.5) * PITCH_W;
  const dy = (1 - p.y) * PITCH_L;
  const distance = hypot(dx, dy);
  // Angle the goal mouth subtends, relative to a central shot from the penalty spot.
  const openness = clamp(dy / Math.max(1, distance), 0.15, 1);
  const xg = 0.85 * exp(-distance / 7) * (0.35 + 0.65 * openness);
  return clamp(header ? xg * 0.55 : xg, 0.005, 0.8);
}

export class MatchSim {
  readonly setup: MatchSetup;
  private readonly rng: Rng;
  private readonly sides: readonly [SideState, SideState];
  private readonly actions: MatchAction[] = [];
  private readonly events: MatchEvent[] = [];
  private score: [number, number] = [0, 0];
  private t = 0;
  private half: 1 | 2 = 1;
  private halfEnd: number;
  private possession: Side = 0;
  /** Ball in the possessing team's frame. */
  private ball: Point = { x: 0.5, y: 0.5 };
  private carrier = 10;
  private restart: Restart = 'kickoff';
  private phase = 0;
  private finished = false;
  /** Amateur football: the lower the level, the more mistakes, the more goals. */
  private readonly levelFactor: number;
  private readonly lastSub: [number, number] = [-Infinity, -Infinity];
  private readonly options: Required<MatchOptions>;
  private pending: MomentRequest | null = null;
  private shotContext: { xg: number; quality: number } | null = null;
  private readonly moments: PlayedMoment[] = [];
  private readonly changes: MatchChange[] = [];
  private halfBreak = false;

  constructor(setup: MatchSetup, options: MatchOptions = {}) {
    this.setup = setup;
    this.options = {
      userSide: options.userSide ?? null,
      maxMoments: options.maxMoments ?? 6,
      pauseAtHalfTime: options.pauseAtHalfTime ?? false,
    };
    this.rng = Rng.create(setup.seed).fork('match');
    this.sides = [this.side(setup.home), this.side(setup.away)];
    const level = (teamRating(setup.home) + teamRating(setup.away)) / 2;
    this.levelFactor = clamp(1 + (66 - level) * 0.014, 0.85, 1.4);
    this.halfEnd = HALF + this.stoppage(1);
    this.possession = this.rng.chance(0.5) ? 0 : 1;
    this.event('kickoff', this.possession, null);
  }

  get over(): boolean {
    return this.finished;
  }

  /** Why the match is not moving: a key moment to play, or the half-time break. */
  get waiting(): 'moment' | 'half-time' | null {
    if (this.pending !== null) return 'moment';
    return this.halfBreak ? 'half-time' : null;
  }

  /** Number of phases played so far (the clock of the player's inputs). */
  get phaseIndex(): number {
    return this.phase;
  }

  /** Ends the half-time break. */
  resumeSecondHalf(): void {
    this.halfBreak = false;
  }

  /** Players on the pitch of `side`, by formation slot. */
  lineup(side: Side): readonly MatchPlayer[] {
    return this.sides[side].players;
  }

  /** Substitutes still on the bench of `side`. */
  benchOf(side: Side): readonly MatchPlayer[] {
    return this.sides[side].bench;
  }

  /** Slots of `side` whose player has been sent off. */
  sentOffSlots(side: Side): readonly boolean[] {
    return this.sides[side].sentOff;
  }

  /** Substitutions `side` can still make. */
  subsLeft(side: Side): number {
    return MAX_SUBS - this.sides[side].stats.subs;
  }

  /** The team's tactic now. */
  tacticOf(side: Side): Tactic {
    return this.sides[side].tactic;
  }

  /** What the player has done so far (moments' outcomes and coach's changes). */
  get inputs(): MatchInputs {
    return { moments: this.moments.map((m) => m.outcome), changes: this.changes };
  }

  /** Plays one phase; false once the final whistle has gone. */
  step(): boolean {
    if (this.finished) return false;
    // Waiting for the player's key moment or the half-time break: nothing moves.
    if (this.pending !== null || this.halfBreak) return true;
    const rng = this.rng.fork('phase', this.phase++);
    this.autoSubstitutions();
    if (this.restart !== null) this.playRestart(rng);
    if (this.pending !== null) return true;
    // Open play: a few actions until a shot, a stop or a turnover.
    for (let i = 0; i < 6 && this.restart === null && !this.clockCheck(); i++) {
      if (!this.playAction(rng) || this.pending !== null) break;
    }
    if (this.pending !== null) return true;
    this.clockCheck();
    return !this.finished;
  }

  /** Plays to the end; `resolve` answers key moments (none without a user side). */
  run(resolve?: (moment: MomentRequest) => ShotOutcome): MatchResult {
    while (this.step()) {
      if (this.halfBreak) this.resumeSecondHalf();
      if (this.pending !== null) {
        if (!resolve) throw new Error('Key moment pending: pass a resolver');
        this.resolveMoment(resolve(this.pending));
      }
    }
    return this.result();
  }

  result(): MatchResult {
    return {
      score: [this.score[0], this.score[1]],
      events: this.events,
      actions: this.actions,
      stats: [this.sides[0].stats, this.sides[1].stats],
      duration: this.t,
    };
  }

  // ─── Setup ──────────────────────────────────────────────────────────────────

  private side(team: MatchTeam): SideState {
    const players = lineupPlayers(team);
    const slots = FORMATION_SLOTS[team.formation].map((s) => s.position);
    const points = collectifs(team);
    const base = players.map((p, i) => effectiveAttributes(p, slots[i] ?? 'CM', points[i] ?? 0));
    const keeper = players[0];
    return {
      team,
      tactic: team.tactic,
      players,
      slots,
      base,
      collectif: points,
      energy: players.map(() => 100),
      knocked: players.map(() => false),
      booked: players.map(() => false),
      sentOff: players.map(() => false),
      bench: team.bench.map((id) => playerById(team, id)),
      keeperRating: keeper ? playerRating(keeper, 'GK') : 40,
      stats: {
        yellows: 0,
        reds: 0,
        subs: 0,
        shots: 0,
        onTarget: 0,
        xg: 0,
        goals: 0,
        passes: 0,
        passesCompleted: 0,
        corners: 0,
        fouls: 0,
        possession: 0,
      },
    };
  }

  private stoppage(half: 1 | 2): number {
    return this.rng.fork('stoppage', half).int(1, half === 1 ? 3 : 5) * 60;
  }

  // ─── Clock ──────────────────────────────────────────────────────────────────

  private tick(seconds: number): void {
    this.t += seconds;
    this.sides[this.possession].stats.possession += seconds;
    for (const s of this.sides) {
      const press = 1 + (s.tactic.pressing - 3) * 0.12;
      s.players.forEach((p, i) => {
        const rate = 0.55 * (1.6 - p.stamina / 100) * press;
        s.energy[i] = Math.max(0, (s.energy[i] ?? 100) - (seconds / 60) * rate);
      });
    }
  }

  /** Attributes of a player now: fatigue slows the legs first, a knock costs 20 %. */
  private attr(side: Side, slot: number): PlayerAttributes {
    const s = this.sides[side];
    const b = s.base[slot] as PlayerAttributes;
    const e = (s.energy[slot] ?? 100) / 100;
    const k = s.knocked[slot] ? 0.8 : 1;
    const legs = (0.8 + 0.2 * e) * k;
    const head = (0.9 + 0.1 * e) * k;
    return {
      pace: b.pace * legs,
      shooting: b.shooting * head,
      passing: b.passing * head,
      dribbling: b.dribbling * head,
      defending: b.defending * head,
      physical: b.physical * legs,
    };
  }

  /** Players a side is missing (red cards). */
  private missing(side: Side): number {
    return this.sides[side].sentOff.filter(Boolean).length;
  }

  // ─── Player controls (half-time, the match screen) ─────────────────────────

  /** Changes a team's tactic from now on. */
  setTactic(side: Side, tactic: Tactic): void {
    this.sides[side].tactic = tactic;
    this.changes.push({ phase: this.phase, type: 'tactic', side, tactic });
  }

  /** Replaces the player `outId` by the substitute `inId`; false if not allowed. */
  substitute(side: Side, outId: string, inId: string): boolean {
    const done = this.swap(side, outId, inId);
    if (done) this.changes.push({ phase: this.phase, type: 'sub', side, out: outId, in: inId });
    return done;
  }

  /** The substitution itself (the coach's own changes are not the player's inputs). */
  private swap(side: Side, outId: string, inId: string): boolean {
    const s = this.sides[side];
    const slot = s.players.findIndex((p) => p.id === outId);
    const bench = s.bench.findIndex((p) => p.id === inId);
    if (slot < 0 || bench < 0 || s.sentOff[slot] || s.stats.subs >= MAX_SUBS) return false;
    const incoming = s.bench[bench] as MatchPlayer;
    s.bench.splice(bench, 1);
    s.players[slot] = incoming;
    s.base[slot] = effectiveAttributes(incoming, s.slots[slot] ?? 'CM', s.collectif[slot] ?? 0);
    s.energy[slot] = 100;
    s.knocked[slot] = false;
    s.booked[slot] = false;
    s.stats.subs++;
    this.event('sub', side, inId, outId);
    return true;
  }

  /** Coach's changes: a knocked player comes off, then the most tired after the hour. */
  private autoSubstitutions(): void {
    this.sides.forEach((s, index) => {
      const side = index as Side;
      if (s.stats.subs >= MAX_SUBS || s.bench.length === 0) return;
      let slot = s.knocked.findIndex((k, i) => k && !s.sentOff[i]);
      // Tired legs after the hour: one change every five minutes, the last one kept for knocks.
      const fresh = this.t - (this.lastSub[side] ?? -Infinity) >= 5 * 60;
      if (slot < 0 && this.half === 2 && this.t > 60 * 60 && fresh && s.stats.subs < MAX_SUBS - 1) {
        let lowest = 70;
        s.energy.forEach((e, i) => {
          if (i > 0 && !s.sentOff[i] && e < lowest) {
            lowest = e;
            slot = i;
          }
        });
      }
      if (slot < 0) return;
      const line = POSITION_LINE[s.slots[slot] ?? 'CM'];
      const incoming =
        s.bench.find((p) => POSITION_LINE[p.positions[0] ?? 'CM'] === line) ??
        s.bench.find((p) => p.positions[0] !== 'GK');
      const out = s.players[slot];
      if (incoming && out && this.swap(side, out.id, incoming.id)) this.lastSub[side] = this.t;
    });
  }

  /** Handles half-time and full-time; true when play stopped. */
  private clockCheck(): boolean {
    if (this.t < this.halfEnd) return false;
    if (this.half === 1) {
      this.event('half-time', 0, null);
      this.half = 2;
      this.t = HALF;
      this.halfEnd = 2 * HALF + this.stoppage(2);
      const first = this.events[0]?.team ?? 0;
      this.possession = first === 0 ? 1 : 0;
      this.ball = { x: 0.5, y: 0.5 };
      this.restart = 'kickoff';
      this.event('kickoff', this.possession, null);
      this.halfBreak = this.options.pauseAtHalfTime;
      return true;
    }
    this.event('full-time', 0, null);
    this.finished = true;
    return true;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private attack(): SideState {
    return this.sides[this.possession];
  }

  private defence(): SideState {
    return this.sides[this.possession === 0 ? 1 : 0];
  }

  private other(side: Side): Side {
    return side === 0 ? 1 : 0;
  }

  private id(side: Side, slot: number): string {
    return this.sides[side].players[slot]?.id ?? '?';
  }

  private abs(p: Point, side: Side): Point {
    return toAbsolute(p, side === 0, this.half === 2);
  }

  private record(
    kind: ActionKind,
    to: number | null,
    success: boolean,
    side = this.possession,
    toSide: Side = side,
  ): void {
    this.actions.push({
      t: this.t,
      half: this.half,
      team: side,
      kind,
      from: this.id(side, this.carrier),
      to: to === null ? null : this.id(toSide, to),
      ball: this.abs(this.ball, side),
      success,
    });
  }

  private event(
    kind: MatchEventKind,
    team: Side,
    player: string | null,
    other: string | null = null,
    xg: number | null = null,
  ): void {
    this.events.push({
      t: this.t,
      half: this.half,
      kind,
      team,
      player,
      other,
      xg,
      score: [this.score[0], this.score[1]],
    });
  }

  /** Slot of `side` nearest to `p` (in `side`'s frame), excluding `except`. */
  private nearest(
    side: Side,
    p: Point,
    inPossession: boolean,
    except = -1,
    outfield = true,
  ): number {
    const s = this.sides[side];
    const shape = teamShape(s.team.formation, s.tactic, p, inPossession);
    let best = outfield ? 1 : 0;
    let bestD = Infinity;
    for (let i = outfield ? 1 : 0; i < shape.length; i++) {
      if (i === except || s.sentOff[i]) continue;
      const q = shape[i] as Point;
      const d = (q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** Swaps possession: the ball, in the new team's frame, at the same spot. */
  private turnover(winner: number): void {
    this.ball = toTeamFrame(this.ball, false, false);
    this.possession = this.other(this.possession);
    this.carrier = winner;
  }

  private home(side: Side): number {
    return side === 0 ? HOME_BONUS : 0;
  }

  // ─── Restarts ───────────────────────────────────────────────────────────────

  private playRestart(rng: Rng): void {
    const restart = this.restart;
    this.restart = null;
    const a = this.attack();
    switch (restart) {
      case 'kickoff': {
        this.ball = { x: 0.5, y: 0.5 };
        this.carrier = this.slotOf(a, 'attack');
        this.tick(rng.range(4, 10));
        this.record('kickoff', null, true);
        return;
      }
      case 'goal-kick': {
        this.carrier = 0;
        this.ball = { x: 0.5, y: 0.06 };
        this.tick(rng.range(12, 25));
        this.record('goal-kick', null, true);
        this.longBall(rng);
        return;
      }
      case 'throw-in': {
        this.ball = { x: this.ball.x < 0.5 ? 0 : 1, y: this.ball.y };
        this.carrier = this.nearest(this.possession, this.ball, true);
        this.tick(rng.range(10, 20));
        this.record('throw-in', null, true);
        return;
      }
      case 'corner': {
        a.stats.corners++;
        this.ball = { x: rng.chance(0.5) ? 0 : 1, y: 1 };
        this.carrier = this.taker(a, a.tactic.takers.corner, 'passing');
        this.tick(rng.range(20, 35));
        this.record('corner', null, true);
        this.event('corner', this.possession, this.id(this.possession, this.carrier));
        this.cross(rng);
        return;
      }
      case 'free-kick': {
        this.tick(rng.range(15, 30));
        const danger = this.ball.y > 0.68 && Math.abs(this.ball.x - 0.5) < 0.25;
        this.event('free-kick', this.possession, this.id(this.possession, this.carrier));
        if (danger && rng.chance(0.65)) {
          this.carrier = this.taker(a, a.tactic.takers.freeKick, 'shooting');
          this.record('free-kick', null, true);
          this.shoot(rng, 'free-kick');
        } else {
          this.record('free-kick', null, true);
        }
        return;
      }
      case 'penalty': {
        this.carrier = this.taker(a, a.tactic.takers.penalty, 'shooting');
        this.ball = { x: 0.5, y: 1 - 11 / PITCH_L };
        this.tick(rng.range(40, 70));
        this.event('penalty', this.possession, this.id(this.possession, this.carrier));
        this.record('penalty', null, true);
        this.shoot(rng, 'penalty');
        return;
      }
      default:
        return;
    }
  }

  private slotOf(s: SideState, line: 'defence' | 'midfield' | 'attack'): number {
    const i = s.slots.findIndex((p) => POSITION_LINE[p] === line);
    return i < 0 ? 10 : i;
  }

  /** Designated taker, or the best outfield player for the attribute. */
  private taker(s: SideState, id: string | undefined, key: keyof PlayerAttributes): number {
    const designated = id === undefined ? -1 : s.players.findIndex((p) => p.id === id);
    if (designated > 0) return designated;
    let best = 1;
    for (let i = 1; i < s.base.length; i++) {
      if (s.sentOff[i]) continue;
      if ((s.base[i]?.[key] ?? 0) > (s.base[best]?.[key] ?? 0)) best = i;
    }
    return best;
  }

  // ─── Open play ──────────────────────────────────────────────────────────────

  /** One decision of the carrier; false when the phase ends (turnover, shot, stop). */
  private playAction(rng: Rng): boolean {
    const a = this.attack();
    const tactic = a.tactic;
    const surface = this.setup.conditions.surface;
    const y = this.ball.y;
    const wide = this.ball.x < 0.22 || this.ball.x > 0.78;
    const attr = this.attr(this.possession, this.carrier);
    const xgHere = shotXg(this.ball);

    // Utility of each option (ARCHITECTURE §4.2), then a seeded weighted pick.
    const options: [ActionKind, number][] = [
      [
        'pass',
        3 * (tactic.style === 'possession' ? 1.5 : 1) * (surface === 'artificial' ? 1.15 : 1),
      ],
      [
        'long-pass',
        y > 0.72
          ? 0
          : 0.7 *
            (tactic.style === 'long-ball' ? 2.4 : tactic.style === 'counter' ? 1.5 : 1) *
            (surface === 'muddy' || surface === 'dirt' ? 1.4 : 1),
      ],
      ['dribble', (attr.dribbling / 70) * (surface === 'muddy' ? 0.6 : 1) * (y > 0.5 ? 1.3 : 0.7)],
      ['cross', wide && y > 0.62 ? 1.4 : 0],
      ['shot', y > 0.62 ? xgHere * 15 * (1 + tactic.mentality * 0.15) * (attr.shooting / 65) : 0],
      ['clearance', y < 0.18 ? 0.8 : 0],
    ];
    const total = options.reduce((s, o) => s + o[1], 0);
    let pick = rng.float() * total;
    let kind: ActionKind = 'pass';
    for (const [k, w] of options) {
      pick -= w;
      if (pick <= 0) {
        kind = k;
        break;
      }
    }

    switch (kind) {
      case 'shot':
        this.shoot(rng, 'open');
        return false;
      case 'cross':
        this.cross(rng);
        return false;
      case 'clearance':
        this.tick(rng.range(3, 6));
        this.record('clearance', null, true);
        this.longBall(rng, 0.25);
        return false;
      case 'long-pass':
        return this.longBall(rng);
      default:
        return this.duel(rng, kind);
    }
  }

  /** Defender contesting the ball here, and his strength in this duel. */
  private contest(key: 'defending' | 'pace'): { slot: number; value: number } {
    const d = this.defence();
    const spot = toTeamFrame(this.ball, false, false);
    const slot = this.nearest(this.other(this.possession), spot, false);
    const at = this.attr(this.other(this.possession), slot);
    const pressing = (d.tactic.pressing - 3) * 2;
    // Down to ten: the others have more ground to cover.
    const short = (this.missing(this.other(this.possession)) - this.missing(this.possession)) * 4;
    return {
      slot,
      value:
        at[key] * 0.75 + at.pace * 0.25 + pressing + this.home(this.other(this.possession)) - short,
    };
  }

  private duel(rng: Rng, kind: 'pass' | 'dribble' | ActionKind): boolean {
    const a = this.attack();
    const attr = this.attr(this.possession, this.carrier);
    const isPass = kind === 'pass';
    const skill =
      (isPass ? attr.passing : attr.dribbling * 0.75 + attr.pace * 0.25) +
      this.home(this.possession);
    const defender = this.contest('defending');
    // Harder the closer to the opposing goal (the block is tighter there).
    const { surface, rain } = this.setup.conditions;
    const base =
      (isPass ? 1.9 : 0.35) -
      this.ball.y * 0.9 -
      (isPass && surface === 'dirt' ? 0.15 : 0) -
      (isPass && rain ? 0.1 : 0) -
      (!isPass && surface === 'muddy' ? 0.25 : 0);
    const success = rng.chance(logistic(base + (skill - defender.value) * SKILL));
    this.tick(isPass ? rng.range(3, 7) : rng.range(3, 6));
    if (isPass) a.stats.passes++;
    const target: Point = {
      x: clamp(this.ball.x + rng.normal(0, 0.18), 0.04, 0.96),
      y: clamp(this.ball.y + (isPass ? rng.range(-0.04, 0.14) : rng.range(0.05, 0.12)), 0.04, 0.95),
    };

    if (success) {
      if (isPass) a.stats.passesCompleted++;
      const receiver = isPass
        ? this.nearest(this.possession, target, true, this.carrier)
        : this.carrier;
      this.ball = target;
      this.record(isPass ? 'pass' : 'dribble', isPass ? receiver : null, true);
      this.carrier = receiver;
      return true;
    }
    if (isPass) {
      // A pass towards the touchline sometimes runs out; otherwise it is cut on its way.
      if ((target.x < 0.1 || target.x > 0.9) && rng.chance(0.35)) {
        this.ball = { x: target.x < 0.5 ? 0 : 1, y: target.y };
        this.record('pass', null, false);
        this.outOfPlay(rng);
        return false;
      }
      const cut = rng.range(0.35, 0.8);
      this.ball = {
        x: this.ball.x + (target.x - this.ball.x) * cut,
        y: this.ball.y + (target.y - this.ball.y) * cut,
      };
    }
    return this.lose(rng, isPass ? 'interception' : 'tackle', defender.slot);
  }

  /** Ball lost to `winner`: maybe a foul (free kick / penalty) instead. */
  private lose(rng: Rng, kind: 'interception' | 'tackle', winner: number): boolean {
    const d = this.defence();
    const foulChance = (kind === 'tackle' ? 0.2 : 0.06) + (d.tactic.pressing - 3) * 0.02;
    if (rng.chance(foulChance)) {
      d.stats.fouls++;
      const fouled = this.id(this.possession, this.carrier);
      const offender = this.other(this.possession);
      this.event('foul', offender, this.id(offender, winner), fouled);
      this.discipline(rng, offender, winner, kind === 'tackle' ? 0.13 : 0.04);
      if (rng.chance(0.025)) {
        this.attack().knocked[this.carrier] = true;
        this.event('injury', this.possession, fouled);
      }
      this.record('foul', winner, false, this.possession, offender);
      const inBox = this.ball.y > 0.84 && Math.abs(this.ball.x - 0.5) < 0.2;
      this.restart = inBox && rng.chance(0.3) ? 'penalty' : 'free-kick';
      return false;
    }
    this.record(kind, null, false);
    const side = this.other(this.possession);
    this.turnover(winner);
    this.record(kind, null, true, side);
    return false;
  }

  /** Cards after a foul: yellow, second yellow, or (rarely) a straight red. */
  private discipline(rng: Rng, side: Side, slot: number, yellow: number): void {
    const s = this.sides[side];
    const id = this.id(side, slot);
    const straight = rng.chance(0.003);
    // Once booked, a player goes into his tackles more carefully.
    if (!straight && !rng.chance(s.booked[slot] ? yellow * 0.4 : yellow)) return;
    if (!straight && !s.booked[slot]) {
      s.booked[slot] = true;
      s.stats.yellows++;
      this.event('yellow', side, id);
      return;
    }
    if (!straight) {
      s.stats.yellows++;
      this.event('yellow', side, id);
    }
    s.sentOff[slot] = true;
    s.stats.reds++;
    this.event('red', side, id);
  }

  /** Long ball forward (or a clearance, `from` y): won in the air or lost. */
  private longBall(rng: Rng, minY = 0): boolean {
    const a = this.attack();
    const attr = this.attr(this.possession, this.carrier);
    a.stats.passes++;
    const target: Point = {
      x: clamp(this.ball.x + rng.normal(0, 0.25), 0.05, 0.95),
      y: clamp(Math.max(minY, this.ball.y) + rng.range(0.2, 0.38), 0.1, 0.9),
    };
    this.tick(rng.range(4, 8));
    const receiver = this.nearest(this.possession, target, true, this.carrier);
    const aerial = this.attr(this.possession, receiver).physical;
    const defender = this.contest('pace');
    // A high line leaves space behind it; wind carries long balls away.
    const behind = target.y > 0.7 ? (this.defence().tactic.lineHeight - 3) * 4 : 0;
    const p = logistic(
      -0.2 -
        this.setup.conditions.windSpeed * 0.02 +
        (attr.passing * 0.5 + aerial * 0.5 - defender.value + behind) * SKILL,
    );
    this.ball = target;
    if (rng.chance(p)) {
      // Balls in behind sometimes find a runner offside: free kick to the defence.
      if (target.y > 0.72 && rng.chance(0.07)) {
        this.record('long-pass', receiver, false);
        this.event('offside', this.possession, this.id(this.possession, receiver));
        this.record('offside', receiver, false);
        const winner = this.nearest(
          this.other(this.possession),
          toTeamFrame(this.ball, false, false),
          true,
        );
        this.turnover(winner);
        this.restart = 'free-kick';
        return false;
      }
      a.stats.passesCompleted++;
      this.record('long-pass', receiver, true);
      this.carrier = receiver;
      return true;
    }
    if (rng.chance(0.2)) {
      this.record('long-pass', null, false);
      this.outOfPlay(rng);
      return false;
    }
    this.record('long-pass', null, false);
    this.turnover(defender.slot);
    this.record('interception', null, true);
    return false;
  }

  /** Cross into the box: a header or a volley, or cleared. */
  private cross(rng: Rng): void {
    const attr = this.attr(this.possession, this.carrier);
    this.tick(rng.range(3, 6));
    const target: Point = {
      x: clamp(0.5 + rng.normal(0, 0.1), 0.3, 0.7),
      y: rng.range(0.86, 0.95),
    };
    const receiver = this.nearest(this.possession, target, true, this.carrier);
    const aerial = this.attr(this.possession, receiver);
    const defender = this.contest('defending');
    const p = logistic(
      -0.9 + (attr.passing * 0.5 + aerial.physical * 0.5 - defender.value) * SKILL,
    );
    this.ball = target;
    if (rng.chance(p)) {
      this.record('cross', receiver, true);
      this.carrier = receiver;
      this.shoot(rng, 'header');
      return;
    }
    this.record('cross', null, false);
    if (rng.chance(0.18)) {
      this.restart = 'corner';
      return;
    }
    this.turnover(defender.slot);
    this.record('clearance', null, true);
    this.longBall(rng, 0.1);
  }

  private outOfPlay(rng: Rng): void {
    const side = this.other(this.possession);
    const winner = this.nearest(side, toTeamFrame(this.ball, false, false), true);
    this.turnover(winner);
    this.restart = this.ball.y < 0.1 ? 'goal-kick' : 'throw-in';
    if (rng.chance(0.5) && this.restart === 'throw-in')
      this.ball = { x: this.ball.x < 0.5 ? 0 : 1, y: this.ball.y };
  }

  // ─── Shots ──────────────────────────────────────────────────────────────────

  private shoot(rng: Rng, kind: ShotKind): void {
    const a = this.attack();
    const d = this.defence();
    const side = this.possession;
    const shooter = this.attr(this.possession, this.carrier);
    const player = a.players[this.carrier] as MatchPlayer;
    let xg =
      kind === 'penalty'
        ? 0.76
        : kind === 'free-kick'
          ? clamp(shotXg(this.ball) * 0.45, 0.03, 0.12)
          : shotXg(this.ball, kind === 'header');
    // Finisher against keeper; rain makes keepers less sure (GDD §7.3).
    const quality = kind === 'header' ? shooter.physical : shooter.shooting;
    xg = clamp(
      xg *
        (1 + (quality - d.keeperRating) * 0.006) *
        this.levelFactor *
        (1 + (player.composure - 60) * 0.003) *
        (this.setup.conditions.rain ? 1.08 : 1),
      0.005,
      0.92,
    );
    a.stats.shots++;
    a.stats.xg += xg;
    this.tick(rng.range(2, 5));
    const shooterId = this.id(side, this.carrier);
    if (xg >= 0.2 || kind === 'penalty') this.event('chance', side, shooterId, null, xg);

    // A key moment the player plays in 3D: the match waits for its outcome.
    const moment = this.momentFor(kind, xg);
    if (moment !== null) {
      this.pending = {
        id: this.moments.length,
        kind: moment,
        t: this.t,
        half: this.half,
        attacking: side,
        shooter: player,
        shooterAttributes: shooter,
        keeper: d.players[0] as MatchPlayer,
        spot: this.ball,
        xg,
        seed: this.rng.fork('moment', this.moments.length).nextU32(),
      };
      this.shotContext = { xg, quality };
      return;
    }

    let outcome: ShotOutcome;
    if (rng.chance(xg)) outcome = 'goal';
    else if (rng.chance(clamp(0.28 + quality / 300, 0.3, 0.65)))
      outcome = rng.chance(0.25) ? 'save-parry' : 'save-catch';
    else if (rng.chance(0.2)) outcome = 'block';
    else outcome = rng.chance(0.06) ? 'post' : 'miss';
    this.applyShot(outcome, xg, rng);
  }

  /** Consequences of a shot for the match (score, restart, possession, events). */
  private applyShot(outcome: ShotOutcome, xg: number, rng: Rng): void {
    const a = this.attack();
    const side = this.possession;
    const shooterId = this.id(side, this.carrier);
    const keeperId = this.id(this.other(side), 0);
    if (outcome === 'goal') {
      a.stats.goals++;
      a.stats.onTarget++;
      this.score[side]++;
      this.ball = { x: 0.5, y: 1 };
      this.record('shot', null, true);
      this.event('goal', side, shooterId, null, xg);
      // Celebrations, the walk back to the centre circle.
      this.tick(rng.range(25, 40));
      this.possession = this.other(side);
      this.restart = 'kickoff';
      return;
    }
    if (outcome === 'offside') {
      // The flag is up before any shot: it does not count as one.
      a.stats.shots--;
      a.stats.xg -= xg;
      this.record('offside', null, false);
      this.event('offside', side, shooterId);
      const winner = this.nearest(this.other(side), toTeamFrame(this.ball, false, false), true);
      this.turnover(winner);
      this.restart = 'free-kick';
      return;
    }
    const saved = outcome === 'save-catch' || outcome === 'save-parry';
    this.ball = { x: clamp(0.5 + rng.normal(0, saved ? 0.03 : 0.08), 0.35, 0.65), y: 1 };
    this.record('shot', null, false);
    if (saved) {
      a.stats.onTarget++;
      this.event('save', this.other(side), keeperId, shooterId, xg);
      if (outcome === 'save-parry') {
        this.restart = 'corner';
      } else {
        this.turnover(0);
        this.ball = { x: 0.5, y: 0.05 };
        this.longBall(rng, 0.1);
      }
      return;
    }
    if (outcome === 'block') {
      this.event(
        'block',
        this.other(side),
        this.id(this.other(side), this.nearest(this.other(side), { x: 0.5, y: 0.1 }, false)),
        shooterId,
        xg,
      );
      this.restart = 'corner';
      return;
    }
    this.event(outcome, side, shooterId, null, xg);
    this.turnover(0);
    this.ball = { x: 0.5, y: 0.05 };
    this.restart = 'goal-kick';
  }

  // ─── Key moments (3D) ───────────────────────────────────────────────────────

  /** The moment the player gets to play for this shot, if any (3 to 6 per match). */
  private momentFor(kind: ShotKind, xg: number): MomentKind | null {
    const user = this.options.userSide;
    if (user === null || user === undefined || this.moments.length >= this.options.maxMoments)
      return null;
    // Fewer than three by the last half hour: lower the bar so every match has its moments.
    const late = this.half === 2 && this.t > 60 * 60 && this.moments.length < 3;
    const threshold = late ? 0.1 : 0.2;
    if (this.possession !== user) {
      return kind === 'penalty' || xg >= threshold + 0.05 ? 'keeper' : null;
    }
    if (kind === 'penalty') return 'penalty';
    if (kind === 'free-kick') return 'free-kick';
    if (xg < threshold) return null;
    const last = this.actions[this.actions.length - 1];
    return last && last.success && (last.kind === 'pass' || last.kind === 'cross')
      ? 'pass-shot'
      : 'shot';
  }

  /** The key moment waiting for the player, or null. */
  get pendingMoment(): MomentRequest | null {
    return this.pending;
  }

  /** Outcome of the key moment played in 3D (or auto-resolved); the match goes on. */
  resolveMoment(outcome: ShotOutcome): void {
    const pending = this.pending;
    const context = this.shotContext;
    if (pending === null || context === null) throw new Error('No key moment to resolve');
    this.pending = null;
    this.shotContext = null;
    this.moments.push({ id: pending.id, kind: pending.kind, outcome });
    this.applyShot(outcome, context.xg, this.rng.fork('moment-outcome', pending.id));
    this.clockCheck();
  }

  /** Key moments played so far (the player's inputs to replay the match). */
  get playedMoments(): readonly PlayedMoment[] {
    return this.moments;
  }
}

/** Plays a whole match without player input (tests, quick simulation, server checks). */
export function simulateMatch(setup: MatchSetup): MatchResult {
  return new MatchSim(setup).run();
}

/**
 * Replays a match from the player's inputs: same setup, same options, same key-moment
 * outcomes and coach's changes ⇒ the same match, bit for bit (server-side validation, replays).
 */
export function replayMatch(
  setup: MatchSetup,
  options: MatchOptions,
  inputs: MatchInputs,
): MatchResult {
  const sim = new MatchSim(setup, options);
  let moment = 0;
  let change = 0;
  for (;;) {
    // Changes made at phase n are applied before the phase that follows them (or the break).
    while (
      change < inputs.changes.length &&
      (inputs.changes[change]?.phase ?? Infinity) <= sim.phaseIndex
    ) {
      const c = inputs.changes[change++] as MatchChange;
      if (c.type === 'tactic') sim.setTactic(c.side, c.tactic);
      else sim.substitute(c.side, c.out, c.in);
    }
    if (sim.waiting === 'half-time') {
      sim.resumeSecondHalf();
      continue;
    }
    if (!sim.step()) break;
    if (sim.pendingMoment) {
      const outcome = inputs.moments[moment++];
      if (outcome === undefined) throw new Error('Missing key-moment outcome to replay');
      sim.resolveMoment(outcome);
    }
  }
  return sim.result();
}
