// Display timeline of a match: the engine's actions laid out on a watchable clock. A match
// clock of 90 minutes is not a viewing clock: a pass lasts half a second on screen whatever it
// lasted in the match, dead-ball stops get a beat to read them, goals get a celebration. The
// segments keep the match clock (for the score and the minute) and the game phase (for the HUD).

import { sim } from '@legendes/engine';

type MatchAction = sim.MatchAction;

export type Phase = 'kickoff' | 'buildup' | 'progress' | 'attack' | 'transition' | 'set-piece';

/** What the pause on screen is about (banner), if anything. */
export type Stoppage =
  | 'kickoff'
  | 'throw-in'
  | 'corner'
  | 'goal-kick'
  | 'free-kick'
  | 'penalty'
  | 'foul'
  | 'offside'
  | 'goal'
  | 'half-time'
  | 'full-time'
  | null;

export interface Segment {
  readonly index: number;
  readonly kind: 'action' | 'celebration' | 'half-time' | 'full-time';
  /** Display seconds at ×1. */
  readonly start: number;
  readonly end: number;
  readonly action: MatchAction;
  /** The action before this one (where the ball comes from), if in the same half. */
  readonly previous: MatchAction | null;
  /** The action after this one (who wins a lost ball), if any. */
  next: MatchAction | null;
  readonly phase: Phase;
  readonly stoppage: Stoppage;
}

export interface Cursor {
  readonly segment: Segment;
  /** 0–1 within the segment. */
  readonly progress: number;
}

const RESTARTS = new Set<string>([
  'kickoff',
  'throw-in',
  'corner',
  'goal-kick',
  'free-kick',
  'penalty',
]);

/** Display seconds of an action at ×1. */
export function displayDuration(action: MatchAction): number {
  switch (action.kind) {
    case 'pass':
      return 0.5;
    case 'dribble':
      return 0.6;
    case 'long-pass':
      return 0.85;
    case 'cross':
      return 0.8;
    case 'clearance':
      return 0.7;
    case 'shot':
      return 0.8;
    case 'tackle':
      return action.success ? 0.08 : 0.4;
    case 'interception':
      return action.success ? 0.08 : 0.55;
    case 'foul':
      return 1.1;
    case 'offside':
      return 1.2;
    case 'kickoff':
      return 1.8;
    case 'throw-in':
      return 1.3;
    case 'goal-kick':
      return 1.5;
    case 'corner':
      return 2.1;
    case 'free-kick':
      return 2.1;
    case 'penalty':
      return 2.6;
  }
}

const CELEBRATION = 2.8;
const HALF_TIME = 2.5;
const FULL_TIME = 3;

/** Monotonic key over both halves (the clock restarts at 45:00 after half-time). */
export const clockKey = (half: 1 | 2, t: number): number => (half === 1 ? t : 1e5 + t);

export class Timeline {
  readonly segments: Segment[] = [];
  private actionCount = 0;
  private finished = false;

  constructor(actions: readonly MatchAction[] = [], options: { final?: boolean } = {}) {
    this.push(actions);
    if (options.final) this.finish();
  }

  get duration(): number {
    return this.segments[this.segments.length - 1]?.end ?? 0;
  }

  get length(): number {
    return this.actionCount;
  }

  /** Appends actions as the match goes on (they arrive in order). */
  push(actions: readonly MatchAction[]): void {
    for (const action of actions) {
      const last = this.lastAction();
      if (last && last.half !== action.half) {
        this.add({
          kind: 'half-time',
          action: last,
          previous: null,
          phase: 'set-piece',
          stoppage: 'half-time',
          duration: HALF_TIME,
        });
      }
      const previous = last && last.half === action.half ? last : null;
      this.add({
        kind: 'action',
        action,
        previous,
        phase: this.phaseOf(action, previous),
        stoppage: RESTARTS.has(action.kind)
          ? (action.kind as Stoppage)
          : action.kind === 'foul' || action.kind === 'offside'
            ? action.kind
            : null,
        duration: displayDuration(action),
      });
      this.actionCount++;
      if (action.kind === 'shot' && action.success) {
        this.add({
          kind: 'celebration',
          action,
          previous,
          phase: 'set-piece',
          stoppage: 'goal',
          duration: CELEBRATION,
        });
      }
    }
    this.link();
  }

  /** Closes the match with the final whistle. */
  finish(): void {
    if (this.finished) return;
    const last = this.lastAction();
    if (!last) return;
    this.finished = true;
    this.add({
      kind: 'full-time',
      action: last,
      previous: null,
      phase: 'set-piece',
      stoppage: 'full-time',
      duration: FULL_TIME,
    });
  }

  /** The segment playing at display time `time` (clamped to the ends). */
  locate(time: number): Cursor | null {
    const list = this.segments;
    const first = list[0];
    if (!first) return null;
    const t = Math.max(0, time);
    let lo = 0;
    let hi = list.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((list[mid]?.end ?? 0) <= t) lo = mid + 1;
      else hi = mid;
    }
    const segment = list[lo] as Segment;
    const span = segment.end - segment.start;
    return {
      segment,
      progress: span > 0 ? Math.min(1, Math.max(0, (t - segment.start) / span)) : 1,
    };
  }

  /** Match clock at a cursor (seconds; the second half restarts at 45:00). */
  clock(cursor: Cursor): { half: 1 | 2; t: number } {
    const { segment, progress } = cursor;
    const a = segment.action;
    if (segment.kind !== 'action' || !segment.previous) return { half: a.half, t: a.t };
    return { half: a.half, t: segment.previous.t + (a.t - segment.previous.t) * progress };
  }

  /** Display time at which the action `index` starts (for jumping to an event). */
  startOf(index: number): number {
    return this.segments.find((s) => s.kind === 'action' && s.index === index)?.start ?? 0;
  }

  private lastAction(): MatchAction | null {
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const s = this.segments[i];
      if (s && s.kind === 'action') return s.action;
    }
    return null;
  }

  private add(s: {
    kind: Segment['kind'];
    action: MatchAction;
    previous: MatchAction | null;
    phase: Phase;
    stoppage: Stoppage;
    duration: number;
  }): void {
    const start = this.duration;
    this.segments.push({
      index: this.actionCount,
      kind: s.kind,
      start,
      end: start + s.duration,
      action: s.action,
      previous: s.previous,
      next: null,
      phase: s.phase,
      stoppage: s.stoppage,
    });
  }

  /** Fills `next` (who wins a lost ball, where a stop resumes). */
  private link(): void {
    for (let i = 0; i < this.segments.length - 1; i++) {
      const s = this.segments[i] as Segment;
      const following = this.segments.slice(i + 1).find((n) => n.kind === 'action');
      s.next = following ? following.action : null;
    }
  }

  private phaseOf(action: MatchAction, previous: MatchAction | null): Phase {
    if (action.kind === 'kickoff') return 'kickoff';
    if (RESTARTS.has(action.kind) || action.kind === 'foul' || action.kind === 'offside')
      return 'set-piece';
    // Just won the ball: transition for this action and the next.
    if (
      previous &&
      (previous.kind === 'tackle' || previous.kind === 'interception') &&
      previous.success
    ) {
      return 'transition';
    }
    const y = sim.toTeamFrame(action.ball, action.team === 0, action.half === 2).y;
    return y < 0.34 ? 'buildup' : y > 0.66 ? 'attack' : 'progress';
  }
}
