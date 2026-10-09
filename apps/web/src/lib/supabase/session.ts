// The visitor's own Supabase client: his session lives in cookies, row-level security applies.
import 'server-only';
import type { Database } from '@legendes/shared';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { gameEnv } from '@/env';

export async function sessionClient() {
  const { url, publishableKey } = gameEnv();
  const store = await cookies();
  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component, which cannot set cookies: the proxy refreshes them.
        }
      },
    },
  });
}
