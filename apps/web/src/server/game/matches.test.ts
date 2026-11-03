import { describe, expect, it } from 'vitest';
import { matchReward, momentsWon } from './matches.ts';

describe('match rewards', () => {
  it('pays a win by level, half a draw, a quarter a defeat, and 25 a key moment', () => {
    expect(matchReward('district', [2, 1], 0)).toBe(300);
    expect(matchReward('regional', [1, 1], 0)).toBe(300);
    expect(matchReward('national', [0, 3], 2)).toBe(225 + 50);
  });

  it('counts a goal scored, or a shot kept out in goal, as a key moment won', () => {
    expect(
      momentsWon([
        { id: 1, kind: 'shot', outcome: 'goal' },
        { id: 2, kind: 'penalty', outcome: 'miss' },
        { id: 3, kind: 'keeper', outcome: 'save-catch' },
        { id: 4, kind: 'keeper', outcome: 'goal' },
      ]),
    ).toBe(2);
  });
});
