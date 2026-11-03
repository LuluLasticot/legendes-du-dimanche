import { describe, expect, it } from 'vitest';
import { seasonOf } from './season.ts';

describe('the season of a player', () => {
  it('starts at level 1 with no match', () => {
    expect(seasonOf([])).toEqual({
      wins: 0,
      draws: 0,
      losses: 0,
      xp: 0,
      level: 1,
      nextLevelXp: 500,
    });
  });

  it('counts validated matches only, from the home side: 100 XP each, 50 more a win', () => {
    const season = seasonOf([
      { status: 'validated', score: [2, 0] },
      { status: 'validated', score: [1, 1] },
      { status: 'validated', score: [0, 1] },
      { status: 'rejected', score: null },
      { status: 'validated', score: [3, 1] },
      { status: 'validated', score: [4, 0] },
    ]);
    expect(season).toEqual({ wins: 3, draws: 1, losses: 1, xp: 650, level: 2, nextLevelXp: 1000 });
  });
});
