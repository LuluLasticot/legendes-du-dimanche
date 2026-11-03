import { describe, expect, it } from 'vitest';
import messages from '../../messages/fr.json';
import { GAME_ERROR_CODES, GameError } from '@/server/game/errors';
import { errorKey } from './game-errors';

const errors: Record<string, string | undefined> =
  (messages as { game: { errors?: Record<string, string> } }).game.errors ?? {};

describe('game errors', () => {
  it('has a French message for every code', () => {
    for (const code of GAME_ERROR_CODES) expect(errors[code], code).toBeTruthy();
  });

  it('maps a GameError to its code and anything else to unexpected', () => {
    expect(errorKey(new GameError('insufficient_funds'))).toBe('insufficient_funds');
    expect(errorKey(new Error('boom'))).toBe('unexpected');
  });
});
