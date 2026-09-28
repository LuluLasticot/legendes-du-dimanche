import { describe, expect, it } from 'vitest';
import { demoTeam, simulateMatch, type MatchSetup } from '../src/sim/index.ts';

const setup = (seed: number, home = 60, away = 60): MatchSetup => ({
  seed,
  home: demoTeam(seed, { id: 'home', name: 'Home', rating: home }),
  away: demoTeam(seed + 10_000, { id: 'away', name: 'Away', rating: away }),
  conditions: { surface: 'grass', rain: false, windSpeed: 0, windDirection: 0 },
});

const series = (n: number, home: number, away: number) => {
  let goals = 0;
  let homeWins = 0;
  let awayWins = 0;
  for (let i = 0; i < n; i++) {
    const { score } = simulateMatch(setup(i, home, away));
    goals += score[0] + score[1];
    if (score[0] > score[1]) homeWins++;
    if (score[1] > score[0]) awayWins++;
  }
  return { goals: goals / n, homeWins: homeWins / n, awayWins: awayWins / n };
};

describe('match simulation', { timeout: 60_000 }, () => {
  it('is deterministic: same setup, same match', () => {
    const a = simulateMatch(setup(7));
    const b = simulateMatch(setup(7));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(simulateMatch(setup(8)))).not.toBe(JSON.stringify(a));
  });

  it('plays two halves with stoppage time and a consistent score', () => {
    const r = simulateMatch(setup(3));
    expect(r.duration).toBeGreaterThanOrEqual(91 * 60);
    expect(r.duration).toBeLessThan(97 * 60);
    expect(r.events.filter((e) => e.kind === 'half-time')).toHaveLength(1);
    expect(r.events.at(-1)?.kind).toBe('full-time');
    const goals = r.events.filter((e) => e.kind === 'goal');
    expect(goals.filter((g) => g.team === 0)).toHaveLength(r.score[0]);
    expect(goals.filter((g) => g.team === 1)).toHaveLength(r.score[1]);
    for (let i = 1; i < r.actions.length; i++) {
      const [prev, cur] = [r.actions[i - 1], r.actions[i]];
      if (prev && cur && prev.half === cur.half) expect(cur.t).toBeGreaterThanOrEqual(prev.t);
    }
  });

  it('is fast (well under a frame of budget per match)', () => {
    for (let i = 0; i < 30; i++) simulateMatch(setup(i)); // warm-up (JIT)
    // Best of five batches: robust against a busy CI machine.
    let best = Infinity;
    for (let round = 0; round < 5; round++) {
      const t0 = performance.now();
      for (let i = 0; i < 20; i++) simulateMatch(setup(i));
      best = Math.min(best, (performance.now() - t0) / 20);
    }
    expect(best).toBeLessThan(6);
  });

  it('credible scores, home advantage, the better side wins more, lower levels score more', () => {
    const even = series(400, 60, 60);
    expect(even.goals).toBeGreaterThan(2.3);
    expect(even.goals).toBeLessThan(4.8);
    expect(even.homeWins).toBeGreaterThan(even.awayWins);
    const mismatch = series(300, 72, 55);
    expect(mismatch.homeWins).toBeGreaterThan(0.65);
    expect(mismatch.homeWins).toBeLessThan(0.95);
    expect(series(300, 45, 45).goals).toBeGreaterThan(series(300, 72, 72).goals);
  });
});
