import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import * as m from '../src/math/index.ts';
import { pow2, scalbn } from '../src/math/bits.ts';

// Math.* is fine here: tests compare the deterministic versions against the platform ones.

function closeRel(actual: number, expected: number, tol: number): boolean {
  if (Number.isNaN(expected)) return Number.isNaN(actual);
  if (!Number.isFinite(expected)) return actual === expected;
  return Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));
}

const finite = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true });

describe('trigonometry', () => {
  it('sin/cos match Math within 1e-15 on the game domain', () => {
    fc.assert(
      fc.property(finite(-1e4, 1e4), (x) => {
        expect(closeRel(m.sin(x), Math.sin(x), 1e-15)).toBe(true);
        expect(closeRel(m.cos(x), Math.cos(x), 1e-15)).toBe(true);
      }),
      { numRuns: 20_000 },
    );
  });

  it('sinCos agrees bit-for-bit with sin and cos', () => {
    fc.assert(
      fc.property(finite(-1e6, 1e6), (x) => {
        const [s, c] = m.sinCos(x);
        expect(Object.is(s, m.sin(x))).toBe(true);
        expect(Object.is(c, m.cos(x))).toBe(true);
      }),
    );
  });

  it('sin² + cos² = 1', () => {
    fc.assert(
      fc.property(finite(-1e5, 1e5), (x) => {
        const [s, c] = m.sinCos(x);
        expect(Math.abs(s * s + c * c - 1)).toBeLessThan(4e-16);
      }),
    );
  });

  it('tan matches Math away from poles', () => {
    fc.assert(
      fc.property(finite(-1.5, 1.5), (x) => {
        expect(closeRel(m.tan(x), Math.tan(x), 1e-14)).toBe(true);
      }),
    );
  });

  it('atan / atan2 / asin / acos match Math', () => {
    fc.assert(
      fc.property(finite(-1e8, 1e8), finite(-1e8, 1e8), (y, x) => {
        expect(closeRel(m.atan(x), Math.atan(x), 1e-15)).toBe(true);
        expect(closeRel(m.atan2(y, x), Math.atan2(y, x), 1e-15)).toBe(true);
      }),
      { numRuns: 20_000 },
    );
    fc.assert(
      fc.property(finite(-1, 1), (x) => {
        expect(closeRel(m.asin(x), Math.asin(x), 1e-15)).toBe(true);
        expect(closeRel(m.acos(x), Math.acos(x), 1e-15)).toBe(true);
      }),
    );
  });

  it('atan2 follows the IEEE special cases', () => {
    const cases: [number, number][] = [
      [0, 1],
      [-0, 1],
      [0, -1],
      [-0, -1],
      [0, 0],
      [-0, -0],
      [0, -0],
      [1, 0],
      [-1, 0],
      [Infinity, Infinity],
      [Infinity, -Infinity],
      [-Infinity, Infinity],
      [-Infinity, -Infinity],
      [1, Infinity],
      [1, -Infinity],
      [-1, -Infinity],
      [Infinity, 1],
      [NaN, 1],
      [1, NaN],
    ];
    for (const [y, x] of cases) {
      const expected = Math.atan2(y, x);
      const actual = m.atan2(y, x);
      if (Number.isNaN(expected)) expect(actual).toBeNaN();
      else expect(Object.is(actual, expected) || Math.abs(actual - expected) < 1e-15).toBe(true);
    }
  });

  it('handles non-finite inputs', () => {
    expect(m.sin(Infinity)).toBeNaN();
    expect(m.cos(NaN)).toBeNaN();
    expect(m.atan(Infinity)).toBeCloseTo(Math.PI / 2, 15);
    expect(Object.is(m.sin(-0), -0)).toBe(true);
    expect(m.asin(1.5)).toBeNaN();
  });

  it('wrapAngle returns (−π, π]', () => {
    fc.assert(
      fc.property(finite(-1e4, 1e4), (a) => {
        const w = m.wrapAngle(a);
        expect(w).toBeGreaterThan(-Math.PI - 1e-12);
        expect(w).toBeLessThanOrEqual(Math.PI);
        expect(Math.abs(m.sin(w) - m.sin(a))).toBeLessThan(1e-9);
      }),
    );
  });
});

describe('exp / log / pow', () => {
  it('exp matches Math within 1e-15', () => {
    fc.assert(
      fc.property(finite(-745, 709), (x) => {
        expect(closeRel(m.exp(x), Math.exp(x), 1e-15)).toBe(true);
      }),
      { numRuns: 20_000 },
    );
  });

  it('log matches Math within 1e-15, including subnormals', () => {
    fc.assert(
      fc.property(fc.double({ min: 5e-324, max: 1.7e308, noNaN: true }), (x) => {
        expect(closeRel(m.log(x), Math.log(x), 1e-15)).toBe(true);
      }),
      { numRuns: 20_000 },
    );
  });

  it('exp/log special values', () => {
    expect(m.exp(-Infinity)).toBe(0);
    expect(m.exp(Infinity)).toBe(Infinity);
    expect(m.exp(0)).toBe(1);
    expect(m.log(1)).toBe(0);
    expect(m.log(0)).toBe(-Infinity);
    expect(m.log(-1)).toBeNaN();
    expect(m.log(Infinity)).toBe(Infinity);
  });

  it('pow matches Math (relative 1e-12 for real exponents)', () => {
    fc.assert(
      fc.property(finite(1e-6, 1e3), finite(-8, 8), (x, y) => {
        expect(closeRel(m.pow(x, y), Math.pow(x, y), 1e-12)).toBe(true);
      }),
      { numRuns: 20_000 },
    );
  });

  it('pow with integer exponents, negative bases and zero', () => {
    expect(m.pow(-2, 3)).toBe(-8);
    expect(m.pow(-2, -2)).toBe(0.25);
    expect(m.pow(3, 0)).toBe(1);
    expect(m.pow(NaN, 0)).toBe(1);
    expect(m.pow(-2, 0.5)).toBeNaN();
    expect(m.pow(0, 2.5)).toBe(0);
    expect(m.pow(0, -1.5)).toBe(Infinity);
    expect(m.pow(10, 22)).toBe(1e22);
  });

  it('hypot', () => {
    expect(m.hypot(3, 4)).toBe(5);
    expect(m.hypot3(2, 3, 6)).toBe(7);
  });
});

describe('bits', () => {
  it('pow2 is exact across the whole exponent range', () => {
    for (let k = -1074; k <= 1023; k++) expect(pow2(k)).toBe(2 ** k);
  });

  it('scalbn', () => {
    expect(scalbn(1.5, 10)).toBe(1536);
    expect(scalbn(1, 1024)).toBe(Infinity);
    expect(scalbn(1, -1075)).toBe(0);
  });
});
