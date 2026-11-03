import { GameError, type GameErrorCode } from '@/server/game/errors';

/** The message key of an error shown to the player (never its raw message). */
export const errorKey = (error: unknown): GameErrorCode =>
  error instanceof GameError ? error.code : 'unexpected';
