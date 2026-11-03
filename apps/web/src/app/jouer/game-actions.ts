'use server';

// The game's writes after the welcome: matches, the saved eleven, packs. Each checks the session
// and calls the server modules with the service role (rule 2); errors come back as codes.

import { autoSquad, PACK_TYPES } from '@legendes/data';
import type { sim } from '@legendes/engine';
import { FORMATIONS } from '@legendes/engine/sim/formations';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { errorKey } from '@/lib/game-errors';
import { adminClient } from '@/lib/supabase/admin';
import type { GameErrorCode } from '@/server/game/errors';
import { GameError } from '@/server/game/errors';
import { cardsOf } from '@/server/game/collection';
import { finishMatch, startMatch, type MatchVerdict } from '@/server/game/matches';
import { advanceObjective } from '@/server/game/objectives';
import { buyPack, openUserPack } from '@/server/game/packs';
import { saveSquad } from '@/server/game/squads';
import { stageOf } from '@/server/game/stage';
import { currentPlayer } from './current';

type Failure = { readonly ok: false; readonly error: GameErrorCode };

async function playing() {
  const player = await currentPlayer();
  if (!player || stageOf(player) !== 'playing') throw new GameError('profile_not_found');
  return player;
}

async function attempt<T>(run: () => Promise<T>): Promise<({ readonly ok: true } & T) | Failure> {
  try {
    return { ok: true, ...(await run()) };
  } catch (error) {
    console.error(error);
    return { ok: false, error: errorKey(error) };
  }
}

/** The player's next match (or the one he left unfinished), frozen by the server. */
export async function startMyMatch() {
  return attempt(async (): Promise<{ matchId: string; setup: sim.MatchSetup }> =>
    startMatch(adminClient(), await playing(), randomUUID()),
  );
}

/** Full time: the server replays the inputs, and pays on the replay. */
export async function finishMyMatch(matchId: string, played: unknown) {
  return attempt(async (): Promise<{ verdict: MatchVerdict }> => {
    const player = await playing();
    return { verdict: await finishMatch(adminClient(), player.userId, matchId, played) };
  });
}

const formationSchema = z.enum(FORMATIONS);

/** "Valider ce onze": the automatic eleven of this formation becomes the player's own. */
export async function saveMySquad(form: FormData): Promise<void> {
  const player = await playing();
  const formation = formationSchema.parse(form.get('formation'));
  await saveSquad(adminClient(), player.userId, autoSquad(cardsOf(player.cardIds), formation));
  revalidatePath('/jouer', 'layout');
  redirect(`/jouer/equipes?formation=${formation}`);
}

/** Opens a pack of the inventory; asked again (a reload), gives the same cards. */
export async function openMyPack(packId: string) {
  return attempt(async (): Promise<{ cardIds: readonly string[] }> => {
    const player = await playing();
    const opened = await openUserPack(adminClient(), player.userId, z.uuid().parse(packId), packId);
    // Outside the opening's transaction, and idempotent: a failure here is caught up next time.
    if (opened.type !== 'starter')
      await advanceObjective(adminClient(), player.userId, 'pack_opened');
    return { cardIds: opened.cardIds };
  });
}

const buyForm = z.object({ type: z.enum(PACK_TYPES), request: z.uuid() });

/** Buys a pack with credits (the price is the game's), then opens it. One debit per request. */
export async function buyMyPack(form: FormData): Promise<void> {
  const player = await playing();
  const { type, request } = buyForm.parse({ type: form.get('type'), request: form.get('request') });
  let packId: string;
  try {
    packId = await buyPack(adminClient(), player.userId, type, request);
  } catch (error) {
    redirect(`/jouer/boutique?erreur=${errorKey(error)}`);
  }
  redirect(`/jouer/ouvrir/${packId}`);
}
