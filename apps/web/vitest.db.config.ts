import { defineConfig } from 'vitest/config';

// Tests against the local Supabase stack (`pnpm db:start`). Run with `pnpm --filter @legendes/web test:db`:
// the script loads apps/web/.env.local. Not part of `pnpm test`: they need Docker.
export default defineConfig({
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: {
    include: ['test-db/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
