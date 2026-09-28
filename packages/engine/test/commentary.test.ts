import { describe, expect, it } from 'vitest';
import { COMMENTARY_TEMPLATES, commentate, type CommentLine } from '../src/commentary/index.ts';
import { demoTeam, simulateMatch, type MatchSetup } from '../src/sim/index.ts';

const setup = (seed: number, rain = false): MatchSetup => ({
  seed,
  home: demoTeam(seed, { id: 'fca', name: 'FC Avesnes', rating: 58 }),
  away: demoTeam(seed + 7, { id: 'uss', name: 'US Saint-Amand', rating: 56, formation: '4-3-3' }),
  conditions: { surface: 'grass', rain, windSpeed: 0, windDirection: 0 },
});
const play = (seed: number, rain = false) => {
  const s = setup(seed, rain);
  const result = simulateMatch(s);
  return { s, result, lines: commentate(s, result) };
};

describe('commentary', () => {
  it('is deterministic', () => {
    const a = play(5);
    const b = play(5);
    expect(JSON.stringify(a.lines)).toBe(JSON.stringify(b.lines));
    expect(JSON.stringify(play(6).lines)).not.toBe(JSON.stringify(a.lines));
  });

  it('opens, closes and comments every goal', () => {
    for (let seed = 0; seed < 30; seed++) {
      const { result, lines } = play(seed);
      expect(lines[0]?.category).toBe('kickoff');
      expect(lines.at(-1)?.category).toMatch(/^full-time/);
      const goals = lines.filter(
        (l) => l.category.startsWith('goal') && l.category !== 'goal-kick',
      );
      expect(goals).toHaveLength(result.score[0] + result.score[1]);
      expect(lines.filter((l) => l.category === 'half-time')).toHaveLength(1);
    }
  });

  it('uses valid keys and never repeats a variant of a category back to back', () => {
    for (let seed = 0; seed < 30; seed++) {
      const last = new Map<string, string>();
      for (const line of play(seed).lines) {
        const [category, n] = line.key.split('.');
        expect(category).toBe(line.category);
        expect(Number(n)).toBeLessThan(COMMENTARY_TEMPLATES[line.category]);
        expect(last.get(line.category)).not.toBe(line.key);
        last.set(line.category, line.key);
      }
    }
  });

  it('is in match order and gives each line what its template needs', () => {
    const { lines } = play(3);
    for (let i = 1; i < lines.length; i++) {
      const [a, b] = [lines[i - 1] as CommentLine, lines[i] as CommentLine];
      const ka = a.half === 1 ? a.t : 1e5 + a.t;
      const kb = b.half === 1 ? b.t : 1e5 + b.t;
      expect(kb).toBeGreaterThanOrEqual(ka);
    }
    for (const line of lines) {
      expect(typeof line.params.minute).toBe('number');
      if (['goal', 'save', 'miss', 'foul', 'yellow', 'red', 'offside'].includes(line.category)) {
        expect(String(line.params.player || line.params.keeper).length).toBeGreaterThan(0);
      }
    }
  });

  it('a varied speaker: over a few matches most categories are used', () => {
    const used = new Set<string>();
    for (let seed = 0; seed < 60; seed++)
      for (const l of play(seed, seed % 4 === 0).lines) used.add(l.category);
    expect(used.size).toBeGreaterThanOrEqual(Object.keys(COMMENTARY_TEMPLATES).length - 4);
    expect(used.has('rain')).toBe(true);
  });
});
