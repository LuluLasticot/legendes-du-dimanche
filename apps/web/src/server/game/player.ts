// What the game knows of a player, read with his own session (row-level security: his rows only).

import { z } from 'zod';
import { gameErrorFrom } from './errors.ts';
import { balanceOf, type GameDb } from './wallet.ts';

export interface ClosedPack {
  readonly id: string;
  readonly type: string;
  readonly source: string;
}

export interface PlayerState {
  readonly userId: string;
  readonly pseudo: string;
  readonly clubId: string | null;
  readonly credits: number;
  /** Closed packs, oldest first. */
  readonly packs: readonly ClosedPack[];
  /** Owned cards (copies included). */
  readonly cardIds: readonly string[];
}

const packRows = z.array(z.object({ id: z.string().uuid(), type: z.string(), source: z.string() }));

/** The player's state, or null when this client cannot see his profile (none, or not his). */
export async function loadPlayer(db: GameDb, userId: string): Promise<PlayerState | null> {
  const profile = await db
    .from('profiles')
    .select('pseudo, club_id')
    .eq('id', userId)
    .maybeSingle();
  if (profile.error) throw gameErrorFrom(profile.error);
  if (!profile.data) return null;
  const [packs, cards, credits] = await Promise.all([
    db
      .from('user_packs')
      .select('id, type, source')
      .eq('user_id', userId)
      .is('opened_at', null)
      .order('created_at'),
    db.from('card_items').select('card_id').eq('user_id', userId).order('created_at').order('id'),
    balanceOf(db, userId),
  ]);
  if (packs.error) throw gameErrorFrom(packs.error);
  if (cards.error) throw gameErrorFrom(cards.error);
  return {
    userId,
    pseudo: profile.data.pseudo,
    clubId: profile.data.club_id,
    credits,
    packs: packRows.parse(packs.data),
    cardIds: cards.data.map((c) => c.card_id),
  };
}

/** The id of the player's starter pack, opened or not (null before the club is chosen). */
export async function starterPackId(db: GameDb, userId: string): Promise<string | null> {
  const { data, error } = await db
    .from('user_packs')
    .select('id')
    .eq('user_id', userId)
    .eq('source', 'starter')
    .maybeSingle();
  if (error) throw gameErrorFrom(error);
  return data?.id ?? null;
}
