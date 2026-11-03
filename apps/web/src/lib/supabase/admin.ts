// The server's own client (service role): the only one allowed to write anything of value.
import 'server-only';
import type { Database } from '@legendes/shared';
import { createClient } from '@supabase/supabase-js';
import { gameEnv } from '@/env';
import type { GameDb } from '@/server/game/wallet';

export function adminClient(): GameDb {
  const { url, secretKey } = gameEnv();
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
