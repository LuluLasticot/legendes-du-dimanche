// Determinism check under Deno (the Supabase Edge Functions runtime).
// Run with: pnpm test:deno  (deno test --no-config --no-lock test/determinism.deno.ts)
import { DETERMINISM_GOLDEN, runDeterminismScenario } from '../src/selftest/index.ts';

// Minimal typing so the file also type-checks under tsc (no Deno types in the workspace).
declare const Deno: { test(name: string, fn: () => void): void };

Deno.test('engine determinism fingerprint matches the committed golden', () => {
  for (let run = 0; run < 100; run++) {
    const report = runDeterminismScenario();
    if (report.digest !== DETERMINISM_GOLDEN.digest || report.words !== DETERMINISM_GOLDEN.words) {
      throw new Error(
        `Run ${run}: expected ${DETERMINISM_GOLDEN.digest}/${DETERMINISM_GOLDEN.words}, ` +
          `got ${report.digest}/${report.words}`,
      );
    }
  }
});
