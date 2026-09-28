// Match playback for the 2D view: where the ball is, who has it and which pass is travelling at
// a given moment of the match, interpolated between the engine's actions. Pure (tested in Node).

import type { sim } from '@legendes/engine';

type MatchAction = sim.MatchAction;
type Point = sim.Point;
type Side = sim.Side;

export interface PlaybackFrame {
  readonly half: 1 | 2;
  readonly t: number;
  /** Ball, absolute frame (home attacks towards y = 1 in the first half). */
  readonly ball: Point;
  readonly possession: Side;
  /** Player on the ball (id), or null while it travels. */
  readonly carrier: string | null;
  /** Pass in flight: from, to (absolute), progress 0–1. */
  readonly pass: { readonly from: Point; readonly to: Point; readonly progress: number } | null;
}

/** Monotonic key over both halves (the clock restarts at 45:00 after half-time). */
const key = (half: 1 | 2, t: number): number => (half === 1 ? t : 1e5 + t);

const PASSES = new Set<string>(['pass', 'long-pass', 'cross', 'clearance', 'goal-kick', 'corner']);

function ease(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

export class MatchPlayback {
  private readonly actions: MatchAction[] = [];
  private readonly keys: number[] = [];

  constructor(actions: readonly MatchAction[] = []) {
    this.push(actions);
  }

  /** Appends actions as the match goes on (they arrive in order). */
  push(actions: readonly MatchAction[]): void {
    for (const a of actions) {
      this.actions.push(a);
      this.keys.push(key(a.half, a.t));
    }
  }

  get length(): number {
    return this.actions.length;
  }

  /** Time of the last known action (the playback cannot go further). */
  get end(): { half: 1 | 2; t: number } | null {
    const last = this.actions[this.actions.length - 1];
    return last ? { half: last.half, t: last.t } : null;
  }

  frame(half: 1 | 2, t: number): PlaybackFrame {
    const k = key(half, t);
    // First action ending at or after k (binary search).
    let lo = 0;
    let hi = this.keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((this.keys[mid] ?? 0) < k) lo = mid + 1;
      else hi = mid;
    }
    const current = this.actions[lo];
    const previous = this.actions[lo - 1];
    if (!current) {
      const last = previous;
      return {
        half,
        t,
        ball: last?.ball ?? { x: 0.5, y: 0.5 },
        possession: last?.team ?? 0,
        carrier: last ? (last.to ?? last.from) : null,
        pass: null,
      };
    }
    const start = previous && previous.half === current.half ? previous : null;
    const from = start?.ball ?? current.ball;
    const t0 = start ? start.t : current.t;
    const progress = current.t > t0 ? (t - t0) / (current.t - t0) : 1;
    const e = ease(progress);
    const ball = {
      x: from.x + (current.ball.x - from.x) * e,
      y: from.y + (current.ball.y - from.y) * e,
    };
    const passing = PASSES.has(current.kind) && progress > 0.25 && progress < 1;
    return {
      half,
      t,
      ball,
      possession: current.team,
      carrier: passing ? null : progress >= 1 ? (current.to ?? current.from) : current.from,
      pass: passing ? { from, to: current.ball, progress } : null,
    };
  }
}
