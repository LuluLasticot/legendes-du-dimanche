import { describe, expect, it } from 'vitest';
import {
  DETERMINISM_GOLDEN,
  runDeterminismScenario,
  verifyDeterminism,
} from '../src/selftest/index.ts';

describe('determinism (Node)', () => {
  it('matches the committed golden fingerprint', () => {
    const { ok, expected, actual } = verifyDeterminism();
    expect(actual, 'If intentional, run `pnpm determinism:update`').toEqual(expected);
    expect(ok).toBe(true);
  });

  // Slow on purpose (≈ 3 s locally, up to 10 s on CI runners): generous timeout.
  it('gives the same result 1 000 times in a row', { timeout: 120_000 }, () => {
    for (let i = 0; i < 1000; i++) {
      expect(runDeterminismScenario().digest).toBe(DETERMINISM_GOLDEN.digest);
    }
  });
});
