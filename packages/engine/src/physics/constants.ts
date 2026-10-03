// Dimensions (IFAB Laws of the Game), SI units.

/** Size 5 ball. */
export const BALL = {
  radius: 0.11,
  mass: 0.43,
  /** Cross-section π·r². */
  area: 0.0380132711084365,
} as const;

/** Standard amateur pitch (length 90–120 m, width 45–90 m allowed). */
export const PITCH = {
  length: 105,
  width: 68,
  /** X of the attacked goal line (the opposite line is at −goalLineX). */
  goalLineX: 52.5,
} as const;

/** Penalty area: a foul by the defence inside it is a penalty, never a free kick. */
export const PENALTY_AREA = {
  /** From the goal line. */
  depth: 16.5,
  width: 40.32,
} as const;

export const GOAL = {
  /** Inner width between posts. */
  width: 7.32,
  /** Inner height under the crossbar. */
  height: 2.44,
  /** Radius of posts and crossbar (12 cm wide). */
  postRadius: 0.06,
  /** Depth of the net behind the goal line. */
  netDepth: 2,
} as const;
