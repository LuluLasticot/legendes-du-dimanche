import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { deriveSeed, Rng, toSeed } from '../src/rng/index.ts';

describe('Rng', () => {
  it('is reproducible for a given seed', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (seed) => {
        const a = Rng.create(seed);
        const b = Rng.create(seed);
        for (let i = 0; i < 32; i++) expect(a.nextU32()).toBe(b.nextU32());
      }),
    );
  });

  it('accepts string seeds', () => {
    expect(Rng.create('club:1234').nextU32()).toBe(Rng.create('club:1234').nextU32());
    expect(toSeed('a')).not.toBe(toSeed('b'));
    expect(() => toSeed(1.5)).toThrow(RangeError);
  });

  it('matches the xoshiro128** reference output', () => {
    // Known state from the reference implementation, s = {1, 2, 3, 4}.
    const rng = Rng.fromState(0, [1, 2, 3, 4]);
    expect([rng.nextU32(), rng.nextU32(), rng.nextU32()]).toEqual([11520, 0, 5927040]);
  });

  it('float() stays in [0, 1) and int() in its inclusive range', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: 0, max: 5000 }),
        (seed, min, width) => {
          const rng = Rng.create(seed);
          for (let i = 0; i < 50; i++) {
            const f = rng.float();
            expect(f).toBeGreaterThanOrEqual(0);
            expect(f).toBeLessThan(1);
            const n = rng.int(min, min + width);
            expect(Number.isInteger(n)).toBe(true);
            expect(n).toBeGreaterThanOrEqual(min);
            expect(n).toBeLessThanOrEqual(min + width);
          }
        },
      ),
    );
  });

  it('int() is roughly uniform (chi-square, 10 buckets)', () => {
    const rng = Rng.create(2026);
    const counts = new Array<number>(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) counts[rng.int(0, 9)]! += 1;
    const expected = n / 10;
    const chi2 = counts.reduce((acc, c) => acc + (c - expected) ** 2 / expected, 0);
    expect(chi2).toBeLessThan(27.88); // p = 0.001, 9 dof
  });

  it('normal() has the right mean and standard deviation', () => {
    const rng = Rng.create(7);
    const n = 50_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const x = rng.normal(10, 2);
      sum += x;
      sumSq += x * x;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sumSq / n - mean * mean);
    expect(mean).toBeCloseTo(10, 1);
    expect(sd).toBeCloseTo(2, 1);
  });

  it('weightedIndex follows the weights and never picks zero weights', () => {
    const rng = Rng.create(99);
    const counts = [0, 0, 0];
    for (let i = 0; i < 40_000; i++) counts[rng.weightedIndex([1, 0, 3])]! += 1;
    expect(counts[1]).toBe(0);
    expect(counts[2]! / counts[0]!).toBeGreaterThan(2.8);
    expect(counts[2]! / counts[0]!).toBeLessThan(3.2);
    expect(() => rng.weightedIndex([0, 0])).toThrow(RangeError);
    expect(() => rng.weightedIndex([1, -1])).toThrow(RangeError);
  });

  it('shuffle() is a permutation', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), fc.array(fc.integer()), (seed, arr) => {
        const shuffled = Rng.create(seed).shuffle([...arr]);
        expect([...shuffled].sort((a, b) => a - b)).toEqual([...arr].sort((a, b) => a - b));
      }),
    );
  });

  it('getState/fromState resume the exact stream', () => {
    const rng = Rng.create(123);
    for (let i = 0; i < 10; i++) rng.nextU32();
    const restored = Rng.fromState(rng.seed, rng.getState());
    for (let i = 0; i < 20; i++) expect(restored.nextU32()).toBe(rng.nextU32());
    expect(JSON.parse(JSON.stringify(rng.getState()))).toEqual(rng.getState());
  });

  it('fork() depends on the seed and labels only, not on consumption', () => {
    const a = Rng.create(5);
    const b = Rng.create(5);
    for (let i = 0; i < 100; i++) b.nextU32();
    expect(a.fork('moment', 2).nextU32()).toBe(b.fork('moment', 2).nextU32());
    expect(a.fork('moment', 2).nextU32()).not.toBe(a.fork('moment', 3).nextU32());
    expect(deriveSeed(5, 'x', 1)).not.toBe(deriveSeed(5, 'x', 2));
    expect(deriveSeed(5, 'ab')).not.toBe(deriveSeed(5, 'a', 'b'));
  });
});
