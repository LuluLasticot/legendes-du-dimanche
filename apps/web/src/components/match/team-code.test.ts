import { describe, expect, it } from 'vitest';
import { teamCode } from './team-code';

describe('teamCode', () => {
  it('names the place, not the prefix', () => {
    expect(teamCode('FC Avesnes-le-Sec')).toBe('AVE');
    expect(teamCode('US Saint-Amand')).toBe('STA');
    expect(teamCode('Olympique Béthune')).toBe('BET');
    expect(teamCode('Lens')).toBe('LEN');
  });
});
