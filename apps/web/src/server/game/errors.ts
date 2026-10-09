// The failures the game's database functions raise on purpose (their exception message is the
// code), as typed errors the pages can turn into French messages.

export const GAME_ERROR_CODES = [
  'insufficient_funds',
  'pack_not_found',
  'pack_already_opened',
  'club_already_chosen',
  'club_not_eligible',
  'club_not_chosen',
  'unknown_card',
  'wrong_card_count',
  'empty_pack',
  'profile_not_found',
  'invalid_amount',
  'invalid_price',
  'invalid_pack',
  'unexpected',
] as const;
export type GameErrorCode = (typeof GAME_ERROR_CODES)[number];

export class GameError extends Error {
  constructor(
    readonly code: GameErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = 'GameError';
  }
}

/** A database error as a GameError: known exception messages keep their code. */
export function gameErrorFrom(error: { message: string }): GameError {
  const code = GAME_ERROR_CODES.find((c) => c !== 'unexpected' && c === error.message);
  return code ? new GameError(code) : new GameError('unexpected', error.message);
}
