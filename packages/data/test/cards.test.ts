import { describe, expect, it } from 'vitest';
import { RATING_MAX } from '@legendes/shared';
import { cardOf, cardVariantsOf, generateSquad, WORLD, type Player } from '../src/index.ts';

const players: Player[] = WORLD.clubs.slice(0, 40).flatMap((c) => [...generateSquad(c).players]);

describe('cards', () => {
  it('base card: the player as he is, with his own tier and rarity', () => {
    const p = players[0] as Player;
    expect(cardOf(p)).toEqual({
      id: p.id,
      variant: 'base',
      player: p,
      tier: p.tier,
      rarity: p.rarity,
      boost: 0,
    });
  });

  it('team of the weekend: boosted by exactly 3 to 6, special and rare, deterministic', () => {
    for (const p of players) {
      const card = cardOf(p, 'weekend');
      expect(cardOf(p, 'weekend')).toEqual(card);
      expect(card.id).toBe(`${p.id}~weekend`);
      expect(card.tier).toBe('special');
      expect(card.rarity).toBe('rare');
      expect(card.player.rating).toBeLessThanOrEqual(RATING_MAX);
      // Every attribute rises by the same amount: the rating rises by it too, unless capped at 99.
      if (card.player.rating < RATING_MAX) {
        expect(card.boost).toBeGreaterThanOrEqual(3);
        expect(card.boost).toBeLessThanOrEqual(6);
      }
      expect(card.player.attributes.pace).toBeGreaterThanOrEqual(p.attributes.pace);
      expect(card.player.displayName).toBe(p.displayName);
    }
  });

  it('former pro: only for players with the trait', () => {
    const pro = players.find((p) => p.traits.includes('former-pro'));
    const amateur = players.find((p) => !p.traits.includes('former-pro'));
    expect(pro).toBeDefined();
    expect(cardVariantsOf(pro as Player)).toContain('former-pro');
    const card = cardOf(pro as Player, 'former-pro');
    expect(card.player.composure).toBeGreaterThan((pro as Player).composure - 1);
    expect(card.boost).toBeGreaterThanOrEqual(1);
    expect(() => cardOf(amateur as Player, 'former-pro')).toThrow(/no former-pro card/);
  });
});
