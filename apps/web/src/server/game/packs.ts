// Packs: chosen club and starter pack, purchases, and opening. The draw happens here, on the
// server, with a seed the player never sees before the result; the database checks the cards
// exist and records the opening atomically (rule 2).

import { getClub, openPack, openStarterPack, PACKS, type PackType } from '@legendes/data';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { GameError, gameErrorFrom } from './errors.ts';
import type { GameDb } from './wallet.ts';

const uuid = z.string().uuid();
const cardIds = z.array(z.string().min(1));

/** Chooses the starting club and gives the starter pack, in one step. Safe to repeat. */
export async function chooseClub(db: GameDb, userId: string, clubId: string): Promise<string> {
  const { data, error } = await db.rpc('choose_club', { p_user: userId, p_club: clubId });
  if (error) throw gameErrorFrom(error);
  return uuid.parse(data);
}

/** Buys a pack with credits. The price is the game's, never the client's. */
export async function buyPack(
  db: GameDb,
  userId: string,
  type: PackType,
  requestId: string,
): Promise<string> {
  const { data, error } = await db.rpc('grant_pack', {
    p_user: userId,
    p_type: type,
    p_source: 'shop',
    p_price: PACKS[type].price,
    p_request: requestId,
  });
  if (error) throw gameErrorFrom(error);
  return uuid.parse(data);
}

export interface OpenedCards {
  readonly packId: string;
  readonly type: string;
  /** Card ids, the least valuable first (the picture of each is recomputed from its id). */
  readonly cardIds: readonly string[];
}

/** Opens a closed pack. Repeating the same request returns the cards already recorded. */
export async function openUserPack(
  db: GameDb,
  userId: string,
  packId: string,
  requestId: string,
): Promise<OpenedCards> {
  const found = await db
    .from('user_packs')
    .select('type')
    .eq('id', packId)
    .eq('user_id', userId)
    .maybeSingle();
  if (found.error) throw gameErrorFrom(found.error);
  if (!found.data) throw new GameError('pack_not_found');
  const type = found.data.type;

  const seed = randomBytes(12).toString('hex');
  const cards = await draw(db, userId, type, seed);
  const { data, error } = await db.rpc('open_pack', {
    p_user: userId,
    p_pack: packId,
    p_seed: seed,
    p_cards: cards,
    p_request: requestId,
  });
  if (error) throw gameErrorFrom(error);
  return { packId, type, cardIds: cardIds.parse(data) };
}

async function draw(db: GameDb, userId: string, type: string, seed: string): Promise<string[]> {
  if (type === 'starter') {
    const profile = await db.from('profiles').select('club_id').eq('id', userId).maybeSingle();
    if (profile.error) throw gameErrorFrom(profile.error);
    const club = getClub(profile.data?.club_id ?? '');
    if (!club) throw new GameError('club_not_chosen');
    return openStarterPack(club, seed).cards.map((c) => c.card.id);
  }
  if (!(type in PACKS)) throw new GameError('invalid_pack');
  return openPack(type as PackType, seed).cards.map((c) => c.card.id);
}
