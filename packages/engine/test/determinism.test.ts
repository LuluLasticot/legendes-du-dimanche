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

  it('gives the same result 1 000 times in a row', () => {
    for (let i = 0; i < 1000; i++) {
      expect(runDeterminismScenario().digest).toBe(DETERMINISM_GOLDEN.digest);
    }
  });
});
