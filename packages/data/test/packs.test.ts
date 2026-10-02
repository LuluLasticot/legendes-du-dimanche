import { describe, expect, it } from 'vitest';
import {
  CARD_CLASSES,
  cardClassOf,
  openPack,
  PACK_SIZE,
  PACK_TYPES,
  packOdds,
  PACKS,
  type CardClass,
  type PackType,
} from '../src/index.ts';

const classesOf = (type: PackType, seed: string): CardClass[] =>
  openPack(type, seed).cards.map((c) => cardClassOf(c.card));

describe('packs', () => {
  it('hold twelve cards whose odds add up to 1 in every slot', () => {
    for (const type of PACK_TYPES) {
      const def = PACKS[type];
      expect(def.slots.reduce((n, s) => n + s.count, 0)).toBe(PACK_SIZE);
      for (const { odds } of def.slots) {
        const sum = CARD_CLASSES.reduce((s, c) => s + (odds[c] ?? 0), 0);
        expect(sum).toBeCloseTo(1, 9);
      }
    }
  });

  it('are drawn deterministically, best card last, no player twice', () => {
    for (const type of PACK_TYPES) {
      const pack = openPack(type, 'seed-1');
      expect(openPack(type, 'seed-1')).toEqual(pack);
      expect(openPack(type, 'seed-2')).not.toEqual(pack);
      expect(pack.cards).toHaveLength(PACK_SIZE);
      expect(new Set(pack.cards.map((c) => c.card.player.id)).size).toBe(PACK_SIZE);
      const ranks = pack.cards.map((c) => CARD_CLASSES.indexOf(cardClassOf(c.card)));
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      for (const { card, club } of pack.cards) expect(card.player.clubId).toBe(club.id);
    }
  });

  it('keep the guarantees of the GDD (§9.4)', () => {
    const gold = new Set<CardClass>(['gold-common', 'gold-rare']);
    for (let i = 0; i < 300; i++) {
      const seed = `g${i}`;
      const bronze = classesOf('bronze', seed);
      expect(bronze.some((c) => c === 'bronze-rare' || c === 'weekend')).toBe(true);
      expect(bronze.every((c) => c.startsWith('bronze') || c === 'weekend')).toBe(true);
      const silver = classesOf('silver', seed);
      expect(silver.some((c) => c === 'silver-rare' || c === 'weekend')).toBe(true);
      const goldPack = openPack('gold', seed).cards;
      const golds = goldPack.filter(
        (c) => gold.has(cardClassOf(c.card)) || c.card.tier === 'special',
      );
      expect(golds.length).toBeGreaterThanOrEqual(3);
      const premium = classesOf('gold-premium', seed);
      expect(premium.filter((c) => c !== 'gold-common').length).toBeGreaterThanOrEqual(3);
    }
  });

  it('draw what the odds promise (4 000 gold packs)', () => {
    const n = 4000;
    const counts = new Map<CardClass, number>();
    let special = 0;
    for (let i = 0; i < n; i++) {
      const classes = classesOf('gold', `stat-${i}`);
      for (const c of classes) counts.set(c, (counts.get(c) ?? 0) + 1);
      if (classes.some((c) => c === 'weekend' || c === 'former-pro')) special++;
    }
    for (const o of packOdds('gold')) {
      const observed = (counts.get(o.cardClass) ?? 0) / n;
      // Three standard errors of a Poisson count, and a floor for the rare classes.
      const tolerance = 3 * Math.sqrt(o.expected / n) + 0.004;
      expect(Math.abs(observed - o.expected), o.cardClass).toBeLessThan(tolerance);
    }
    const promised = packOdds('gold')
      .filter((o) => o.cardClass === 'weekend' || o.cardClass === 'former-pro')
      .reduce((none, o) => none * (1 - o.atLeastOne), 1);
    expect(Math.abs(special / n - (1 - promised))).toBeLessThan(0.012);
  }, 60_000);

  it('show their odds rarest first, with the certain cards at 100 %', () => {
    const odds = packOdds('gold-premium');
    expect(odds[0]?.cardClass).toBe('weekend');
    const rare = odds.find((o) => o.cardClass === 'gold-rare');
    expect(rare?.atLeastOne).toBeGreaterThan(0.99);
    expect(odds.reduce((s, o) => s + o.expected, 0)).toBeCloseTo(PACK_SIZE, 9);
  });
});
