import { describe, expect, it } from 'vitest';
import {
  autoSquad,
  bestSquad,
  cardOf,
  generateSquad,
  openStarterPack,
  WORLD,
  type PackCard,
} from '../src/index.ts';
import { FORMATIONS } from '@legendes/engine/sim/formations';

const d5 = WORLD.clubs.find((c) => c.divisionId === 'escaut-d5')!;
const n2 = WORLD.clubs.find((c) => c.divisionId.startsWith('n2'))!;

describe('the automatic squad', () => {
  it('fields eleven different players, a keeper in goal, from a starter pack of any division', () => {
    for (const club of [d5, n2]) {
      const squad = bestSquad(openStarterPack(club, 'auto').cards);
      const cards = squad.slots.map((s) => s.card);
      expect(cards.every((c) => c !== null)).toBe(true);
      expect(new Set(cards.map((c) => c!.card.player.id)).size).toBe(11);
      expect(squad.slots[0]!.position).toBe('GK');
      expect(squad.slots[0]!.card!.card.player.positions[0]).toBe('GK');
      expect(squad.bench).toHaveLength(7);
    }
  });

  it('never plays the same player twice, even with two copies of his card', () => {
    const pack = openStarterPack(d5, 'dup').cards;
    const squad = autoSquad([...pack, ...pack], '4-4-2');
    const ids = squad.slots.flatMap((s) => (s.card ? [s.card.card.player.id] : []));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(11);
  });

  it('leaves slots empty when the collection is short', () => {
    const outfield = openStarterPack(d5, 'short').cards.filter(
      (c) => c.card.player.positions[0] !== 'GK',
    );
    const squad = autoSquad(outfield.slice(0, 5), '4-4-2');
    expect(squad.slots[0]!.card).toBeNull();
    expect(squad.slots.filter((s) => s.card !== null)).toHaveLength(5);
  });

  it('values collectives: a squad of a single club gets its 33 points', () => {
    const own: PackCard[] = generateSquad(d5).players.map((p) => ({ card: cardOf(p), club: d5 }));
    expect(bestSquad(own).collective).toBe(33);
  });

  it('is deterministic', () => {
    const cards = openStarterPack(n2, 'det').cards;
    expect(bestSquad(cards)).toEqual(bestSquad(cards));
  });

  it('can always field a 4-3-3 entirely in position from a starter pack', () => {
    for (const club of WORLD.clubs) {
      const sheet = autoSquad(openStarterPack(club, 'shape').cards, '4-3-3');
      expect(
        sheet.slots.filter((s) => !s.inPosition).map((s) => s.position),
        club.id,
      ).toEqual([]);
    }
  });

  it('picks the formation with the fewest players out of position, then the best exact score', () => {
    for (const club of WORLD.clubs) {
      const cards = openStarterPack(club, 'pick').cards;
      const out = (s: ReturnType<typeof autoSquad>) => s.slots.filter((x) => !x.inPosition).length;
      const best = bestSquad(cards);
      for (const f of FORMATIONS) {
        const other = autoSquad(cards, f);
        expect(out(best), `${club.id} ${f}`).toBeLessThanOrEqual(out(other));
        if (out(other) === out(best)) expect(best.score).toBeGreaterThanOrEqual(other.score);
      }
    }
  });
});
