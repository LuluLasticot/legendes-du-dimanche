// Seeded PRNG: xoshiro128** (Blackman & Vigna), seeded through splitmix32.
// All engine randomness goes through this module: never Math.random().

import { cos, log, TAU } from '../math/index.ts';
import { hashCombine, hashString } from '../hash/index.ts';

/** 32-bit unsigned seed. */
export type Seed = number;

/** Full generator state (four 32-bit words), serialisable as JSON. */
export type RngState = readonly [number, number, number, number];

export type SeedLabel = string | number;

const TWO_POW_32 = 4294967296;
const TWO_POW_53 = 9007199254740992;
const TWO_POW_26 = 67108864;

function splitmix32(state: number): [value: number, next: number] {
  const next = (state + 0x9e3779b9) | 0;
  let z = next;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  z ^= z >>> 15;
  return [z >>> 0, next];
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/** Normalises a number or string into a 32-bit seed. */
export function toSeed(seed: Seed | string): Seed {
  if (typeof seed === 'string') return hashString(seed);
  if (!Number.isInteger(seed)) throw new RangeError(`Seed must be an integer, got ${seed}`);
  return seed >>> 0;
}

/**
 * Derives a child seed from a parent seed and a path of labels, e.g.
 * `deriveSeed(matchSeed, 'moment', 3)`. Pure: independent of how much the parent was used.
 */
export function deriveSeed(seed: Seed, ...labels: readonly SeedLabel[]): Seed {
  let h = seed >>> 0;
  for (const label of labels) {
    const part = typeof label === 'number' ? toSeed(label) : hashString(label);
    h = hashCombine(h, part);
  }
  return h;
}

export class Rng {
  /** Seed this generator was created from (used by {@link fork}). */
  readonly seed: Seed;
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  private constructor(seed: Seed, state: RngState) {
    this.seed = seed;
    [this.s0, this.s1, this.s2, this.s3] = state;
  }

  static create(seed: Seed | string): Rng {
    const s = toSeed(seed);
    let sm = s;
    const words: number[] = [];
    for (let i = 0; i < 4; i++) {
      const [value, next] = splitmix32(sm);
      words.push(value);
      sm = next;
    }
    const [a = 0, b = 0, c = 0, d = 0] = words;
    // xoshiro must never be all zeros (splitmix32 makes this practically impossible).
    return new Rng(s, a | b | c | d ? [a, b, c, d] : [1, 0, 0, 0]);
  }

  /** Restores a generator from a state captured with {@link getState}. */
  static fromState(seed: Seed, state: RngState): Rng {
    if (state.length !== 4 || state.every((w) => w === 0)) {
      throw new RangeError('Invalid xoshiro128** state');
    }
    return new Rng(seed >>> 0, [state[0] >>> 0, state[1] >>> 0, state[2] >>> 0, state[3] >>> 0]);
  }

  getState(): RngState {
    return [this.s0 >>> 0, this.s1 >>> 0, this.s2 >>> 0, this.s3 >>> 0];
  }

  clone(): Rng {
    return Rng.fromState(this.seed, this.getState());
  }

  /**
   * Independent child generator for a named sub-stream (`rng.fork('moment', 3)`).
   * Depends only on this generator's seed and the labels, never on how many values were drawn.
   */
  fork(...labels: readonly SeedLabel[]): Rng {
    return Rng.create(deriveSeed(this.seed, ...labels));
  }

  /** Uniform 32-bit unsigned integer. */
  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9);
    const t = this.s1 << 9;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return result >>> 0;
  }

  /** Uniform float in [0, 1) with 53 bits of randomness. */
  float(): number {
    const a = this.nextU32() >>> 5;
    const b = this.nextU32() >>> 6;
    return (a * TWO_POW_26 + b) / TWO_POW_53;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.float();
  }

  /** Uniform integer in [min, max] (both inclusive), without modulo bias. */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Invalid integer range [${min}, ${max}]`);
    }
    const span = max - min + 1;
    if (span > TWO_POW_32) throw new RangeError('Integer range wider than 2^32');
    if (span === TWO_POW_32) return min + this.nextU32();
    const limit = TWO_POW_32 - (TWO_POW_32 % span);
    let x = this.nextU32();
    while (x >= limit) x = this.nextU32();
    return min + (x % span);
  }

  /** true with probability p. */
  chance(p: number): boolean {
    return this.float() < p;
  }

  /** −1 or +1 with equal probability. */
  sign(): -1 | 1 {
    return this.nextU32() & 1 ? 1 : -1;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Cannot pick from an empty array');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** Index drawn proportionally to non-negative weights (not necessarily normalised). */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) {
      if (!(w >= 0) || !Number.isFinite(w)) throw new RangeError(`Invalid weight ${w}`);
      total += w;
    }
    if (total <= 0) throw new RangeError('Weights must sum to a positive number');
    let r = this.float() * total;
    let last = 0;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i] ?? 0;
      if (w === 0) continue;
      last = i;
      r -= w;
      if (r < 0) return i;
    }
    return last;
  }

  /** In-place Fisher–Yates shuffle; returns the same array. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }

  /** Normal distribution (Box–Muller, deterministic math). Consumes four 32-bit words. */
  normal(mean = 0, sd = 1): number {
    const u1 = 1 - this.float(); // (0, 1]: log(u1) is finite
    const u2 = this.float();
    return mean + sd * Math.sqrt(-2 * log(u1)) * cos(TAU * u2);
  }
}
