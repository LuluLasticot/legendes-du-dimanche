// Gesture analysis: from the traced finger/mouse path (normalised screen coordinates, stamped in
// ticks so it can be replayed and validated server-side) to the shot intent features.
//
// Like in Score! Hero, the player draws the path they want: an arc bowing to the right makes a
// ball that leaves to the right and curls back left onto the target.

import { clamp, hypot } from '../math/index.ts';
import { TICK_RATE, type Tick } from '../time/index.ts';

/** A point of the trace: u → right, v → down, both in [0, 1] of the viewport. */
export interface GesturePoint {
  readonly u: number;
  readonly v: number;
  readonly tick: Tick;
}

export interface GestureTuning {
  /** Deviation of the path from its chord, as a fraction of the chord, that means full curl. */
  readonly fullBulgeRatio: number;
  /** Trace speed (viewport heights per second) that means full power. */
  readonly fullPowerSpeed: number;
  /** Traces shorter than this (viewport fraction) are ignored as taps. */
  readonly minLength: number;
}

export const DEFAULT_GESTURE_TUNING: GestureTuning = {
  fullBulgeRatio: 0.22,
  fullPowerSpeed: 2.2,
  minLength: 0.04,
};

export interface GestureFeatures {
  /** Signed bow of the path in [−1, 1]: > 0 bows to the right of the direction of travel. */
  readonly bulge: number;
  /** Power in [0, 1], from the trace speed. */
  readonly power: number;
  /** Chord length in viewport units. */
  readonly length: number;
  /** Duration in ticks. */
  readonly duration: Tick;
}

/** Returns null for traces too short to be a gesture. */
export function analyzeGesture(
  points: readonly GesturePoint[],
  tuning: GestureTuning = DEFAULT_GESTURE_TUNING,
): GestureFeatures | null {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined || points.length < 2) return null;

  const du = last.u - first.u;
  const dv = last.v - first.v;
  const chord = hypot(du, dv);
  if (chord < tuning.minLength) return null;

  // Right-hand perpendicular of the travel direction, in screen space (v points down).
  const ru = -dv / chord;
  const rv = du / chord;
  let deviation = 0;
  for (const p of points) {
    const d = (p.u - first.u) * ru + (p.v - first.v) * rv;
    if (Math.abs(d) > Math.abs(deviation)) deviation = d;
  }

  let pathLength = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as GesturePoint;
    const b = points[i] as GesturePoint;
    pathLength += hypot(b.u - a.u, b.v - a.v);
  }
  const duration = Math.max(1, last.tick - first.tick);
  const speed = pathLength / (duration / TICK_RATE);

  return {
    bulge: clamp(deviation / (chord * tuning.fullBulgeRatio), -1, 1),
    power: clamp(speed / tuning.fullPowerSpeed, 0, 1),
    length: chord,
    duration,
  };
}
