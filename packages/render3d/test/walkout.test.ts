import { describe, expect, it } from 'vitest';
import { pickWalkoutVariant, WALKOUT_VARIANTS } from '../src/scenes/pack-opening.ts';

describe('walkout endings', () => {
  it('are drawn evenly from the random source, never outside the list', () => {
    expect(pickWalkoutVariant(() => 0)).toBe('arms_crossed');
    expect(pickWalkoutVariant(() => 0.5)).toBe('crest');
    expect(pickWalkoutVariant(() => 0.999999)).toBe('thumbs_back');
    expect(pickWalkoutVariant(() => 1)).toBe('thumbs_back');
    const seen = new Set(Array.from({ length: 30 }, (_, i) => pickWalkoutVariant(() => i / 30)));
    expect([...seen].sort()).toEqual([...WALKOUT_VARIANTS].sort());
  });
});
