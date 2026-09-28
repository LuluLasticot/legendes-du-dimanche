// Team shape: where the eleven stand for a given ball position, from the formation anchors, the
// phase (with or without the ball) and the tactic. Pure, so the simulation (receivers, nearest
// defender) and the 2D renderer (target positions) share it — nothing to store per phase.
//
// Team frame: x = 0 left touchline → 1 right one, y = 0 own goal line → 1 opposing one.

import { clamp } from '../math/index.ts';
import { FORMATION_SLOTS, type Formation } from './formations.ts';
import type { Tactic } from './model.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export function teamShape(
  formation: Formation,
  tactic: Tactic,
  ball: Point,
  inPossession: boolean,
): Point[] {
  const width = 0.8 + (tactic.width - 3) * 0.08 + (inPossession ? 0.12 : -0.05);
  const pull = inPossession ? 0.2 : 0.35;
  const line = (tactic.lineHeight - 3) * 0.035 + tactic.mentality * 0.02;
  // The block follows the ball up the pitch, compact without it.
  const push = inPossession
    ? clamp(ball.y - 0.4, -0.12, 0.4) * 0.85 + line
    : clamp(ball.y - 0.5, -0.3, 0.3) * 0.55 + line - 0.04;
  const depth = inPossession ? 1 : 0.8;
  return FORMATION_SLOTS[formation].map((slot, i) => {
    if (i === 0) {
      // Goalkeeper: on his line, a few metres out when his team is up the pitch.
      return {
        x: clamp(0.5 + (ball.x - 0.5) * 0.15, 0.4, 0.6),
        y: clamp(0.02 + push * 0.12, 0.01, 0.1),
      };
    }
    const x = 0.5 + (slot.x - 0.5) * width;
    return {
      x: clamp(x + (ball.x - x) * pull, 0.03, 0.97),
      y: clamp(slot.y * depth + push, 0.03, 0.97),
    };
  });
}

/** Converts a point of `team`'s frame to the absolute frame, where home attacks towards y = 1
 * in the first half (ends are swapped at half-time). */
export function toAbsolute(p: Point, home: boolean, secondHalf: boolean): Point {
  return home !== secondHalf ? p : { x: 1 - p.x, y: 1 - p.y };
}

/** Converts an absolute point to `team`'s frame (its own inverse). */
export const toTeamFrame = toAbsolute;
