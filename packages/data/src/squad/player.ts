// A generated player: what a card and the match need to know (GDD §5.1), plain and serialisable.

import { z } from 'zod';
import { CARD_TIERS, PLAYER_MAX_AGE, PLAYER_MIN_AGE, RARITIES, TRAITS } from '@legendes/shared';
import { POSITIONS } from '@legendes/engine/sim/positions';
import { ARCHETYPES } from './archetypes.ts';

const rating = z.number().int().min(1).max(99);

export const APPEARANCE = {
  /** Skin tone, 1 (lightest) to 6 (darkest). */
  skin: [1, 2, 3, 4, 5, 6],
  hair: ['short', 'buzz', 'curly', 'long', 'tied', 'afro', 'bald'],
  hairColour: ['black', 'brown', 'blond', 'ginger', 'grey'],
  beard: ['none', 'stubble', 'full'],
  build: ['lean', 'average', 'stocky'],
} as const;

export const appearanceSchema = z.object({
  skin: z.number().int().min(1).max(6),
  hair: z.enum(APPEARANCE.hair),
  hairColour: z.enum(APPEARANCE.hairColour),
  beard: z.enum(APPEARANCE.beard),
  build: z.enum(APPEARANCE.build),
});
export type Appearance = z.infer<typeof appearanceSchema>;

export const playerSchema = z.object({
  id: z.string().min(1),
  clubId: z.string().min(1),
  season: z.string().regex(/^\d{4}-\d{2}$/),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  /** As printed on a card: "K. DELATTRE". */
  displayName: z.string().min(1),
  birthYear: z.number().int(),
  /** Age on the day the season starts. Adults only: never below 18 (rule 6 of CLAUDE.md). */
  age: z.number().int().min(PLAYER_MIN_AGE).max(PLAYER_MAX_AGE),
  number: z.number().int().min(1).max(99),
  /** Main position first, then secondary ones. */
  positions: z.array(z.enum(POSITIONS)).min(1).max(3),
  foot: z.enum(['left', 'right']),
  /** Weak foot and skill moves, 1 to 5 stars. */
  weakFoot: z.number().int().min(1).max(5),
  skillMoves: z.number().int().min(1).max(5),
  heightCm: z.number().int().min(150).max(210),
  /** VIT, TIR, PAS, DRI, DÉF, PHY (GDD §5.1). */
  attributes: z.object({
    pace: rating,
    shooting: rating,
    passing: rating,
    dribbling: rating,
    defending: rating,
    physical: rating,
  }),
  /** PLO, MAI, PIE, RÉF, VIT, PLA: high only for goalkeepers. */
  keeper: z.object({
    diving: rating,
    handling: rating,
    kicking: rating,
    reflexes: rating,
    speed: rating,
    positioning: rating,
  }),
  stamina: rating,
  composure: rating,
  archetype: z.enum(ARCHETYPES),
  traits: z.array(z.enum(TRAITS)).max(2),
  /** Overall rating at the main position (the engine's `playerRating`). */
  rating,
  tier: z.enum(CARD_TIERS),
  rarity: z.enum(RARITIES),
  appearance: appearanceSchema,
});
export type Player = z.infer<typeof playerSchema>;

export interface Squad {
  readonly clubId: string;
  readonly season: string;
  readonly players: readonly Player[];
}
