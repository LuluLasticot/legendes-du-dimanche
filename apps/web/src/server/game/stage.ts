// Where a visitor belongs: the welcome steps come in order, the game shell only after them.

import type { PlayerState } from './player.ts';

export type Stage = 'start' | 'club' | 'pack' | 'playing';

export const STAGE_PATH = {
  start: '/jouer/bienvenue',
  club: '/jouer/bienvenue/club',
  pack: '/jouer/bienvenue/pack',
  playing: '/jouer',
} as const satisfies Readonly<Record<Stage, string>>;

export function stageOf(state: PlayerState | null): Stage {
  if (!state) return 'start';
  if (!state.clubId) return 'club';
  if (state.packs.some((p) => p.source === 'starter')) return 'pack';
  return 'playing';
}
