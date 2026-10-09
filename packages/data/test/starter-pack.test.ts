import { describe, expect, it } from 'vitest';
import { POSITION_LINE } from '@legendes/engine/sim/positions';
import {
  cardClassOf,
  cardValue,
  openStarterPack,
  STARTER_CLUB_CARDS,
  STARTER_MIX,
  STARTER_PACK_SIZE,
  WORLD,
  type CardClass,
  type PackCard,
} from '../src/index.ts';

const SEEDS = ['a', 'b'];
const TIERS = ['bronze', 'silver', 'gold'] as const;
type Tier = (typeof TIERS)[number];

const tierOf = (c: PackCard): Tier => cardClassOf(c.card).split('-')[0] as Tier;
const countTiers = (cards: readonly PackCard[]): Record<Tier, number> => {
  const out = { bronze: 0, silver: 0, gold: 0 };
  for (const c of cards) out[tierOf(c)]++;
  return out;
};

/** Every club of the pilot, from District 5 to National 2, with its packs. */
const packs = WORLD.clubs.flatMap((club) =>
  SEEDS.map((seed) => {
    const pack = openStarterPack(club, seed);
    const own = pack.cards.filter((c) => c.club.id === club.id);
    const others = pack.cards.filter((c) => c.club.id !== club.id);
    return { club, pack, own, others };
  }),
);

describe('the starter pack', () => {
  it('is deterministic, and the seed changes it', () => {
    const club = WORLD.clubs[0]!;
    expect(openStarterPack(club, 'x')).toEqual(openStarterPack(club, 'x'));
    expect(openStarterPack(club, 'x')).not.toEqual(openStarterPack(club, 'y'));
  });

  it('holds 18 cards, 8 from the chosen club and the rest from several others, no player twice', () => {
    for (const { club, pack, own, others } of packs) {
      expect(pack.type).toBe('starter');
      expect(pack.clubId).toBe(club.id);
      expect(pack.cards).toHaveLength(STARTER_PACK_SIZE);
      expect(own).toHaveLength(STARTER_CLUB_CARDS);
      expect(new Set(others.map((c) => c.club.id)).size).toBeGreaterThanOrEqual(3);
      expect(new Set(pack.cards.map((c) => c.card.player.id)).size).toBe(STARTER_PACK_SIZE);
    }
  });

  it('always makes a valid squad: 2 keepers, 6 defenders, 6 midfielders, 4 forwards', () => {
    for (const { pack } of packs) {
      const lines = pack.cards.map((c) => POSITION_LINE[c.card.player.positions[0] ?? 'CM']);
      const count = (line: string): number => lines.filter((l) => l === line).length;
      expect([count('goalkeeper'), count('defence'), count('midfield'), count('attack')]).toEqual([
        2, 6, 6, 4,
      ]);
    }
  });

  it('has no big rare: no rare gold, no promo', () => {
    const allowed = new Set<CardClass>([
      'bronze-common',
      'bronze-rare',
      'silver-common',
      'silver-rare',
      'gold-common',
    ]);
    for (const { pack } of packs) {
      for (const c of pack.cards) expect(allowed.has(cardClassOf(c.card))).toBe(true);
    }
  });

  it('gives every club the same mix when its own cards fit in it', () => {
    let checked = 0;
    for (const { own, pack } of packs) {
      const mine = countTiers(own);
      if (TIERS.some((t) => mine[t] > STARTER_MIX[t])) continue;
      expect(countTiers(pack.cards)).toEqual(STARTER_MIX);
      checked++;
    }
    expect(checked).toBeGreaterThan(packs.length / 2);
  });

  it('makes up for a strong club with weaker other cards, never stronger ones', () => {
    let strong = 0;
    for (const { own, others } of packs) {
      const mine = countTiers(own);
      const rest = countTiers(others);
      for (const t of TIERS)
        expect(rest[t]).toBeLessThanOrEqual(Math.max(0, STARTER_MIX[t] - mine[t]));
      if (mine.gold > STARTER_MIX.gold) strong++;
    }
    // The pilot has clubs whose eight cards are more gold than the mix: the rule is exercised.
    expect(strong).toBeGreaterThan(0);
  });

  it('gives every club about the same strength', () => {
    const score = (n: Record<Tier, number>): number =>
      (n.bronze + 2 * n.silver + 3 * n.gold) / STARTER_PACK_SIZE;
    const target = score(STARTER_MIX);
    for (const { pack } of packs) {
      expect(Math.abs(score(countTiers(pack.cards)) - target)).toBeLessThanOrEqual(0.25);
    }
  });

  it('shows the best card last', () => {
    const values = packs[0]!.pack.cards.map((c) => cardValue(c.card));
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
});
