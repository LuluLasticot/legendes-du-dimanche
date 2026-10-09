import { describe, expect, it } from 'vitest';
import { GameError, gameErrorFrom } from './errors.ts';

describe('gameErrorFrom', () => {
  it('turns a database exception into a typed error', () => {
    const error = gameErrorFrom({ message: 'insufficient_funds' });
    expect(error).toBeInstanceOf(GameError);
    expect(error.code).toBe('insufficient_funds');
  });

  it('keeps unknown failures as unexpected, with their message', () => {
    const error = gameErrorFrom({ message: 'connection refused' });
    expect(error.code).toBe('unexpected');
    expect(error.message).toBe('connection refused');
  });
});
