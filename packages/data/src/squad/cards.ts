// The cards of a player (GDD §5.2, §5.3): his base card, and the special versions a promo gives
// him. A card is recomputed from its id like the player it shows: `<player id>` for the base card,
// `<player id>~<variant>` for a special one.

import { Rng } from '@legendes/engine/rng';
import { POSITION_LINE } from '@legendes/engine/sim/positions';
import { RATING_MAX, type CardTier, type Rarity } from '@legendes/shared';
import type { Player } from './player.ts';

export const CARD_VARIANTS = ['base', 'weekend', 'former-pro'] as const;
/**
 * `weekend`: Onze du week-end, the best players of a matchday, boosted by 3 to 6 (black and gold).
 * `former-pro`: Ancien pro, a player who was a professional (only players with the trait).
 */
export type CardVariant = (typeof CARD_VARIANTS)[number];

export interface Card {
  /** Stable, URL-safe: the player id, then `~variant` for a special card. */
  readonly id: string;
  readonly variant: CardVariant;
  /** The player as the card shows him (boosted attributes and rating for a special card). */
  readonly player: Player;
  readonly tier: CardTier;
  readonly rarity: Rarity;
  /** Points added to the base rating (0 for the base card). */
  readonly boost: number;
}

const bump = (value: number, by: number): number => Math.min(99, value + by);

/** Every attribute of the player's line raised by `by`: the rating rises by `by` (weights sum to 1). */
function boosted(player: Player, by: number, composure = 0): Player {
  const keeper = POSITION_LINE[player.positions[0] ?? 'CM'] === 'goalkeeper';
  const attributes = keeper
    ? player.attributes
    : {
        pace: bump(player.attributes.pace, by),
        shooting: bump(player.attributes.shooting, by),
        passing: bump(player.attributes.passing, by),
        dribbling: bump(player.attributes.dribbling, by),
        defending: bump(player.attributes.defending, by),
        physical: bump(player.attributes.physical, by),
      };
  const k = player.keeper;
  const keeping = keeper
    ? {
        diving: bump(k.diving, by),
        handling: bump(k.handling, by),
        kicking: bump(k.kicking, by),
        reflexes: bump(k.reflexes, by),
        speed: bump(k.speed, by),
        positioning: bump(k.positioning, by),
      }
    : k;
  return {
    ...player,
    attributes,
    keeper: keeping,
    composure: bump(player.composure, composure),
    // The engine's rating of the new attributes is the same to within rounding: the card shows
    // the promised boost exactly.
    rating: Math.min(RATING_MAX, player.rating + by),
  };
}

/** The variants a player can have: every player can make the team of the weekend. */
export function cardVariantsOf(player: Player): CardVariant[] {
  return player.traits.includes('former-pro')
    ? ['base', 'weekend', 'former-pro']
    : ['base', 'weekend'];
}

/** A player's card. Deterministic: the same player and variant give the same card. */
export function cardOf(player: Player, variant: CardVariant = 'base'): Card {
  if (variant === 'base') {
    return {
      id: player.id,
      variant,
      player,
      tier: player.tier,
      rarity: player.rarity,
      boost: 0,
    };
  }
  if (!cardVariantsOf(player).includes(variant)) {
    throw new Error(`${player.id} has no ${variant} card`);
  }
  const by = variant === 'weekend' ? Rng.create(`card:${player.id}:${variant}`).int(3, 6) : 2;
  const shown = boosted(player, by, variant === 'former-pro' ? 8 : 0);
  return {
    id: `${player.id}~${variant}`,
    variant,
    player: shown,
    tier: 'special',
    rarity: 'rare',
    boost: shown.rating - player.rating,
  };
}
