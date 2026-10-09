'use server';

// The welcome's writes. Each checks the session, then calls the server modules with the service
// role (rule 2): the browser never writes anything of value.

import { getClub } from '@legendes/data';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/admin';
import { sessionClient } from '@/lib/supabase/session';
import { errorKey } from '@/lib/game-errors';
import { GameError, type GameErrorCode } from '@/server/game/errors';
import { chooseClub, openUserPack } from '@/server/game/packs';
import { starterPackId } from '@/server/game/player';
import { claimWelcome } from '@/server/game/wallet';

async function sessionUser(): Promise<string | null> {
  const db = await sessionClient();
  const { data } = await db.auth.getUser();
  return data.user?.id ?? null;
}

/** "Commencer": an anonymous account (no form), and the welcome credits. */
export async function startAsGuest(): Promise<void> {
  let userId = await sessionUser();
  if (!userId) {
    const db = await sessionClient();
    const { data, error } = await db.auth.signInAnonymously();
    if (error || !data.user) throw new GameError('unexpected', error?.message);
    userId = data.user.id;
  }
  await claimWelcome(adminClient(), userId);
  redirect('/jouer/bienvenue/club');
}

const clubForm = z.object({
  clubId: z
    .string()
    .min(1)
    .refine((id) => getClub(id) !== undefined),
});

export async function pickClub(form: FormData): Promise<void> {
  const userId = await sessionUser();
  if (!userId) redirect('/jouer/bienvenue');
  const { clubId } = clubForm.parse({ clubId: form.get('clubId') });
  await chooseClub(adminClient(), userId, clubId);
  redirect('/jouer/bienvenue/pack');
}

/** What the starter opening gets back: its cards, or the code of a message to show. */
export type StarterResult =
  | { readonly ok: true; readonly cardIds: readonly string[] }
  | { readonly ok: false; readonly error: GameErrorCode };

/**
 * Opens the starter pack. The pack's id is the request id: asked again (a reload, a lost answer),
 * even once the pack is open, it gives the same cards. Errors come back as codes: a Server
 * Action's thrown error does not reach the browser.
 */
export async function openStarter(): Promise<StarterResult> {
  try {
    const userId = await sessionUser();
    if (!userId) throw new GameError('profile_not_found');
    const packId = await starterPackId(await sessionClient(), userId);
    if (!packId) throw new GameError('club_not_chosen');
    const opened = await openUserPack(adminClient(), userId, packId, packId);
    return { ok: true, cardIds: opened.cardIds };
  } catch (error) {
    console.error(error);
    return { ok: false, error: errorKey(error) };
  }
}
