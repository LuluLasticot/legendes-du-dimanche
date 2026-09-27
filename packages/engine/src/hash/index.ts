// Non-cryptographic hashing: seed derivation and bit-exact fingerprints of simulation state.

import { float64Words } from '../math/bits.ts';

/** murmur3 finaliser: full avalanche of a 32-bit integer. */
export function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 32-bit hash of a string (FNV-1a over UTF-16 code units, then murmur3 finaliser). */
export function hashString(s: string, seed = 0): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return fmix32(h);
}

/** Combines two 32-bit values into one well-mixed 32-bit value (order-sensitive). */
export function hashCombine(a: number, b: number): number {
  return fmix32((Math.imul(a >>> 0, 0x9e3779b1) ^ (b >>> 0)) + 0x7f4a7c15);
}

const C1 = 0xcc9e2d51;
const C2 = 0x1b873593;

function rotl(x: number, r: number): number {
  return (x << r) | (x >>> (32 - r));
}

/**
 * Streaming 64-bit fingerprint (two murmur3 lanes) of numbers and strings.
 * Floats are hashed by their exact IEEE-754 bits, so two fingerprints match only if every
 * value is bit-identical (−0 ≠ +0). All NaNs are canonicalised: their payload is not portable.
 */
export class Fingerprint {
  private h1 = 0x5eed1234;
  private h2 = 0x0badf00d;
  private words = 0;

  private word(k: number): void {
    let k1 = Math.imul(k, C1);
    k1 = rotl(k1, 15);
    k1 = Math.imul(k1, C2);
    this.h1 ^= k1;
    this.h1 = rotl(this.h1, 13);
    this.h1 = (Math.imul(this.h1, 5) + 0xe6546b64) | 0;

    let k2 = Math.imul(k, C2);
    k2 = rotl(k2, 17);
    k2 = Math.imul(k2, C1);
    this.h2 ^= k2;
    this.h2 = rotl(this.h2, 15);
    this.h2 = (Math.imul(this.h2, 5) + 0x38495ab5) | 0;

    this.words++;
  }

  u32(n: number): this {
    this.word(n >>> 0);
    return this;
  }

  f64(x: number): this {
    if (Number.isNaN(x)) {
      this.word(0x7ff80000);
      this.word(0);
    } else {
      const [hi, lo] = float64Words(x);
      this.word(hi);
      this.word(lo);
    }
    return this;
  }

  str(s: string): this {
    this.word(s.length);
    for (let i = 0; i < s.length; i++) this.word(s.charCodeAt(i));
    return this;
  }

  /** Number of 32-bit words absorbed so far. */
  get size(): number {
    return this.words;
  }

  /** 16 hex characters. Does not reset the state. */
  digest(): string {
    let a = (this.h1 ^ this.words) >>> 0;
    let b = (this.h2 ^ this.words) >>> 0;
    a = (a + b) >>> 0;
    b = (b + a) >>> 0;
    a = fmix32(a);
    b = fmix32(b);
    a = (a + b) >>> 0;
    b = (b + a) >>> 0;
    return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
  }
}
