// Statistical checks of the match engine (ROADMAP Phase 2): series of matches between demo
// squads, summarised. Shared by the CI test (a few thousand matches) and `pnpm stats` (10,000).

import { demoTeam } from './demo-teams.ts';
import { simulateMatch } from './match.ts';
import type { MatchConditions } from './model.ts';

export interface SeriesSummary {
  readonly matches: number;
  readonly home: number;
  readonly draw: number;
  readonly away: number;
  readonly goals: number;
  readonly yellows: number;
  readonly reds: number;
  readonly subs: number;
  readonly penalties: number;
  /** Share of matches by total goals (index 0…6, last = 6 or more). */
  readonly totals: readonly number[];
}

const GRASS: MatchConditions = { surface: 'grass', rain: false, windSpeed: 0, windDirection: 0 };

/** `n` matches between demo squads rated `home` and `away` (seeds `seed`…`seed + n − 1`). */
export function matchSeries(
  n: number,
  home: number,
  away: number,
  seed = 0,
  conditions: MatchConditions = GRASS,
): SeriesSummary {
  let h = 0;
  let d = 0;
  let goals = 0;
  let yellows = 0;
  let reds = 0;
  let subs = 0;
  let penalties = 0;
  const totals = [0, 0, 0, 0, 0, 0, 0];
  for (let i = seed; i < seed + n; i++) {
    const m = simulateMatch({
      seed: i,
      home: demoTeam(i, { id: 'home', name: 'Home', rating: home }),
      away: demoTeam(i + 1_000_000, { id: 'away', name: 'Away', rating: away }),
      conditions,
    });
    const [a, b] = m.score;
    if (a > b) h++;
    else if (a === b) d++;
    goals += a + b;
    const bucket = Math.min(6, a + b);
    totals[bucket] = (totals[bucket] ?? 0) + 1;
    for (const s of m.stats) {
      yellows += s.yellows;
      reds += s.reds;
      subs += s.subs;
    }
    penalties += m.events.filter((e) => e.kind === 'penalty').length;
  }
  return {
    matches: n,
    home: h / n,
    draw: d / n,
    away: (n - h - d) / n,
    goals: goals / n,
    yellows: yellows / n,
    reds: reds / n,
    subs: subs / n,
    penalties: penalties / n,
    totals: totals.map((c) => c / n),
  };
}
