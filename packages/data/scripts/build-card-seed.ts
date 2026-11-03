// Writes the card definitions of the pilot for the database: ../../supabase/seed/20_cards.sql
// Run: pnpm --filter @legendes/data build:cards
// `--check` writes nothing and fails if the committed file is not what the generator produces
// (part of `pnpm test`, so CI catches a changed generator whose seed was not rebuilt).
import { readFileSync, writeFileSync } from 'node:fs';
import { allCardDefs, cardDefsSql } from '../src/card-defs.ts';

const target = new URL('../../../supabase/seed/20_cards.sql', import.meta.url);
const defs = allCardDefs();
const sql = cardDefsSql(defs);

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    // Missing: reported below.
  }
  if (current !== sql) {
    console.error(
      'Out of date: supabase/seed/20_cards.sql. Run: pnpm --filter @legendes/data build:cards',
    );
    process.exit(1);
  }
  console.log(`Card seed is current (${defs.length} cards).`);
} else {
  writeFileSync(target, sql);
  console.log(`Card seed built: ${defs.length} cards.`);
}
