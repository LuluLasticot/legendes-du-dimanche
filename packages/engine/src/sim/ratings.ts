// Player ratings of a match (out of 10) and the man of the match (GDD §7.1: "note des joueurs,
// homme du match"). Computed from the events and the lineups: deterministic, no draws.

import type { MatchResult, Side } from './match.ts';
import type { MatchSetup } from './model.ts';
import { POSITION_LINE } from './positions.ts';
import { FORMATION_SLOTS } from './formations.ts';

export interface PlayerRating {
  readonly id: string;
  readonly side: Side;
  readonly name: string;
  readonly number: number;
  /** Minutes on the pitch (0 for an unused substitute). */
  readonly minutes: number;
  readonly goals: number;
  readonly saves: number;
  /** Rating out of 10, one decimal. */
  readonly rating: number;
}

export interface MatchRatings {
  readonly players: readonly PlayerRating[];
  /** Best rating overall (ties: goals, then minutes). */
  readonly manOfTheMatch: PlayerRating | null;
}

const clockKey = (e: { half: 1 | 2; t: number }): number => (e.half === 1 ? e.t : 1e5 + e.t);

export function matchRatings(setup: MatchSetup, result: MatchResult): MatchRatings {
  const halfTime = result.events.find((e) => e.kind === 'half-time');
  const firstHalf = halfTime?.t ?? 45 * 60;
  /** Elapsed match seconds (the second half's clock restarts at 45:00). */
  const elapsed = (e: { half: 1 | 2; t: number }): number =>
    e.half === 1 ? e.t : firstHalf + (e.t - 45 * 60);
  const end = elapsed({ half: 2, t: result.duration });
  const events = [...result.events].sort((a, b) => clockKey(a) - clockKey(b));

  const teams = [setup.home, setup.away] as const;
  const [homeGoals, awayGoals] = result.score;
  const goalsFor = (side: Side): number => (side === 0 ? homeGoals : awayGoals);
  const goalsAgainst = (side: Side): number => (side === 0 ? awayGoals : homeGoals);

  const out: PlayerRating[] = [];
  for (const side of [0, 1] as const) {
    const team = teams[side];
    const slots = FORMATION_SLOTS[team.formation];
    const lineSlot = new Map(team.lineup.map((id, i) => [id, slots[i]?.position ?? 'CM'] as const));
    const on = new Map<string, number>(team.lineup.map((id) => [id, 0]));
    const off = new Map<string, number>();
    const tally = new Map<string, { goals: number; saves: number; delta: number }>();
    const add = (
      id: string | null,
      d: Partial<{ goals: number; saves: number; delta: number }>,
    ): void => {
      if (!id) return;
      const t = tally.get(id) ?? { goals: 0, saves: 0, delta: 0 };
      tally.set(id, {
        goals: t.goals + (d.goals ?? 0),
        saves: t.saves + (d.saves ?? 0),
        delta: t.delta + (d.delta ?? 0),
      });
    };
    const mine = (id: string | null): boolean => !!id && team.players.some((p) => p.id === id);

    for (const e of events) {
      const at = elapsed(e);
      switch (e.kind) {
        case 'sub':
          if (e.team === side) {
            on.set(e.player ?? '', at);
            if (e.other) off.set(e.other, at);
          }
          break;
        case 'red':
          if (mine(e.player)) {
            off.set(e.player ?? '', at);
            add(e.player, { delta: -1.5 });
          }
          break;
        case 'goal':
          if (mine(e.player)) add(e.player, { goals: 1, delta: 1.1 });
          break;
        case 'save':
          if (mine(e.player)) add(e.player, { saves: 1, delta: 0.3 });
          else if (mine(e.other)) add(e.other, { delta: 0.1 });
          break;
        case 'block':
          if (mine(e.player)) add(e.player, { delta: 0.3 });
          break;
        case 'miss':
        case 'post':
          if (mine(e.player)) add(e.player, { delta: e.kind === 'post' ? 0 : -0.1 });
          break;
        case 'foul':
          if (mine(e.player)) add(e.player, { delta: -0.12 });
          break;
        case 'yellow':
          if (mine(e.player)) add(e.player, { delta: -0.4 });
          break;
        case 'offside':
          if (mine(e.player)) add(e.player, { delta: -0.1 });
          break;
        default:
          break;
      }
    }

    const result3 =
      goalsFor(side) > goalsAgainst(side) ? 0.3 : goalsFor(side) < goalsAgainst(side) ? -0.3 : 0;
    for (const p of team.players) {
      const start = on.get(p.id);
      const minutes =
        start === undefined ? 0 : Math.max(0, Math.round(((off.get(p.id) ?? end) - start) / 60));
      const t = tally.get(p.id) ?? { goals: 0, saves: 0, delta: 0 };
      let rating = 6 + t.delta;
      if (minutes > 0) {
        const position = lineSlot.get(p.id) ?? p.positions[0] ?? 'CM';
        const line = POSITION_LINE[position];
        const against = goalsAgainst(side);
        if (line === 'goalkeeper' || line === 'defence') {
          rating += against === 0 && minutes >= 60 ? (line === 'goalkeeper' ? 0.8 : 0.4) : 0;
          rating -= against * (line === 'goalkeeper' ? 0.3 : 0.15);
        }
        if (minutes >= 20) rating += result3;
      } else {
        rating = 0;
      }
      out.push({
        id: p.id,
        side,
        name: p.name,
        number: p.number,
        minutes,
        goals: t.goals,
        saves: t.saves,
        rating: minutes > 0 ? Math.round(Math.min(10, Math.max(3, rating)) * 10) / 10 : 0,
      });
    }
  }

  let best: PlayerRating | null = null;
  for (const p of out) {
    if (p.minutes === 0) continue;
    if (
      !best ||
      p.rating > best.rating ||
      (p.rating === best.rating &&
        (p.goals > best.goals || (p.goals === best.goals && p.minutes > best.minutes)))
    )
      best = p;
  }
  return { players: out, manOfTheMatch: best };
}
