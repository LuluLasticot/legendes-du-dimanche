// The player's credits. The balance is the sum of the ledger: nothing here writes a balance.

import type { Database } from '@legendes/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { gameErrorFrom } from './errors.ts';

/** The service-role client (the server's own): it is passed in, never imported. */
export type GameDb = SupabaseClient<Database>;

/** Starting value, to balance with the economy simulator (GDD §9.2). */
export const WELCOME_CREDITS = 1000;

const credits = z.number().int();

/** Pays the welcome bonus once; returns the credits paid now (0 when already paid). */
export async function claimWelcome(db: GameDb, userId: string): Promise<number> {
  const { data, error } = await db.rpc('claim_welcome', {
    p_user: userId,
    p_amount: WELCOME_CREDITS,
  });
  if (error) throw gameErrorFrom(error);
  return credits.parse(data);
}

export async function balanceOf(db: GameDb, userId: string): Promise<number> {
  const { data, error } = await db
    .from('wallet_balances')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw gameErrorFrom(error);
  return data?.balance ?? 0;
}
