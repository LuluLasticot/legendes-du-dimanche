// The automatic squad (spec §3, step 4): from the cards a player owns, the eleven of a formation
// with the best total of ratings and collective points, the seven best others on the bench. A
// greedy start (best rating per slot), then swaps while they improve the total. Pure and
// deterministic: the same cards give the same squad.

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
  /** Mean of the eleven's ratings at their slots (0 for an empty slot), rounded. */
  readonly rating: number;
}

const BENCH = 7;
/** A player in his line but not his exact position plays at 85 %; elsewhere he does not play. */
const NEAR_POSITION = 0.85;

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
  let lineup: (PackCard | null)[] = positions.map(() => null);

  // Greedy start: each slot takes the free card that fits it best.
  for (let i = 0; i < positions.length; i++) {
    let best: PackCard | null = null;
    let bestValue = 0;
    for (const c of pool) {
      if (lineup.includes(c)) continue;
      const value = fit(c, positions[i] as Position).value;
      if (value > bestValue) [best, bestValue] = [c, value];
    }
    lineup[i] = best;
  }

  // Swaps (slot ↔ slot, slot ↔ free card) while the total improves.
  let current = score(lineup, positions);
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
        const s = score(next, positions);
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
    rating: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
  };
}

/** The automatic squad in the formation that suits the cards best. */
export function bestSquad(cards: readonly PackCard[]): TeamSheet {
  let best: TeamSheet | null = null;
  let bestScore = -1;
  for (const formation of FORMATIONS) {
    const squad = autoSquad(cards, formation);
    const s = squad.rating * 11 + squad.collective;
    if (s > bestScore) [best, bestScore] = [squad, s];
  }
  if (!best) throw new Error('No formation');
  return best;
}
