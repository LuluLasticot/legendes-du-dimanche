// The automatic squad (spec §3, step 4): from the cards a player owns, the eleven of a formation
// with the fewest players out of position, then the best total of ratings and collective points,
// the seven best others on the bench. A greedy start (best rating per slot), then swaps while
// they improve. Pure and deterministic: the same cards give the same squad.

import { FORMATION_SLOTS, FORMATIONS, type Formation } from '@legendes/engine/sim/formations';
import { POSITION_LINE, type Position } from '@legendes/engine/sim/positions';
import type { PackCard } from '../packs.ts';
import { collectiveOf, type CollectiveMember } from './collective.ts';

export interface TeamSlot {
  readonly position: Position;
  /** Anchor on the pitch, from the team's point of view: x across, y from own goal (0) to attack (1). */
  readonly x: number;
  readonly y: number;
  readonly card: PackCard | null;
  readonly inPosition: boolean;
  readonly collective: number;
}

export interface TeamSheet {
  readonly formation: Formation;
  readonly slots: readonly TeamSlot[];
  readonly bench: readonly PackCard[];
  readonly collective: number;
  /** Ratings at their slots plus collective points: what the squad is chosen on. */
  readonly score: number;
  /** Mean of the eleven's ratings at their slots (0 for an empty slot), rounded. */
  readonly rating: number;
}

const BENCH = 7;
/** A player in his line but not his exact position plays at 85 %; elsewhere he does not play. */
const NEAR_POSITION = 0.85;
/** A player out of position costs more than any total of ratings: he plays only when no one can. */
const OUT_OF_POSITION = 10_000;
/** An empty slot costs even more: better a player out of position than nobody. */
const EMPTY = 100_000;

function fit(card: PackCard, position: Position): { value: number; inPosition: boolean } {
  const { positions, rating } = card.card.player;
  if (positions.includes(position)) return { value: rating, inPosition: true };
  const main = positions[0] ?? 'CM';
  const sameLine =
    position !== 'GK' && main !== 'GK' && POSITION_LINE[main] === POSITION_LINE[position];
  return { value: sameLine ? rating * NEAR_POSITION : 0, inPosition: false };
}

function membersOf(
  lineup: readonly (PackCard | null)[],
  positions: readonly Position[],
): (CollectiveMember | null)[] {
  return lineup.map((c, i) =>
    c
      ? {
          clubId: c.club.id,
          districtId: c.club.districtId,
          inPosition: fit(c, positions[i] as Position).inPosition,
        }
      : null,
  );
}

const valuesOf = (lineup: readonly (PackCard | null)[], positions: readonly Position[]): number[] =>
  lineup.map((c, i) => (c ? fit(c, positions[i] as Position).value : 0));

function score(lineup: readonly (PackCard | null)[], positions: readonly Position[]): number {
  const ratings = valuesOf(lineup, positions).reduce((a, b) => a + b, 0);
  return ratings + collectiveOf(membersOf(lineup, positions)).total;
}

/** What the squad maximises: no empty slot, then no one out of position, then the score. */
function objective(lineup: readonly (PackCard | null)[], positions: readonly Position[]): number {
  const members = membersOf(lineup, positions);
  const out = members.filter((m) => m !== null && !m.inPosition).length;
  const empty = members.filter((m) => m === null).length;
  return score(lineup, positions) - OUT_OF_POSITION * out - EMPTY * empty;
}

/** Weight of a card at a slot, for the assignment: null when he cannot play there at all. */
function weight(card: PackCard, position: Position): number | null {
  const f = fit(card, position);
  if (f.value === 0) return null;
  return f.inPosition ? f.value : f.value - OUT_OF_POSITION;
}

/**
 * Hungarian algorithm (minimum cost, rows ≤ columns): the column given to each row. Exact, so
 * the eleven never misses an in-position player for want of a three-way swap.
 */
function assignment(cost: readonly (readonly number[])[]): number[] {
  const n = cost.length;
  const m = cost[0]?.length ?? 0;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0);
  const way = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(Infinity);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0] as number;
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = (cost[i0 - 1]?.[j - 1] ?? 0) - (u[i0] as number) - (v[j] as number);
        if (cur < (minv[j] as number)) {
          minv[j] = cur;
          way[j] = j0;
        }
        if ((minv[j] as number) < delta) {
          delta = minv[j] as number;
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j] as number] = (u[p[j] as number] as number) + delta;
          v[j] = (v[j] as number) - delta;
        } else minv[j] = (minv[j] as number) - delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0] as number;
      p[j0] = p[j1] as number;
      j0 = j1;
    } while (j0 !== 0);
  }
  const rows = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) rows[(p[j] as number) - 1] = j - 1;
  return rows;
}

/** One card per player (the best copy), in a stable order. */
function distinct(cards: readonly PackCard[]): PackCard[] {
  const byPlayer = new Map<string, PackCard>();
  for (const c of [...cards].sort((a, b) => a.card.id.localeCompare(b.card.id))) {
    const seen = byPlayer.get(c.card.player.id);
    if (!seen || c.card.player.rating > seen.card.player.rating) byPlayer.set(c.card.player.id, c);
  }
  return [...byPlayer.values()];
}

export function autoSquad(cards: readonly PackCard[], formation: Formation): TeamSheet {
  const slots = FORMATION_SLOTS[formation];
  const positions = slots.map((s) => s.position);
  const pool = distinct(cards);
  // Start from the best assignment of cards to slots on ratings and positions alone (columns
  // past the cards are "nobody"), then let the swaps add the collectives.
  const columns = Math.max(pool.length, positions.length);
  const cost = positions.map((position) =>
    Array.from({ length: columns }, (_, j) => {
      const c = pool[j];
      const w = c ? weight(c, position) : null;
      return w === null ? EMPTY : -w;
    }),
  );
  let lineup: (PackCard | null)[] = assignment(cost).map((j, i) => {
    const c = pool[j];
    return c && weight(c, positions[i] as Position) !== null ? c : null;
  });

  // Swaps (slot ↔ slot, slot ↔ free card) while the total improves.
  let current = objective(lineup, positions);
  for (let improved = true; improved;) {
    improved = false;
    for (let i = 0; i < lineup.length; i++) {
      const candidates = [...pool.filter((c) => !lineup.includes(c)), ...lineup];
      for (const c of candidates) {
        if (c === null || c === lineup[i]) continue;
        const j = lineup.indexOf(c);
        const next = [...lineup];
        next[i] = c;
        if (j >= 0) next[j] = lineup[i] ?? null;
        const s = objective(next, positions);
        if (s > current + 1e-9) {
          lineup = next;
          current = s;
          improved = true;
        }
      }
    }
  }

  const members = membersOf(lineup, positions);
  const collective = collectiveOf(members);
  const values = valuesOf(lineup, positions);
  const bench = pool
    .filter((c) => !lineup.includes(c))
    .sort(
      (a, b) => b.card.player.rating - a.card.player.rating || a.card.id.localeCompare(b.card.id),
    )
    .slice(0, BENCH);
  return {
    formation,
    slots: slots.map((slot, i) => ({
      position: slot.position,
      x: slot.x,
      y: slot.y,
      card: lineup[i] ?? null,
      inPosition: members[i]?.inPosition ?? false,
      collective: collective.perPlayer[i] ?? 0,
    })),
    bench,
    collective: collective.total,
    score: score(lineup, positions),
    rating: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
  };
}

/** The automatic squad in the formation that suits the cards best: fewest out of position, then score. */
export function bestSquad(cards: readonly PackCard[]): TeamSheet {
  const out = (sheet: TeamSheet): number =>
    sheet.slots.filter((x) => x.card && !x.inPosition).length;
  let best: TeamSheet | null = null;
  for (const formation of FORMATIONS) {
    const sheet = autoSquad(cards, formation);
    if (!best || out(sheet) < out(best) || (out(sheet) === out(best) && sheet.score > best.score)) {
      best = sheet;
    }
  }
  if (!best) throw new Error('No formation');
  return best;
}
