// Base Zod schemas: every value crossing a boundary (network, storage, JSON) is parsed with one.

import { z } from 'zod';
import {
  CARD_TIERS,
  PLAYER_MAX_AGE,
  PLAYER_MIN_AGE,
  RARITIES,
  RATING_MAX,
  RATING_MIN,
  TRAITS,
} from '../cards.ts';
import { KIT_PATTERNS, PRECIPITATION, SURFACES } from '../conditions.ts';
import { COMPETITION_LEVELS, DISTRICT_MAX_RANK } from '../divisions.ts';
import { FORMATIONS } from '../formations.ts';
import { POSITIONS } from '../positions.ts';

export const positionSchema = z.enum(POSITIONS);
export const formationSchema = z.enum(FORMATIONS);
export const cardTierSchema = z.enum(CARD_TIERS);
export const raritySchema = z.enum(RARITIES);
export const traitSchema = z.enum(TRAITS);
export const surfaceSchema = z.enum(SURFACES);
export const kitPatternSchema = z.enum(KIT_PATTERNS);

/** Attribute value on the 1–99 scale. */
export const attributeValueSchema = z.number().int().min(1).max(99);

export const outfieldAttributesSchema = z.strictObject({
  pace: attributeValueSchema,
  shooting: attributeValueSchema,
  passing: attributeValueSchema,
  dribbling: attributeValueSchema,
  defending: attributeValueSchema,
  physical: attributeValueSchema,
});
export type OutfieldAttributes = z.infer<typeof outfieldAttributesSchema>;

export const goalkeeperAttributesSchema = z.strictObject({
  diving: attributeValueSchema,
  handling: attributeValueSchema,
  kicking: attributeValueSchema,
  reflexes: attributeValueSchema,
  speed: attributeValueSchema,
  positioning: attributeValueSchema,
});
export type GoalkeeperAttributes = z.infer<typeof goalkeeperAttributesSchema>;

export const divisionRefSchema = z
  .strictObject({
    level: z.enum(COMPETITION_LEVELS),
    rank: z.number().int().min(1).max(DISTRICT_MAX_RANK),
  })
  .refine((d) => d.level !== 'national' || d.rank === 1 || d.rank === 2, {
    message: 'National divisions are N1 and N2 only (Ligue 3 is professional)',
  })
  .refine((d) => d.level !== 'regional' || d.rank <= 4, {
    message: 'Regional divisions go from R1 to R4',
  });

const cardBaseSchema = z.strictObject({
  id: z.uuid(),
  identityId: z.uuid(),
  clubId: z.uuid(),
  displayName: z.string().trim().min(1).max(24),
  rating: z.number().int().min(RATING_MIN).max(RATING_MAX),
  tier: cardTierSchema,
  rarity: raritySchema,
  secondaryPositions: z.array(positionSchema).max(3),
  preferredFoot: z.enum(['left', 'right']),
  weakFoot: z.number().int().min(1).max(5),
  skillMoves: z.number().int().min(1).max(5),
  age: z.number().int().min(PLAYER_MIN_AGE).max(PLAYER_MAX_AGE),
  heightCm: z.number().int().min(150).max(210),
  traits: z.array(traitSchema).max(3),
});

/** A player card definition. Discriminated on the position: goalkeepers have their own attributes. */
export const playerCardSchema = z.discriminatedUnion('kind', [
  cardBaseSchema.extend({
    kind: z.literal('outfield'),
    position: positionSchema.exclude(['GK']),
    attributes: outfieldAttributesSchema,
  }),
  cardBaseSchema.extend({
    kind: z.literal('goalkeeper'),
    position: z.literal('GK'),
    attributes: goalkeeperAttributesSchema,
  }),
]);
export type PlayerCard = z.infer<typeof playerCardSchema>;

export const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, 'Expected #rrggbb');

export const clubSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(2).max(80),
  city: z.string().trim().min(1).max(80),
  districtId: z.uuid(),
  division: divisionRefSchema,
  colors: z.array(hexColorSchema).min(2).max(3),
  kitPattern: kitPatternSchema,
  stadium: z.strictObject({
    name: z.string().trim().min(1).max(80),
    surface: surfaceSchema,
  }),
  foundedYear: z.number().int().min(1850).max(2100).optional(),
});
export type Club = z.infer<typeof clubSchema>;

export const matchConditionsSchema = z.strictObject({
  surface: surfaceSchema,
  precipitation: z.enum(PRECIPITATION),
  /** Wind speed in m/s and direction in radians (0 = towards the home team's attacking goal). */
  wind: z.strictObject({
    speed: z.number().min(0).max(25),
    direction: z.number().min(-Math.PI).max(Math.PI),
  }),
  night: z.boolean(),
});
export type MatchConditions = z.infer<typeof matchConditionsSchema>;
