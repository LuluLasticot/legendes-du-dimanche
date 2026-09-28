// Choreography of the 2D view: from the timeline cursor to 22 tokens and a ball that move like a
// team. Not a plot of the engine's numbers: tokens run to targets (role-based shapes and set
// pieces from the engine, plus the players involved in the action), with limited speed and
// acceleration, so that they jog into position, sprint to receive and turn as they run. The ball
// is dribbled at the carrier's feet, flies from foot to foot on passes (with a little height on
// long balls, crosses and shots) and rests at the spot on dead balls.
//
// Pure (no Pixi): tested in Node. Absolute frame: x across (0 → 1), y along (home attacks
// towards y = 1 in the first half).

import { sim } from '@legendes/engine';
import type { Cursor, Phase, Segment, Stoppage } from './timeline.ts';

type Point = sim.Point;
type Side = sim.Side;

export interface TeamLook {
  readonly formation: sim.Formation;
  readonly tactic: sim.Tactic;
  readonly colours: { readonly shirt: string; readonly shorts: string; readonly number: string };
  /** Player ids on the pitch, by formation slot (update after substitutions). */
  readonly ids: readonly string[];
  readonly numbers: readonly number[];
  /** Slots of sent-off players (their token leaves the pitch). */
  readonly sentOff?: readonly boolean[];
}

export interface TokenFrame {
  readonly side: Side;
  readonly slot: number;
  readonly id: string;
  readonly number: number;
  readonly x: number;
  readonly y: number;
  /** Direction faced, radians: 0 = towards y = 1, clockwise seen from above with x to the right. */
  readonly face: number;
  readonly hasBall: boolean;
  readonly off: boolean;
}

export interface ChoreoFrame {
  readonly tokens: readonly TokenFrame[];
  readonly ball: { readonly x: number; readonly y: number; readonly height: number };
  readonly possession: Side;
  readonly carrier: string | null;
  /** Pass in flight (not shots): where it started, where it is going, how far along. */
  readonly pass: { readonly from: Point; readonly to: Point; readonly progress: number } | null;
  readonly phase: Phase;
  readonly stoppage: Stoppage;
  /** Progress of the pause (0–1) for banners. */
  readonly stoppageProgress: number;
  readonly clock: { readonly half: 1 | 2; readonly t: number };
}

const W = 68;
const L = 105;
/** Top running speed and acceleration, in metres per display second (the view is a fast-forward). */
const V_MAX = 15;
const ACCEL = 42;
const BOOST = 1.55;
const STEP = 1 / 40;

const RELEASE: Readonly<Record<string, number>> = {
  pass: 0.3,
  'long-pass': 0.32,
  cross: 0.3,
  shot: 0.32,
};
const HEIGHT: Readonly<Record<string, number>> = {
  'long-pass': 1,
  cross: 0.85,
  clearance: 1,
  shot: 0.35,
};
const DEAD = new Set<string>([
  'kickoff',
  'throw-in',
  'corner',
  'goal-kick',
  'free-kick',
  'penalty',
]);

const easeOut = (q: number, power = 1.7): number => 1 - (1 - Math.min(1, Math.max(0, q))) ** power;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

interface Token {
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: number;
  /** Individual rhythm for the idle wander. */
  phase: number;
  boost: boolean;
}

interface Ref {
  readonly side: Side;
  readonly slot: number;
}

export class Choreographer {
  private looks: readonly [TeamLook, TeamLook];
  private readonly tokens: [Token[], Token[]];
  private ball = { x: 0.5, y: 0.5, height: 0 };
  private owner: Ref | null = null;
  private segment: Segment | null = null;
  private segBallStart: Point = { x: 0.5, y: 0.5 };
  private flightFrom: Point | null = null;
  private time = 0;
  private started = false;

  constructor(looks: readonly [TeamLook, TeamLook]) {
    this.looks = looks;
    this.tokens = [this.makeTokens(0), this.makeTokens(1)];
  }

  setLooks(looks: readonly [TeamLook, TeamLook]): void {
    this.looks = looks;
    for (const side of [0, 1] as const) {
      while (this.tokens[side].length < looks[side].ids.length)
        this.tokens[side].push(this.newToken(side, this.tokens[side].length));
    }
  }

  private makeTokens(side: Side): Token[] {
    return this.looks[side].ids.map((_, i) => this.newToken(side, i));
  }

  private newToken(side: Side, slot: number): Token {
    return {
      x: 0.5,
      y: side === 0 ? 0.3 : 0.7,
      vx: 0,
      vy: 0,
      face: 0,
      phase: slot * 2.1 + side * 1.3,
      boost: false,
    };
  }

  private find(id: string | null): Ref | null {
    if (!id) return null;
    for (const side of [0, 1] as const) {
      const slot = this.looks[side].ids.indexOf(id);
      if (slot >= 0) return { side, slot };
    }
    return null;
  }

  /** Advances the choreography by `dt` display seconds at `cursor`. */
  update(dtIn: number, cursor: Cursor, clock: { half: 1 | 2; t: number }): ChoreoFrame {
    // Frame timestamps can arrive slightly out of order: time never runs backwards.
    const dt = Number.isFinite(dtIn) ? Math.max(0, dtIn) : 0;
    const seg = cursor.segment;
    const p = cursor.progress;
    if (seg !== this.segment) this.enter(seg);
    const targets = this.targets(seg, p);
    const involved = this.involved(seg, p, targets);
    if (!this.started) this.snap(targets);
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.time += h;
      this.move(h, targets, involved);
    }
    this.separate();
    this.placeBall(seg, p);
    return this.frame(seg, p, clock);
  }

  // ─── Segment changes ────────────────────────────────────────────────────────

  private enter(seg: Segment): void {
    this.segment = seg;
    this.segBallStart = { x: this.ball.x, y: this.ball.y };
    this.flightFrom = null;
    const a = seg.action;
    const carrier = this.find(a.from);
    // Who has the ball at the start: the actor, except on dead balls (nobody until the kick).
    this.owner = DEAD.has(a.kind) || seg.kind !== 'action' ? null : carrier;
  }

  // ─── Targets ────────────────────────────────────────────────────────────────

  /** Absolute target of every token: role shapes, set pieces, celebrations. */
  private targets(seg: Segment, p: number): [Point[], Point[]] {
    const a = seg.action;
    const second = a.half === 2;
    const attack = a.team;
    const spot = a.ball;
    const dead = seg.kind === 'action' && DEAD.has(a.kind);
    const out: [Point[], Point[]] = [[], []];
    for (const side of [0, 1] as const) {
      const look = this.looks[side];
      const home = side === 0;
      const ref = dead || seg.kind === 'celebration' ? spot : this.ball;
      const ballFrame = sim.toTeamFrame(ref, home, second);
      let shape: Point[];
      if (seg.kind === 'celebration') {
        // The scoring side celebrates, then everyone walks back to the kick-off shape (the side
        // that conceded takes the kick-off).
        const centre = { x: 0.5, y: 0.5 };
        const kick = sim.setPieceShape(
          'kickoff',
          side !== attack,
          look.formation,
          look.tactic,
          centre,
        );
        if (side === attack) {
          const play = sim.teamShape(look.formation, look.tactic, ballFrame, true);
          const back = clamp01((p - 0.5) / 0.4);
          shape = play.map((pt, i) => ({
            x: lerp(pt.x, kick[i]?.x ?? pt.x, back),
            y: lerp(pt.y, kick[i]?.y ?? pt.y, back),
          }));
        } else {
          shape = kick;
        }
      } else if (seg.kind === 'half-time' || seg.kind === 'full-time') {
        shape = sim.setPieceShape('kickoff', side === attack, look.formation, look.tactic, {
          x: 0.5,
          y: 0.5,
        });
      } else if (dead) {
        shape = sim.setPieceShape(
          a.kind as sim.SetPieceKind,
          side === attack,
          look.formation,
          look.tactic,
          ballFrame,
        );
      } else {
        shape = sim.teamShape(look.formation, look.tactic, ballFrame, side === attack, {
          transition: seg.phase === 'transition',
        });
      }
      out[side] = shape.map((pt, slot) => {
        const abs = sim.toAbsolute(pt, home, second);
        // A little life: nobody stands perfectly still.
        const tk = this.tokens[side][slot];
        const w = tk ? tk.phase : 0;
        return {
          x: abs.x + Math.sin(this.time * 0.8 + w) * 0.006,
          y: abs.y + Math.cos(this.time * 0.65 + w * 1.7) * 0.005,
        };
      });
    }
    void p;
    return out;
  }

  /** Overrides for the players the action is about; returns which ones sprint (boost). */
  private involved(seg: Segment, p: number, targets: [Point[], Point[]]): Set<string> {
    const boosted = new Set<string>();
    const set = (ref: Ref | null, target: Point, boost = true): void => {
      if (!ref) return;
      const list = targets[ref.side];
      if (!list[ref.slot]) return;
      list[ref.slot] = target;
      if (boost) boosted.add(`${ref.side}:${ref.slot}`);
    };
    const a = seg.action;
    const carrier = this.find(a.from);
    const receiver = this.find(a.to);
    const winnerAction =
      seg.next &&
      (seg.next.kind === 'tackle' || seg.next.kind === 'interception') &&
      seg.next.success
        ? seg.next
        : null;
    const winner = winnerAction ? this.find(winnerAction.from) : null;
    const spot = a.ball;

    if (seg.kind === 'celebration') {
      const goalY = spot.y > 0.5 ? 0.965 : 0.035;
      const corner = { x: spot.x < 0.5 ? 0.06 : 0.94, y: goalY };
      if (p < 0.6) set(carrier, corner);
      const scorerSide = a.team;
      const mates = targets[scorerSide];
      // Gather round the scorer, then break up to walk back.
      const gather = clamp01(p * 1.8) * (1 - clamp01((p - 0.5) / 0.3));
      mates.forEach((t, slot) => {
        if (carrier && slot === carrier.slot) return;
        const angle = slot * 0.9;
        const around = {
          x: corner.x + Math.sin(angle) * 0.045 * (1 + (slot % 3)),
          y: corner.y - Math.sign(goalY - 0.5) * (0.05 + (slot % 4) * 0.03),
        };
        mates[slot] = {
          x: lerp(t.x, around.x, gather * (slot === 0 ? 0 : 0.85)),
          y: lerp(t.y, around.y, gather * (slot === 0 ? 0 : 0.85)),
        };
      });
      return boosted;
    }
    if (seg.kind !== 'action') return boosted;

    switch (a.kind) {
      case 'pass':
      case 'long-pass':
      case 'cross':
        if (a.success) set(receiver, spot);
        else if (winner) set(winner, spot);
        break;
      case 'shot': {
        // The keeper follows the shot.
        const keeperSide: Side = a.team === 0 ? 1 : 0;
        const goalY = spot.y > 0.5 ? 0.985 : 0.015;
        set({ side: keeperSide, slot: 0 }, { x: Math.min(0.64, Math.max(0.36, spot.x)), y: goalY });
        break;
      }
      case 'dribble':
        set(carrier, spot);
        break;
      case 'tackle':
        if (!a.success && winner) set(winner, spot);
        break;
      case 'interception':
        if (!a.success && winner) set(winner, spot);
        break;
      case 'foul': {
        set(carrier, spot);
        set(receiver, { x: spot.x + 0.012, y: spot.y + (spot.y > 0.5 ? -0.012 : 0.012) });
        break;
      }
      case 'offside':
        set(receiver, spot, false);
        break;
      case 'kickoff': {
        set(carrier, spot);
        break;
      }
      case 'throw-in':
      case 'corner':
      case 'goal-kick':
      case 'free-kick':
      case 'penalty': {
        // The taker walks to the ball, from a few steps behind it.
        const behind = { x: spot.x + (spot.x < 0.5 ? -0.006 : 0.006), y: spot.y };
        set(carrier, p > 0.8 ? spot : behind);
        break;
      }
    }
    return boosted;
  }

  // ─── Movement ───────────────────────────────────────────────────────────────

  private snap(targets: [Point[], Point[]]): void {
    for (const side of [0, 1] as const) {
      targets[side].forEach((t, slot) => {
        const tk = this.tokens[side][slot];
        if (tk) {
          tk.x = t.x;
          tk.y = t.y;
        }
      });
    }
    this.started = true;
  }

  private move(dt: number, targets: [Point[], Point[]], boosted: Set<string>): void {
    const seg = this.segment;
    const second = seg ? seg.action.half === 2 : false;
    // On a stop everyone jogs into position quickly: the stop is short on screen.
    const rush = seg && (seg.kind !== 'action' || DEAD.has(seg.action.kind)) ? 1.8 : 1;
    for (const side of [0, 1] as const) {
      const look = this.looks[side];
      const attackUp = (side === 0) !== second;
      const possession = seg ? seg.action.team === side : false;
      this.tokens[side].forEach((tk, slot) => {
        const target = targets[side][slot];
        if (!target || look.sentOff?.[slot]) return;
        const boost = boosted.has(`${side}:${slot}`);
        const vmax = V_MAX * (boost ? BOOST : 1) * rush;
        const dx = (target.x - tk.x) * W;
        const dy = (target.y - tk.y) * L;
        const dist = Math.hypot(dx, dy);
        const speed = Math.min(vmax, dist * 4);
        const wantX = dist > 0.01 ? (dx / dist) * speed : 0;
        const wantY = dist > 0.01 ? (dy / dist) * speed : 0;
        const ax = wantX - tk.vx;
        const ay = wantY - tk.vy;
        const dv = Math.hypot(ax, ay);
        const maxDv = ACCEL * (boost ? 1.3 : 1) * rush * dt;
        const k = dv > maxDv && dv > 1e-9 ? maxDv / dv : 1;
        tk.vx += ax * k;
        tk.vy += ay * k;
        tk.x += (tk.vx * dt) / W;
        tk.y += (tk.vy * dt) / L;
        const v = Math.hypot(tk.vx, tk.vy);
        let want: number;
        if (v > 1.6) want = Math.atan2(tk.vx, tk.vy);
        else if (possession) want = attackUp ? 0 : Math.PI;
        else want = Math.atan2((this.ball.x - tk.x) * W, (this.ball.y - tk.y) * L);
        let d = want - tk.face;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        tk.face += d * (1 - Math.exp(-9 * dt));
      });
    }
  }

  /** Nobody stands inside another player: a light push apart, in metres. */
  private separate(): void {
    const all: { tk: Token; off: boolean }[] = [];
    for (const side of [0, 1] as const)
      this.tokens[side].forEach((tk, slot) =>
        all.push({ tk, off: !!this.looks[side].sentOff?.[slot] }),
      );
    const min = 1.5;
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      if (!a || a.off) continue;
      for (let j = i + 1; j < all.length; j++) {
        const b = all[j];
        if (!b || b.off) continue;
        const dx = (b.tk.x - a.tk.x) * W;
        const dy = (b.tk.y - a.tk.y) * L;
        const d = Math.hypot(dx, dy);
        if (d >= min || d < 1e-6) continue;
        const push = ((min - d) / 2) * 0.5;
        const ux = dx / d;
        const uy = dy / d;
        a.tk.x -= (ux * push) / W;
        a.tk.y -= (uy * push) / L;
        b.tk.x += (ux * push) / W;
        b.tk.y += (uy * push) / L;
      }
    }
  }

  // ─── Ball ───────────────────────────────────────────────────────────────────

  private placeBall(seg: Segment, p: number): void {
    const a = seg.action;
    const ball = this.ball;
    const start = this.segBallStart;
    const dead = seg.kind === 'action' && DEAD.has(a.kind);

    if (seg.kind === 'celebration') {
      // In the net, then carried back to the centre circle.
      const goalY = a.ball.y > 0.5 ? 1.012 : -0.012;
      const rest = { x: a.ball.x, y: goalY };
      const q = clamp01((p - 0.6) / 0.4);
      ball.x = lerp(rest.x, 0.5, easeOut(q, 1.4));
      ball.y = lerp(rest.y, 0.5, easeOut(q, 1.4));
      ball.height = 0;
      this.owner = null;
      return;
    }
    if (seg.kind !== 'action') {
      ball.height = 0;
      return;
    }
    if (dead) {
      // Rolls (or is carried) to the spot, waits there; the taker steps in at the end.
      const q = easeOut(clamp01(p / 0.3), 1.8);
      ball.x = lerp(start.x, a.ball.x, q);
      ball.y = lerp(start.y, a.ball.y, q);
      ball.height = 0;
      this.owner = p > 0.92 ? this.find(a.from) : null;
      return;
    }
    if (a.kind === 'foul' || a.kind === 'offside') {
      ball.x = a.ball.x;
      ball.y = a.ball.y;
      ball.height = 0;
      this.owner = null;
      return;
    }
    const release = RELEASE[a.kind];
    const flying = release !== undefined && p >= release;
    if (flying) {
      // From the boot of the carrier at the release to the foot of whoever gets it.
      if (!this.flightFrom)
        this.flightFrom = this.carryPoint(this.find(a.from)) ?? { x: start.x, y: start.y };
      const to = this.flightTarget(seg);
      const q = (p - release) / (1 - release);
      const e = easeOut(q);
      ball.x = lerp(this.flightFrom.x, to.x, e);
      ball.y = lerp(this.flightFrom.y, to.y, e);
      ball.height = (HEIGHT[a.kind] ?? 0) * 4 * q * (1 - q);
      this.owner = null;
      return;
    }
    // Carried at the feet of the player on the ball (the winner takes it over on a tackle).
    let holder = this.owner;
    if (a.kind === 'tackle' && !a.success && seg.next && p > 0.7)
      holder = this.find(seg.next.from) ?? holder;
    const at = this.carryPoint(holder);
    if (at) {
      ball.x = at.x;
      ball.y = at.y;
    } else {
      const q = easeOut(p);
      ball.x = lerp(start.x, a.ball.x, q);
      ball.y = lerp(start.y, a.ball.y, q);
    }
    ball.height = 0;
    this.owner = holder;
  }

  /** Where a token's ball sits: in front of the feet, slipping side to side as he dribbles. */
  private carryPoint(ref: Ref | null): Point | null {
    if (!ref) return null;
    const tk = this.tokens[ref.side][ref.slot];
    if (!tk) return null;
    const speed = Math.hypot(tk.vx, tk.vy);
    const reach = 0.9 + Math.min(0.6, speed * 0.05);
    const wiggle = Math.sin(this.time * 13 + tk.phase) * Math.min(0.5, 0.15 + speed * 0.04);
    const fx = Math.sin(tk.face);
    const fy = Math.cos(tk.face);
    return {
      x: tk.x + (fx * reach + fy * wiggle) / W,
      y: tk.y + (fy * reach - fx * wiggle) / L,
    };
  }

  /** Where the ball in flight is heading: the receiver's feet, the interception, the goal. */
  private flightTarget(seg: Segment): Point {
    const a = seg.action;
    if (a.kind === 'shot') {
      const beyond = a.ball.y > 0.5 ? 0.012 : -0.012;
      return { x: a.ball.x, y: a.success ? a.ball.y + beyond : a.ball.y };
    }
    const receiver = this.find(a.to);
    if (a.success && receiver) {
      const tk = this.tokens[receiver.side][receiver.slot];
      if (tk) return { x: tk.x + (tk.vx * 0.12) / W, y: tk.y + (tk.vy * 0.12) / L };
    }
    return a.ball;
  }

  // ─── Output ─────────────────────────────────────────────────────────────────

  private frame(seg: Segment, p: number, clock: { half: 1 | 2; t: number }): ChoreoFrame {
    const tokens: TokenFrame[] = [];
    for (const side of [0, 1] as const) {
      const look = this.looks[side];
      this.tokens[side].forEach((tk, slot) => {
        tokens.push({
          side,
          slot,
          id: look.ids[slot] ?? '',
          number: look.numbers[slot] ?? 0,
          x: tk.x,
          y: tk.y,
          face: tk.face,
          hasBall: this.owner?.side === side && this.owner.slot === slot,
          off: !!look.sentOff?.[slot],
        });
      });
    }
    const a = seg.action;
    const flying =
      this.flightFrom !== null && this.owner === null && !DEAD.has(a.kind) && a.kind !== 'shot';
    const carrier = this.owner ? (this.looks[this.owner.side].ids[this.owner.slot] ?? null) : null;
    return {
      tokens,
      ball: { x: this.ball.x, y: this.ball.y, height: this.ball.height },
      possession: a.team,
      carrier,
      pass:
        flying && this.flightFrom
          ? {
              from: this.flightFrom,
              to: this.flightTarget(seg),
              progress: clamp01((p - (RELEASE[a.kind] ?? 0)) / (1 - (RELEASE[a.kind] ?? 0))),
            }
          : null,
      phase: seg.phase,
      stoppage: seg.stoppage,
      stoppageProgress: p,
      clock,
    };
  }
}
