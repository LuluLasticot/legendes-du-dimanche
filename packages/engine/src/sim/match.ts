// Match simulation by phases (ARCHITECTURE §4.2). A phase: the carrier's decision (utility AI),
// duels against the nearest defenders, the ball moves on or changes hands, until a shot, a stop
// or a turnover. Deterministic: the same setup gives the same actions, events and score.
//
// Everything is computed in the attacking team's frame (see shape.ts) and stored in absolute
// coordinates for the renderer.

import { clamp, exp, hypot } from '../math/index.ts';
import { Rng } from '../rng/index.ts';
import { FORMATION_SLOTS } from './formations.ts';
import type { MatchPlayer, MatchSetup, MatchTeam, PlayerAttributes } from './model.ts';
import { POSITION_LINE, type Position } from './positions.ts';
import { teamShape, toAbsolute, toTeamFrame, type Point } from './shape.ts';
import {
  collectifs,
  effectiveAttributes,
  lineupPlayers,
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
  | 'penalty';

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
  | 'full-time';

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

type Restart = 'kickoff' | 'throw-in' | 'corner' | 'goal-kick' | 'free-kick' | 'penalty' | null;

interface SideState {
  readonly team: MatchTeam;
  readonly players: readonly MatchPlayer[];
  readonly slots: readonly Position[];
  readonly attributes: readonly PlayerAttributes[];
  readonly keeperRating: number;
  readonly stats: TeamStats;
}

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

  constructor(setup: MatchSetup) {
    this.setup = setup;
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

  /** Plays one phase; false once the final whistle has gone. */
  step(): boolean {
    if (this.finished) return false;
    const rng = this.rng.fork('phase', this.phase++);
    if (this.restart !== null) this.playRestart(rng);
    // Open play: a few actions until a shot, a stop or a turnover.
    for (let i = 0; i < 6 && this.restart === null && !this.clockCheck(); i++) {
      if (!this.playAction(rng)) break;
    }
    this.clockCheck();
    return !this.finished;
  }

  run(): MatchResult {
    while (this.step()) {
      // phases
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
    const attributes = players.map((p, i) =>
      effectiveAttributes(p, slots[i] ?? 'CM', points[i] ?? 0),
    );
    const keeper = players[0];
    return {
      team,
      players,
      slots,
      attributes,
      keeperRating: keeper ? playerRating(keeper, 'GK') : 40,
      stats: {
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
  ): void {
    this.actions.push({
      t: this.t,
      half: this.half,
      team: side,
      kind,
      from: this.id(side, this.carrier),
      to: to === null ? null : this.id(side, to),
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
    const shape = teamShape(s.team.formation, s.team.tactic, p, inPossession);
    let best = outfield ? 1 : 0;
    let bestD = Infinity;
    for (let i = outfield ? 1 : 0; i < shape.length; i++) {
      if (i === except) continue;
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
        this.carrier = this.taker(a, a.team.tactic.takers.corner, 'passing');
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
          this.carrier = this.taker(a, a.team.tactic.takers.freeKick, 'shooting');
          this.record('free-kick', null, true);
          this.shoot(rng, 'free-kick');
        } else {
          this.record('free-kick', null, true);
        }
        return;
      }
      case 'penalty': {
        this.carrier = this.taker(a, a.team.tactic.takers.penalty, 'shooting');
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
    for (let i = 1; i < s.attributes.length; i++) {
      if ((s.attributes[i]?.[key] ?? 0) > (s.attributes[best]?.[key] ?? 0)) best = i;
    }
    return best;
  }

  // ─── Open play ──────────────────────────────────────────────────────────────

  /** One decision of the carrier; false when the phase ends (turnover, shot, stop). */
  private playAction(rng: Rng): boolean {
    const a = this.attack();
    const tactic = a.team.tactic;
    const surface = this.setup.conditions.surface;
    const y = this.ball.y;
    const wide = this.ball.x < 0.22 || this.ball.x > 0.78;
    const attr = a.attributes[this.carrier] as PlayerAttributes;
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
    const at = d.attributes[slot] as PlayerAttributes;
    const pressing = (d.team.tactic.pressing - 3) * 2;
    return {
      slot,
      value: at[key] * 0.75 + at.pace * 0.25 + pressing + this.home(this.other(this.possession)),
    };
  }

  private duel(rng: Rng, kind: 'pass' | 'dribble' | ActionKind): boolean {
    const a = this.attack();
    const attr = a.attributes[this.carrier] as PlayerAttributes;
    const isPass = kind === 'pass';
    const skill =
      (isPass ? attr.passing : attr.dribbling * 0.75 + attr.pace * 0.25) +
      this.home(this.possession);
    const defender = this.contest('defending');
    // Harder the closer to the opposing goal (the block is tighter there).
    const base = (isPass ? 1.9 : 0.35) - this.ball.y * 0.9;
    const success = rng.chance(logistic(base + (skill - defender.value) * SKILL));
    this.tick(isPass ? rng.range(3, 7) : rng.range(3, 6));
    if (isPass) a.stats.passes++;

    if (success) {
      if (isPass) a.stats.passesCompleted++;
      const target: Point = {
        x: clamp(this.ball.x + rng.normal(0, 0.18), 0.04, 0.96),
        y: clamp(
          this.ball.y + (isPass ? rng.range(-0.04, 0.14) : rng.range(0.05, 0.12)),
          0.04,
          0.95,
        ),
      };
      const receiver = isPass
        ? this.nearest(this.possession, target, true, this.carrier)
        : this.carrier;
      this.ball = target;
      this.record(isPass ? 'pass' : 'dribble', isPass ? receiver : null, true);
      this.carrier = receiver;
      return true;
    }
    return this.lose(rng, isPass ? 'interception' : 'tackle', defender.slot);
  }

  /** Ball lost to `winner`: maybe a foul (free kick / penalty) instead. */
  private lose(rng: Rng, kind: 'interception' | 'tackle', winner: number): boolean {
    const d = this.defence();
    const foulChance = (kind === 'tackle' ? 0.2 : 0.06) + (d.team.tactic.pressing - 3) * 0.02;
    if (rng.chance(foulChance)) {
      d.stats.fouls++;
      const fouled = this.id(this.possession, this.carrier);
      this.event(
        'foul',
        this.other(this.possession),
        this.id(this.other(this.possession), winner),
        fouled,
      );
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

  /** Long ball forward (or a clearance, `from` y): won in the air or lost. */
  private longBall(rng: Rng, minY = 0): boolean {
    const a = this.attack();
    const attr = a.attributes[this.carrier] as PlayerAttributes;
    a.stats.passes++;
    const target: Point = {
      x: clamp(this.ball.x + rng.normal(0, 0.25), 0.05, 0.95),
      y: clamp(Math.max(minY, this.ball.y) + rng.range(0.2, 0.38), 0.1, 0.9),
    };
    this.tick(rng.range(4, 8));
    const receiver = this.nearest(this.possession, target, true, this.carrier);
    const aerial = (a.attributes[receiver] as PlayerAttributes).physical;
    const defender = this.contest('pace');
    const p = logistic(-0.2 + (attr.passing * 0.5 + aerial * 0.5 - defender.value) * SKILL);
    this.ball = target;
    if (rng.chance(p)) {
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
    const a = this.attack();
    const attr = a.attributes[this.carrier] as PlayerAttributes;
    this.tick(rng.range(3, 6));
    const target: Point = {
      x: clamp(0.5 + rng.normal(0, 0.1), 0.3, 0.7),
      y: rng.range(0.86, 0.95),
    };
    const receiver = this.nearest(this.possession, target, true, this.carrier);
    const aerial = a.attributes[receiver] as PlayerAttributes;
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

  private shoot(rng: Rng, kind: 'open' | 'header' | 'free-kick' | 'penalty'): void {
    const a = this.attack();
    const d = this.defence();
    const side = this.possession;
    const shooter = a.attributes[this.carrier] as PlayerAttributes;
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
    const keeperId = this.id(this.other(side), 0);
    if (xg >= 0.2 || kind === 'penalty') this.event('chance', side, shooterId, null, xg);

    if (rng.chance(xg)) {
      a.stats.goals++;
      a.stats.onTarget++;
      this.score[side]++;
      this.ball = { x: 0.5, y: 1 };
      this.record('shot', null, true);
      this.event('goal', side, shooterId, null, xg);
      this.possession = this.other(side);
      this.restart = 'kickoff';
      return;
    }
    const onTarget = rng.chance(clamp(0.28 + quality / 300, 0.3, 0.65));
    this.ball = { x: clamp(0.5 + rng.normal(0, onTarget ? 0.03 : 0.08), 0.35, 0.65), y: 1 };
    this.record('shot', null, false);
    if (onTarget) {
      a.stats.onTarget++;
      this.event('save', this.other(side), keeperId, shooterId, xg);
      if (rng.chance(0.25)) {
        this.restart = 'corner';
      } else {
        this.turnover(0);
        this.ball = { x: 0.5, y: 0.05 };
        this.longBall(rng, 0.1);
      }
      return;
    }
    if (rng.chance(0.2)) {
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
    this.event(rng.chance(0.06) ? 'post' : 'miss', side, shooterId, null, xg);
    this.turnover(0);
    this.ball = { x: 0.5, y: 0.05 };
    this.restart = 'goal-kick';
  }
}

/** Plays a whole match without player input (tests, quick simulation, server checks). */
export function simulateMatch(setup: MatchSetup): MatchResult {
  return new MatchSim(setup).run();
}
