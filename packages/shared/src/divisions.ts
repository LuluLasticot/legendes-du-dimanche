// The amateur pyramid (GDD §4.1). Ligue 3 is professional since 2026-07-01 and is excluded:
// National 2 is the top of the game's world. District depth varies from one district to another.

import type { RatingRange } from './cards.ts';

export const COMPETITION_LEVELS = ['national', 'regional', 'district'] as const;
export type CompetitionLevel = (typeof COMPETITION_LEVELS)[number];

/** A division: level plus rank inside the level (N2 = national 2, R1 = regional 1, D5 = district 5). */
export interface DivisionRef {
  readonly level: CompetitionLevel;
  readonly rank: number;
}

export const NATIONAL_RANKS = [2, 3] as const;
export const REGIONAL_MAX_RANK = 4;
/** Deepest district division modelled (some districts go below D5). */
export const DISTRICT_MAX_RANK = 9;

/** Base rating range of players of a division (GDD §5.2). Bands overlap on purpose. */
export function baseRatingRange(division: DivisionRef): RatingRange {
  const { level, rank } = division;
  switch (level) {
    case 'national':
      return rank <= 2 ? { min: 74, max: 82 } : { min: 70, max: 78 };
    case 'regional':
      if (rank <= 1) return { min: 66, max: 74 };
      if (rank === 2) return { min: 62, max: 70 };
      return { min: 58, max: 67 };
    case 'district':
      return rank <= 3 ? { min: 50, max: 64 } : { min: 42, max: 55 };
  }
}

/** Short code: N2, R1, D5… (displayed as-is in French). */
export function divisionCode({ level, rank }: DivisionRef): string {
  const prefix = level === 'national' ? 'N' : level === 'regional' ? 'R' : 'D';
  return `${prefix}${rank}`;
}
