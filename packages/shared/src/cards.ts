// Card tiers, rarities and rating bands (GDD §5.2).

export const CARD_TIERS = ['bronze', 'silver', 'gold', 'special'] as const;
export type CardTier = (typeof CARD_TIERS)[number];

export const RARITIES = ['common', 'rare'] as const;
export type Rarity = (typeof RARITIES)[number];

export interface RatingRange {
  readonly min: number;
  readonly max: number;
}

export const RATING_MIN = 40;
export const RATING_MAX = 95;

/** Rating bands of the base tiers. Special cards (promos, legends) go up to {@link RATING_MAX}. */
export const TIER_RATING: Readonly<Record<Exclude<CardTier, 'special'>, RatingRange>> = {
  bronze: { min: 40, max: 64 },
  silver: { min: 65, max: 74 },
  gold: { min: 75, max: 82 },
};

/** Base tier of a non-special card from its overall rating. */
export function tierForRating(rating: number): Exclude<CardTier, 'special'> {
  if (rating <= TIER_RATING.bronze.max) return 'bronze';
  if (rating <= TIER_RATING.silver.max) return 'silver';
  return 'gold';
}

/** Fictional players and real players alike are adults only (non-negotiable rule). */
export const PLAYER_MIN_AGE = 18;
export const PLAYER_MAX_AGE = 45;

export const TRAITS = [
  'workhorse', // Poumon
  'poacher', // Renard des surfaces
  'thunderbolt', // Frappe de mule
  'defensive-leader', // Patron de la défense
  'aerial-threat', // Coiffeur
  'set-piece-specialist', // Tireur de coups de pied arrêtés
  'captain', // Capitaine
  'magician', // Magicien
  'former-pro', // Ancien pro
  'diesel', // Diesel
  'veteran', // Vétéran
  'third-half', // Troisième mi-temps
  'trash-talker', // Chambreur
  'hothead', // Râleur
  'one-footed', // Pied carré
  'late-arrival', // Arrivé à 14h58
  'fair-weather', // Frileux
] as const;
export type Trait = (typeof TRAITS)[number];

export type TraitPolarity = 'positive' | 'mixed' | 'negative';

export const TRAIT_POLARITY: Readonly<Record<Trait, TraitPolarity>> = {
  workhorse: 'positive',
  poacher: 'positive',
  thunderbolt: 'positive',
  'defensive-leader': 'positive',
  'aerial-threat': 'positive',
  'set-piece-specialist': 'positive',
  captain: 'positive',
  magician: 'positive',
  'former-pro': 'positive',
  diesel: 'mixed',
  veteran: 'mixed',
  'third-half': 'mixed',
  'trash-talker': 'mixed',
  hothead: 'negative',
  'one-footed': 'negative',
  'late-arrival': 'negative',
  'fair-weather': 'negative',
};
