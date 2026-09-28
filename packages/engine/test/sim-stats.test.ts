import { describe, expect, it } from 'vitest';
import { matchSeries } from '../src/sim/index.ts';

// CI thresholds (the full 10,000-match report: `pnpm --filter @legendes/engine stats`).
describe('match statistics', { timeout: 120_000 }, () => {
  const district = matchSeries(1500, 45, 45);
  const regional = matchSeries(1500, 60, 60);
  const national = matchSeries(1500, 72, 72);

  it('goals per match fall with the level (district is more prolific than N2)', () => {
    expect(district.goals).toBeGreaterThan(regional.goals);
    expect(regional.goals).toBeGreaterThan(national.goals);
    expect(district.goals).toBeLessThan(4.6);
    expect(national.goals).toBeGreaterThan(2.2);
  });

  it('home advantage and a realistic share of draws', () => {
    for (const s of [district, regional, national]) {
      expect(s.home).toBeGreaterThan(s.away + 0.07);
      expect(s.draw).toBeGreaterThan(0.17);
      expect(s.draw).toBeLessThan(0.32);
    }
  });

  it('score distribution: no goal-fests, some 0-0', () => {
    const totals = regional.totals;
    expect(totals[0]).toBeGreaterThan(0.03);
    expect(totals[6]).toBeLessThan(0.12);
  });

  it('rating gap → win probability rises monotonically', () => {
    const gaps = [0, 5, 10, 20].map((gap) => matchSeries(600, 60 + gap / 2, 60 - gap / 2, 50_000));
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i]?.home ?? 0).toBeGreaterThan(gaps[i - 1]?.home ?? 1);
    }
    expect(gaps[3]?.home).toBeGreaterThan(0.7);
  });

  it('discipline and changes', () => {
    expect(regional.reds).toBeLessThan(0.25);
    expect(regional.yellows).toBeGreaterThan(1);
    expect(regional.subs).toBeGreaterThan(5);
    expect(regional.subs).toBeLessThanOrEqual(10);
    expect(regional.penalties).toBeLessThan(0.45);
  });
});
