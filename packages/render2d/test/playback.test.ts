import { sim } from '@legendes/engine';
import { describe, expect, it } from 'vitest';
import { MatchPlayback } from '../src/playback.ts';

const result = sim.simulateMatch({
  seed: 4,
  home: sim.demoTeam(4, { id: 'home', name: 'Home', rating: 60 }),
  away: sim.demoTeam(5, { id: 'away', name: 'Away', rating: 60 }),
  conditions: { surface: 'grass', rain: false, windSpeed: 0, windDirection: 0 },
});

describe('match playback', () => {
  const playback = new MatchPlayback(result.actions);

  it('reaches each action position at its time', () => {
    for (const a of result.actions.slice(0, 200)) {
      const f = playback.frame(a.half, a.t);
      expect(f.ball.x).toBeCloseTo(a.ball.x, 6);
      expect(f.ball.y).toBeCloseTo(a.ball.y, 6);
    }
  });

  it('moves the ball continuously between two actions', () => {
    const [a, b] = [result.actions[10], result.actions[11]];
    if (!a || !b || a.half !== b.half) throw new Error('fixture');
    const mid = playback.frame(b.half, (a.t + b.t) / 2);
    const inside = (v: number, p: number, q: number) =>
      v >= Math.min(p, q) - 1e-9 && v <= Math.max(p, q) + 1e-9;
    expect(inside(mid.ball.x, a.ball.x, b.ball.x)).toBe(true);
    expect(inside(mid.ball.y, a.ball.y, b.ball.y)).toBe(true);
  });

  it('handles both halves and the end', () => {
    const second = result.actions.find((a) => a.half === 2);
    expect(second).toBeDefined();
    const end = playback.end;
    expect(end?.half).toBe(2);
    const after = playback.frame(2, 200 * 60);
    expect(after.pass).toBeNull();
  });
});
