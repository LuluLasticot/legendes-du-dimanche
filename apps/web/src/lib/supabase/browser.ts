// The visitor's Supabase client in the browser: only to sign in (the session goes to cookies the
// server reads). It never writes game data: the tables refuse it (rule 2).

import type { Database } from '@legendes/shared';
import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/env';

export function browserClient() {
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const key = publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase is not configured');
  return createBrowserClient<Database>(url, key);
}
