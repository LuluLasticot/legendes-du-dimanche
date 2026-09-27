// Simulation time is counted in integer ticks at a fixed rate, never derived from render deltas.

/** Physics rate of key moments (Hz). */
export const TICK_RATE = 120;

/** Duration of one tick in seconds. */
export const TICK_DT = 1 / TICK_RATE;

/** Integer tick index since the start of a simulation. */
export type Tick = number;

export function ticksToSeconds(ticks: Tick): number {
  return ticks / TICK_RATE;
}

/** Nearest tick for a duration in seconds. */
export function secondsToTicks(seconds: number): Tick {
  return Math.round(seconds * TICK_RATE);
}
