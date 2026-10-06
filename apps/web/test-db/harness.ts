// Clients of the local Supabase stack for the database tests: the service role (what the server
// uses) and guests (what a visitor is: an anonymous account with the public key only).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is missing. Run the tests with \`pnpm --filter @legendes/web test:db\` ` +
        '(it reads apps/web/.env.local, filled from `pnpm db:start`).',
    );
  }
  return value;
}

const options = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export type Db = SupabaseClient;

// The clients are typed with the generated `Database` once the first migration exists (Task 3).
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const admin: Db = createClient(
  env('NEXT_PUBLIC_SUPABASE_URL'),
  env('SUPABASE_SECRET_KEY'),
  options,
);

export function anonymousClient(): Db {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return createClient(
    env('NEXT_PUBLIC_SUPABASE_URL'),
    env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    options,
  );
}

export interface Guest {
  readonly id: string;
  readonly client: Db;
}

/** A new visitor: an anonymous account, signed in with the public key. */
export async function newGuest(): Promise<Guest> {
  const client = anonymousClient();
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) throw new Error(`Anonymous sign-in failed: ${error?.message}`);
  return { id: data.user.id, client };
}
