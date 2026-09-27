// @legendes/engine — deterministic core. Pure TypeScript: no DOM, no Node APIs, no
// dependency on render*, ui or apps. Runs identically in browsers, Node, Deno (Edge Functions)
// and the future real-time server.

export * as dmath from './math/index.ts';
export { Rng, deriveSeed, toSeed } from './rng/index.ts';
export type { RngState, Seed, SeedLabel } from './rng/index.ts';
export { Fingerprint, fmix32, hashCombine, hashString } from './hash/index.ts';
export { TICK_DT, TICK_RATE, secondsToTicks, ticksToSeconds } from './time/index.ts';
export type { Tick } from './time/index.ts';
export { DETERMINISM_GOLDEN, runDeterminismScenario, verifyDeterminism } from './selftest/index.ts';
export type { DeterminismReport } from './selftest/index.ts';
