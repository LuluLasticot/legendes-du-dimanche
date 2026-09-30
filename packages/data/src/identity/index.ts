import { crestOf, type CrestSpec } from './crest.ts';
import { kitsOf, type ClubKits } from './kit.ts';
import { sponsorsOf, type Sponsor } from './sponsors.ts';
import { SEASON, type Club } from '../schema.ts';

export * from './colour.ts';
export * from './crest.ts';
export * from './kit.ts';
export * from './sponsors.ts';
export * from './svg.ts';

/** Everything that makes a club recognisable at a glance. */
export interface ClubIdentity {
  readonly crest: CrestSpec;
  readonly kits: ClubKits;
  /** Shirt sponsor first. */
  readonly sponsors: readonly Sponsor[];
}

export function identityOf(club: Club, season: string = SEASON): ClubIdentity {
  return { crest: crestOf(club), kits: kitsOf(club), sponsors: sponsorsOf(club, season) };
}
