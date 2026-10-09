// The player behind the request, and the guard that keeps each page to its welcome stage.
import 'server-only';
import { redirect } from 'next/navigation';
import { sessionClient } from '@/lib/supabase/session';
import { loadPlayer, type PlayerState } from '@/server/game/player';
import { STAGE_PATH, stageOf, type Stage } from '@/server/game/stage';

export async function currentPlayer(): Promise<PlayerState | null> {
  const db = await sessionClient();
  const { data } = await db.auth.getUser();
  return data.user ? loadPlayer(db, data.user.id) : null;
}

/** The player, when he is at one of these stages; otherwise he is sent where he belongs. */
export async function requireStage(...stages: readonly Stage[]): Promise<PlayerState> {
  const player = await currentPlayer();
  const actual = stageOf(player);
  if (!player || !stages.includes(actual)) redirect(STAGE_PATH[actual]);
  return player;
}
