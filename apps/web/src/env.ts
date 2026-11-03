// Environment variables, validated with Zod at the boundary.
// Supabase keys stay optional until the first feature that needs them (auth, Phase 4).

import { z } from 'zod';

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  /** Where the converted character asset lives (default: served locally from /public). */
  NEXT_PUBLIC_CHARACTER_ASSETS_URL: z.string().min(1).optional(),
  /** Cloudflare Turnstile site key: with it, new guests pass a captcha (D-044). */
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
});

const serverSchema = publicSchema.extend({
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
});

const emptyToUndefined = (value: string | undefined): string | undefined =>
  value === undefined || value.trim() === '' ? undefined : value;

/** Public variables: safe to import from client components. */
export const publicEnv = publicSchema.parse({
  // Listed explicitly so Next.js inlines them in the client bundle.
  NEXT_PUBLIC_SUPABASE_URL: emptyToUndefined(process.env.NEXT_PUBLIC_SUPABASE_URL),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: emptyToUndefined(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: emptyToUndefined(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
});

/** Server variables: only call from server code. */
export function serverEnv(): z.infer<typeof serverSchema> {
  if (typeof window !== 'undefined') throw new Error('serverEnv() called in the browser');
  return serverSchema.parse({
    ...publicEnv,
    SUPABASE_SECRET_KEY: emptyToUndefined(process.env.SUPABASE_SECRET_KEY),
  });
}

/** The game needs Supabase: a clear error instead of a broken page when it is not configured. */
export function gameEnv(): { url: string; publishableKey: string; secretKey: string } {
  const env = serverEnv();
  if (
    !env.NEXT_PUBLIC_SUPABASE_URL ||
    !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    !env.SUPABASE_SECRET_KEY
  ) {
    throw new Error(
      'Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY)',
    );
  }
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    secretKey: env.SUPABASE_SECRET_KEY,
  };
}
