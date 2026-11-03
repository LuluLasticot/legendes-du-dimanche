// The player's saved eleven: what his matches are played with (the automatic one until he saves).

import { bestSquad, sheetOf, type TeamSheet } from '@legendes/data';
import { FORMATIONS } from '@legendes/engine/sim/formations';
import { z } from 'zod';
import { cardsOf } from './collection.ts';
import { gameErrorFrom } from './errors.ts';
import type { PlayerState } from './player.ts';
import type { GameDb } from './wallet.ts';

export async function saveSquad(db: GameDb, userId: string, sheet: TeamSheet): Promise<void> {
  const lineup = sheet.slots.map((s) => s.card?.card.id ?? '');
  const { error } = await db.rpc('save_squad', {
    p_user: userId,
    p_formation: sheet.formation,
    p_lineup: lineup,
  });
  if (error) throw gameErrorFrom(error);
}

const savedRow = z.object({ formation: z.enum(FORMATIONS), lineup: z.array(z.string()) });

/** The saved eleven on the cards owned now; the automatic one if none, or if a card is gone. */
export async function savedSheet(
  db: GameDb,
  player: PlayerState,
): Promise<TeamSheet & { saved: boolean }> {
  const cards = cardsOf(player.cardIds);
  const { data, error } = await db
    .from('user_squads')
    .select('formation, lineup')
    .eq('user_id', player.userId)
    .maybeSingle();
  if (error) throw gameErrorFrom(error);
  const row = data ? savedRow.safeParse(data) : null;
  const saved = row?.success ? sheetOf(cards, row.data.formation, row.data.lineup) : null;
  return saved ? { ...saved, saved: true } : { ...bestSquad(cards), saved: false };
}
