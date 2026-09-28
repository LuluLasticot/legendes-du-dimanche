// Full statistical report of the match engine: `pnpm --filter @legendes/engine stats`.
import { matchSeries } from '../src/sim/index.ts';

const pct = (x: number): string => `${(x * 100).toFixed(1)} %`;
const t0 = performance.now();
console.log('Level        H / D / A                    goals  yellows  reds   subs  pens');
for (const [label, rating] of [
  ['District 9', 45],
  ['District 1', 55],
  ['Régional 1', 65],
  ['National 2', 72],
] as const) {
  const s = matchSeries(10_000, rating, rating);
  console.log(
    `${label.padEnd(12)} ${pct(s.home)} / ${pct(s.draw)} / ${pct(s.away)}   ${s.goals.toFixed(2)}   ${s.yellows.toFixed(2)}    ${s.reds.toFixed(3)}  ${s.subs.toFixed(1)}  ${s.penalties.toFixed(2)}`,
  );
}
console.log('\nRating gap → home win');
for (const gap of [0, 5, 10, 15, 20, 30]) {
  const s = matchSeries(10_000, 60 + gap / 2, 60 - gap / 2, 500_000);
  console.log(`  +${String(gap).padEnd(3)} ${pct(s.home)} (draw ${pct(s.draw)})`);
}
console.log(`\n${((performance.now() - t0) / 1000).toFixed(1)} s`);
