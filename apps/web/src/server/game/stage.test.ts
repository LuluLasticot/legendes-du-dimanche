import { describe, expect, it } from 'vitest';
import type { PlayerState } from './player.ts';
import { STAGE_PATH, stageOf } from './stage.ts';

const base: PlayerState = {
  userId: 'u',
  pseudo: 'Joueur-1',
  clubId: null,
  credits: 1000,
  packs: [],
  cardIds: [],
};

describe('the welcome stages', () => {
  it('sends a visitor without a session to the start', () => {
    expect(stageOf(null)).toBe('start');
  });

  it('asks for a club, then for the starter pack, then lets him play', () => {
    expect(stageOf(base)).toBe('club');
    const chosen = {
      ...base,
      clubId: 'c',
      packs: [{ id: 'p', type: 'starter', source: 'starter' }],
    };
    expect(stageOf(chosen)).toBe('pack');
    expect(stageOf({ ...chosen, packs: [], cardIds: Array<string>(18).fill('x') })).toBe('playing');
  });

  it('keeps a player with other closed packs in the game', () => {
    const playing = { ...base, clubId: 'c', packs: [{ id: 'q', type: 'bronze', source: 'shop' }] };
    expect(stageOf(playing)).toBe('playing');
  });

  it('maps every stage to its page', () => {
    expect(STAGE_PATH).toEqual({
      start: '/jouer/bienvenue',
      club: '/jouer/bienvenue/club',
      pack: '/jouer/bienvenue/pack',
      playing: '/jouer',
    });
  });
});
