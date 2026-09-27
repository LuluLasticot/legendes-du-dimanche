import { describe, expect, it } from 'vitest';
import { Fingerprint, hashString } from '../src/hash/index.ts';

describe('Fingerprint', () => {
  it('distinguishes values bit-exactly', () => {
    const d = (x: number) => new Fingerprint().f64(x).digest();
    expect(d(0)).not.toBe(d(-0));
    expect(d(0.1 + 0.2)).not.toBe(d(0.3));
    expect(d(NaN)).toBe(d(-NaN));
    expect(d(1)).toBe(d(1));
  });

  it('is order-sensitive and length-aware', () => {
    expect(new Fingerprint().u32(1).u32(2).digest()).not.toBe(
      new Fingerprint().u32(2).u32(1).digest(),
    );
    expect(new Fingerprint().str('ab').digest()).not.toBe(
      new Fingerprint().str('a').str('b').digest(),
    );
  });

  it('digest is 16 hex chars', () => {
    expect(new Fingerprint().digest()).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('hashString', () => {
  it('is stable', () => {
    expect(hashString('legendes-du-dimanche')).toBe(hashString('legendes-du-dimanche'));
    expect(hashString('')).toBeTypeOf('number');
  });
});
