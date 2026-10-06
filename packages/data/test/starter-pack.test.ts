import { describe, expect, it } from 'vitest';
import { POSITION_LINE } from '@legendes/engine/sim/positions';
import {
  cardClassOf,
  cardValue,
  clubsOf,
  openStarterPack,
  STARTER_CLUB_CARDS,
  STARTER_MAX_SILVER,
  STARTER_PACK_SIZE,
  type CardClass,
} from '../src/index.ts';

const starters = clubsOf({ divisionId: 'escaut-d5' });
const SEEDS = ['a', 'b', 'c', 'd', 'e', 'f'];

describe('the starter pack', () => {
  it('has enough clubs to test', () => {
    expect(starters.length).toBeGreaterThanOrEqual(30);
  });

  it('is deterministic, and the seed changes it', () => {
    const club = starters[0]!;
    expect(openStarterPack(club, 'x')).toEqual(openStarterPack(club, 'x'));
    expect(openStarterPack(club, 'x')).not.toEqual(openStarterPack(club, 'y'));
  });

  it('holds 18 cards, 11 from the chosen club, no player twice', () => {
    for (const club of starters) {
      for (const seed of SEEDS) {
        const pack = openStarterPack(club, seed);
        expect(pack.type).toBe('starter');
        expect(pack.clubId).toBe(club.id);
        expect(pack.cards).toHaveLength(STARTER_PACK_SIZE);
        expect(pack.cards.filter((c) => c.club.id === club.id)).toHaveLength(STARTER_CLUB_CARDS);
        expect(new Set(pack.cards.map((c) => c.card.player.id)).size).toBe(STARTER_PACK_SIZE);
        for (const { club: other } of pack.cards) expect(other.districtId).toBe(club.districtId);
      }
    }
  });

  it('always makes a valid squad: 2 keepers, 6 defenders, 6 midfielders, 4 forwards', () => {
    for (const club of starters) {
      for (const seed of SEEDS) {
        const lines = openStarterPack(club, seed).cards.map(
          (c) => POSITION_LINE[c.card.player.positions[0] ?? 'CM'],
        );
        const count = (line: string): number => lines.filter((l) => l === line).length;
        expect([count('goalkeeper'), count('defence'), count('midfield'), count('attack')]).toEqual(
          [2, 6, 6, 4],
        );
      }
    }
  });

  it('has no big rare: bronze and at most two silver, no gold, no promo', () => {
    const allowed = new Set<CardClass>([
      'bronze-common',
      'bronze-rare',
      'silver-common',
      'silver-rare',
    ]);
    for (const club of starters) {
      for (const seed of SEEDS) {
        const classes = openStarterPack(club, seed).cards.map((c) => cardClassOf(c.card));
        for (const cardClass of classes) expect(allowed.has(cardClass)).toBe(true);
        expect(classes.filter((c) => c.startsWith('silver')).length).toBeLessThanOrEqual(
          STARTER_MAX_SILVER,
        );
      }
    }
  });

  it('shows the best card last', () => {
    const cards = openStarterPack(starters[0]!, 'order').cards;
    const values = cards.map((c) => cardValue(c.card));
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
});
