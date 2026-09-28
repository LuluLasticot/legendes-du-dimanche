// Team shape: where the eleven stand for a given ball position, phase and tactic. Pure, so the
// simulation (receivers, nearest defender) and the 2D renderer (target positions) share it —
// nothing to store per phase.
//
// Not a rigid formation: roles move. Full-backs push on and overlap when the ball is on their
// flank, centre-backs split to build up, a striker drops to link, midfielders arrive late in the
// box, wingers hold the touchline then cut inside on the far side; without the ball the block
// compresses towards the ball and strikers screen.
//
// Team frame: x = 0 left touchline → 1 right one, y = 0 own goal line → 1 opposing one.

import { clamp, hypot } from '../math/index.ts';
import { FORMATION_SLOTS, type Formation } from './formations.ts';
import type { Tactic } from './model.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface ShapeOptions {
  /** The ball has just changed hands: the winners spread, the losers close it down. */
  readonly transition?: boolean;
}

const FULL_BACKS = new Set(['LB', 'RB', 'LWB', 'RWB']);
const WIDE = new Set(['LW', 'RW', 'LM', 'RM']);

export function teamShape(
  formation: Formation,
  tactic: Tactic,
  ball: Point,
  inPossession: boolean,
  options: ShapeOptions = {},
): Point[] {
  const slots = FORMATION_SLOTS[formation];
  const advance = clamp((ball.y - 0.35) / 0.45, 0, 1); // 0 in build-up … 1 in the final third
  const buildup = 1 - clamp(ball.y / 0.4, 0, 1);
  const width = 0.8 + (tactic.width - 3) * 0.08;
  const line = (tactic.lineHeight - 3) * 0.035 + tactic.mentality * 0.02;
  const push = inPossession
    ? clamp(ball.y - 0.4, -0.12, 0.4) * 0.85 + line
    : clamp(ball.y - 0.5, -0.3, 0.3) * 0.55 + line - 0.04;
  const ballLeft = ball.x - 0.5;

  // The striker nearest the ball's side drops to link the play; the other stays on the line.
  let dropper = -1;
  let best = Infinity;
  slots.forEach((s, i) => {
    if (s.position !== 'ST' && s.position !== 'CF') return;
    const d = Math.abs(s.x - ball.x);
    if (d < best) {
      best = d;
      dropper = i;
    }
  });
  // Of two central midfielders, the right-hand one is the late runner.
  const runners = slots.map((s, i) => (s.position === 'CM' ? i : -1)).filter((i) => i >= 0);
  const runner = runners.length > 1 ? (runners[runners.length - 1] ?? -1) : -1;

  return slots.map((slot, i): Point => {
    if (i === 0) {
      // Goalkeeper: on his line, sweeping a little when his team is up the pitch.
      return {
        x: clamp(0.5 + ballLeft * 0.15, 0.4, 0.6),
        y: clamp(0.02 + push * 0.06, 0.01, 0.06),
      };
    }
    const side = slot.x - 0.5;
    const dir = side < 0 ? -1 : side > 0 ? 1 : 0;
    const sameSide = dir !== 0 && ballLeft * dir > 0.08;
    const p = slot.position;
    let x = 0.5 + side * width * (inPossession ? 1.12 : 0.88);
    let y = slot.y * (inPossession ? 1 : 0.8) + push;

    if (inPossession) {
      if (FULL_BACKS.has(p)) {
        // Overlap: on the ball's flank they run beyond the winger; on the far side they tuck in.
        const lead = sameSide ? 1 : 0.35;
        x = 0.5 + dir * (sameSide ? 0.43 : 0.3);
        y = slot.y + (0.05 + 0.3 * advance) * lead + line;
      } else if (p === 'CB') {
        // Split to build up, then squeeze as the team moves up.
        x = 0.5 + side * (1.1 + 0.4 * buildup);
        y = slot.y + 0.3 * advance * 0.6 + line * 0.6 - 0.02 * buildup;
      } else if (p === 'CDM') {
        // Drops between the centre-backs to receive, then shields.
        y = 0.16 + 0.3 * (1 - buildup) + 0.1 * advance + line * 0.5;
        x = 0.5 + side * 0.6 + ballLeft * 0.3;
      } else if (p === 'CM') {
        const late = i === runner;
        y = late
          ? clamp(ball.y + 0.12 * advance + 0.02, slot.y, 0.84)
          : clamp(ball.y - 0.1, 0.22, 0.7);
        x = 0.5 + side * 0.8 + ballLeft * (late ? -0.2 : 0.3);
      } else if (p === 'CAM') {
        // Finds the space between the lines, away from the ball's side.
        y = clamp(ball.y + 0.08, 0.4, 0.78);
        x = 0.5 - ballLeft * 0.5 + side * 0.4;
      } else if (WIDE.has(p)) {
        // Hold the touchline; when the play is on the other flank come inside and up.
        const near = sameSide || Math.abs(ballLeft) < 0.15;
        x = near ? 0.5 + dir * 0.43 : 0.5 + dir * (0.3 - 0.1 * advance);
        y = clamp(ball.y + (near ? 0.1 : 0.05), slot.y - 0.05, 0.9);
      } else if (p === 'ST' || p === 'CF') {
        if (i === dropper) {
          // Drop off the last defender to link when the ball is deep; run in behind when high.
          y = clamp(ball.y + 0.16 - 0.1 * advance, 0.36, 0.9);
          x = 0.5 + side * 0.5 + ballLeft * 0.45;
        } else {
          y = clamp(0.8 + 0.1 * advance + line, 0.7, 0.93);
          x = 0.5 + side * 0.9 - ballLeft * 0.3;
        }
      }
    } else {
      // Out of possession: compact towards the ball, full-backs tucked, forwards screening.
      const pull = options.transition ? 0.6 : 0.42;
      if (FULL_BACKS.has(p)) {
        x = 0.5 + dir * 0.31;
        y = slot.y * 0.85 + push;
      } else if (WIDE.has(p)) {
        y = Math.min(slot.y, 0.5) * 0.92 + push;
        x = 0.5 + dir * 0.34;
      } else if (p === 'ST' || p === 'CF') {
        y = clamp(ball.y + 0.12, 0.38, 0.62) + (i === dropper ? 0 : 0.06);
        x = 0.5 + side * 0.5 + ballLeft * 0.3;
      }
      x += (ball.x - x) * pull;
    }
    if (inPossession) x += (ball.x - x) * 0.12;
    return { x: clamp(x, 0.04, 0.96), y: clamp(y, 0.03, 0.97) };
  });
}

export type SetPieceKind =
  'kickoff' | 'throw-in' | 'corner' | 'goal-kick' | 'free-kick' | 'penalty';

const M_X = 68;
const M_Y = 105;

/** Pushes `p` out of the circle of radius `r` metres around `centre` (both normalised). */
function outOfCircle(p: Point, centre: Point, r: number): Point {
  const dx = (p.x - centre.x) * M_X;
  const dy = (p.y - centre.y) * M_Y;
  const d = hypot(dx, dy);
  if (d >= r || d === 0) return p;
  const k = r / d;
  return { x: centre.x + (dx * k) / M_X, y: centre.y + (dy * k) / M_Y };
}

/**
 * Positions for a dead ball, in the team's own frame with `ball` in that frame. The team that
 * restarts (`taking`) sets up to attack it; the other one defends it (wall, markers, ten yards).
 */
export function setPieceShape(
  kind: SetPieceKind,
  taking: boolean,
  formation: Formation,
  tactic: Tactic,
  ball: Point,
): Point[] {
  const slots = FORMATION_SLOTS[formation];
  const base = teamShape(formation, tactic, ball, taking);
  const pts: Point[] = base.map((p) => ({ ...p }));
  const set = (i: number, p: Point): void => {
    pts[i] = { x: clamp(p.x, 0.03, 0.97), y: clamp(p.y, 0.02, 0.98) };
  };
  const outfield = (pred: (position: string) => boolean): number[] =>
    slots.map((s, i) => (i > 0 && pred(s.position) ? i : -1)).filter((i) => i >= 0);
  const spread = (indices: readonly number[], y: number, x0: number, x1: number): void => {
    indices.forEach((idx, k) => {
      const t = indices.length === 1 ? 0.5 : k / (indices.length - 1);
      set(idx, { x: x0 + (x1 - x0) * t, y });
    });
  };
  const all = outfield(() => true);

  switch (kind) {
    case 'kickoff': {
      // Everyone in their own half; the opponents outside the centre circle.
      all.forEach((i) => set(i, { x: pts[i]?.x ?? 0.5, y: (slots[i]?.y ?? 0.5) * 0.82 }));
      set(0, { x: 0.5, y: 0.03 });
      if (taking) {
        const [a, b] = outfield((p) => p === 'ST' || p === 'CF' || p === 'CAM');
        if (a !== undefined) set(a, { x: 0.5, y: 0.5 });
        if (b !== undefined) set(b, { x: 0.56, y: 0.47 });
      }
      break;
    }
    case 'throw-in': {
      const inward = ball.x < 0.5 ? 1 : -1;
      if (taking) {
        // Two outlets near the ball (short, and in behind), the block leaning to that side.
        const near = all
          .map((i) => ({
            i,
            d: hypot((pts[i]?.x ?? 0) - ball.x, ((pts[i]?.y ?? 0) - ball.y) * 1.5),
          }))
          .sort((a, b) => a.d - b.d);
        const first = near[1]?.i;
        const second = near[2]?.i;
        if (first !== undefined) set(first, { x: ball.x + inward * 0.12, y: ball.y + 0.05 });
        if (second !== undefined) set(second, { x: ball.x + inward * 0.24, y: ball.y - 0.07 });
      } else {
        // Marks the outlets and keeps 2 m (opponents' frame: same ball spot, mirrored by caller).
        const near = all
          .map((i) => ({
            i,
            d: hypot((pts[i]?.x ?? 0) - ball.x, ((pts[i]?.y ?? 0) - ball.y) * 1.5),
          }))
          .sort((a, b) => a.d - b.d);
        const first = near[0]?.i;
        const second = near[1]?.i;
        if (first !== undefined) set(first, { x: ball.x + inward * 0.1, y: ball.y - 0.02 });
        if (second !== undefined) set(second, { x: ball.x + inward * 0.22, y: ball.y + 0.06 });
      }
      break;
    }
    case 'corner': {
      if (taking) {
        // Into the box: strikers on the six-yard line, a centre-back at the far post, the
        // midfield on the edge, the rest holding the half-way line.
        const strikers = outfield((p) => p === 'ST' || p === 'CF');
        const centreBacks = outfield((p) => p === 'CB');
        const mids = outfield((p) => p === 'CM' || p === 'CAM' || p === 'CDM');
        const wide = outfield((p) => FULL_BACKS.has(p) || WIDE.has(p));
        spread(strikers, 0.93, 0.44, 0.56);
        centreBacks.forEach((i, k) => set(i, k === 0 ? { x: 0.4, y: 0.86 } : { x: 0.5, y: 0.5 }));
        spread(mids, 0.77, 0.36, 0.64);
        wide.forEach((i, k) => set(i, k % 2 === 0 ? { x: 0.22, y: 0.7 } : { x: 0.78, y: 0.66 }));
        set(0, { x: 0.5, y: 0.5 });
      } else {
        // Defends: goalkeeper on his line, markers in the box, two on the posts, two up.
        const blockers = outfield(
          (p) => p === 'CB' || p === 'CDM' || p === 'CM' || FULL_BACKS.has(p),
        );
        const forwards = outfield((p) => p === 'ST' || p === 'CF');
        set(0, { x: 0.5, y: 0.03 });
        blockers.forEach((i, k) => {
          const posts = k < 2;
          set(
            i,
            posts
              ? { x: k === 0 ? 0.44 : 0.56, y: 0.025 }
              : {
                  x: 0.3 + ((k - 2) * 0.4) / Math.max(1, blockers.length - 3),
                  y: 0.09 + (k % 2) * 0.05,
                },
          );
        });
        forwards.forEach((i, k) => set(i, { x: k % 2 === 0 ? 0.4 : 0.6, y: 0.5 }));
        const others = outfield(
          (p) =>
            !FULL_BACKS.has(p) &&
            p !== 'CB' &&
            p !== 'CDM' &&
            p !== 'CM' &&
            p !== 'ST' &&
            p !== 'CF',
        );
        others.forEach((i, k) => set(i, { x: 0.35 + (k % 3) * 0.15, y: 0.16 }));
      }
      break;
    }
    case 'goal-kick': {
      if (taking) {
        // Centre-backs split wide in the box, full-backs high and wide, the block up the pitch.
        const cbs = outfield((p) => p === 'CB');
        cbs.forEach((i, k) =>
          set(i, { x: cbs.length === 2 ? (k === 0 ? 0.22 : 0.78) : 0.25 + k * 0.25, y: 0.12 }),
        );
        outfield((p) => FULL_BACKS.has(p)).forEach((i) =>
          set(i, { x: (pts[i]?.x ?? 0.5) < 0.5 ? 0.07 : 0.93, y: 0.34 }),
        );
        outfield((p) => p === 'CDM' || p === 'CM' || p === 'CAM').forEach((i) =>
          set(i, { x: pts[i]?.x ?? 0.5, y: 0.42 + (slots[i]?.y ?? 0.4) * 0.15 }),
        );
        set(0, { x: 0.5, y: 0.06 });
      } else {
        // Presses high but stays out of the area (their y ≤ 0.8 in this frame).
        all.forEach((i) =>
          set(i, { x: pts[i]?.x ?? 0.5, y: Math.min(0.8, (slots[i]?.y ?? 0.5) * 0.9 + 0.12) }),
        );
        set(0, { x: 0.5, y: 0.04 });
      }
      break;
    }
    case 'free-kick': {
      const dangerous = taking
        ? ball.y > 0.68 && Math.abs(ball.x - 0.5) < 0.26
        : ball.y < 0.32 && Math.abs(ball.x - 0.5) < 0.26;
      if (dangerous) {
        if (taking) {
          // Runners in the box, the taker and a decoy on the ball, the rest at the edge.
          const strikers = outfield((p) => p === 'ST' || p === 'CF' || p === 'CAM');
          const cbs = outfield((p) => p === 'CB');
          spread(strikers, 0.92, 0.42, 0.6);
          cbs.forEach((i, k) => set(i, { x: 0.36 + k * 0.28, y: 0.86 }));
          outfield((p) => p === 'CM' || p === 'CDM').forEach((i, k) =>
            set(i, { x: 0.3 + k * 0.4, y: 0.74 }),
          );
          outfield((p) => FULL_BACKS.has(p) || WIDE.has(p)).forEach((i, k) =>
            set(i, { x: k % 2 === 0 ? 0.18 : 0.82, y: 0.72 }),
          );
          set(0, { x: 0.5, y: 0.5 });
        } else {
          // Wall of four on the line to goal, nine yards from the ball; markers behind it.
          const goal = { x: 0.5, y: 0 };
          const dx = (goal.x - ball.x) * M_X;
          const dy = (goal.y - ball.y) * M_Y;
          const len = hypot(dx, dy) || 1;
          const wallSize = Math.min(4, Math.max(2, Math.round(10 - len / 4)));
          const wallMen = outfield(
            (p) => p === 'CM' || p === 'CDM' || p === 'ST' || p === 'CF' || p === 'CAM',
          ).slice(0, wallSize);
          wallMen.forEach((i, k) => {
            const along = 9.15;
            const across = (k - (wallMen.length - 1) / 2) * 0.55;
            set(i, {
              x: ball.x + ((dx / len) * along + (-dy / len) * across) / M_X,
              y: ball.y + ((dy / len) * along + (dx / len) * across) / M_Y,
            });
          });
          const cbs = outfield((p) => p === 'CB' || FULL_BACKS.has(p));
          cbs.forEach((i, k) =>
            set(i, { x: 0.3 + (k / Math.max(1, cbs.length - 1)) * 0.4, y: 0.1 }),
          );
          outfield((p) => WIDE.has(p)).forEach((i, k) =>
            set(i, { x: k % 2 === 0 ? 0.25 : 0.75, y: 0.3 }),
          );
          set(0, { x: 0.5, y: 0.02 });
        }
      } else if (!taking) {
        // A deep free kick: keep ten yards, hold the shape.
        pts.forEach((p, i) => i > 0 && set(i, outOfCircle(p, ball, 9.15)));
      }
      break;
    }
    case 'penalty': {
      // Everyone outside the area and the arc; the goalkeeper on his line.
      const edge = taking ? 0.79 : 0.24;
      all.forEach((i, k) =>
        set(i, { x: 0.12 + (k / Math.max(1, all.length - 1)) * 0.76, y: edge + (k % 2) * 0.03 }),
      );
      set(0, taking ? { x: 0.5, y: 0.45 } : { x: 0.5, y: 0.0 });
      break;
    }
  }
  return pts;
}

/** Converts a point of `team`'s frame to the absolute frame, where home attacks towards y = 1
 * in the first half (ends are swapped at half-time). */
export function toAbsolute(p: Point, home: boolean, secondHalf: boolean): Point {
  return home !== secondHalf ? p : { x: 1 - p.x, y: 1 - p.y };
}

/** Converts an absolute point to `team`'s frame (its own inverse). */
export const toTeamFrame = toAbsolute;
