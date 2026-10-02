// Finding a card from its id (public card pages, share images): the id says which club and
// season the player belongs to, his squad is regenerated, then the card is drawn again. No
// database: the same id always gives the same card.

import { getClub } from '../world.ts';
import { SEASON, type Club } from '../schema.ts';
import { CARD_VARIANTS, cardOf, cardVariantsOf, type Card, type CardVariant } from './cards.ts';
import { generateSquad } from './generate.ts';

/** `<club id>-<season>-<nn>` then, for a special card, `~<variant>`. */
const CARD_ID = /^(.+)-(\d{4}-\d{2})-(\d{2})(?:~([a-z-]+))?$/;

export interface FoundCard {
  readonly card: Card;
  readonly club: Club;
}

/** The card with this id, or null when no player or variant matches it. */
export function findCard(id: string): FoundCard | null {
  const match = CARD_ID.exec(id);
  if (!match) return null;
  const [, clubId, season, , variantText] = match;
  const club = getClub(clubId ?? '');
  // Only the current season: a public URL must not make up squads for any year asked.
  if (!club || season !== SEASON) return null;
  const variant = (variantText ?? 'base') as CardVariant;
  if (!CARD_VARIANTS.includes(variant) || (variantText !== undefined && variant === 'base')) {
    return null;
  }
  const playerId = id.split('~')[0];
  const player = generateSquad(club, season).players.find((p) => p.id === playerId);
  if (!player || !cardVariantsOf(player).includes(variant)) return null;
  return { card: cardOf(player, variant), club };
}
