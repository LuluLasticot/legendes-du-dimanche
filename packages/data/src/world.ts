// The world at run time: the reference tables and the clubs generated from the club list.
// Pure lookups, no I/O (runs in the browser, on the server and in Deno alike).

import { CLUBS } from './generated/clubs.ts';
import { DISTRICTS, DIVISIONS, LEAGUES } from './reference.ts';
import type { Club, District, Division, League } from './schema.ts';

export const WORLD = {
  leagues: LEAGUES,
  districts: DISTRICTS,
  divisions: DIVISIONS,
  clubs: CLUBS,
} as const;

const byId = <T extends { readonly id: string }>(items: readonly T[]): ReadonlyMap<string, T> =>
  new Map(items.map((i) => [i.id, i]));

const clubs = byId(CLUBS);
const districts = byId(DISTRICTS);
const divisions = byId(DIVISIONS);
const leagues = byId(LEAGUES);

export const getClub = (id: string): Club | undefined => clubs.get(id);
export const getDistrict = (id: string): District | undefined => districts.get(id);
export const getDivision = (id: string): Division | undefined => divisions.get(id);
export const getLeague = (id: string): League | undefined => leagues.get(id);

/** Clubs of a district, or of a division, in alphabetical order. */
export function clubsOf(filter: { districtId?: string; divisionId?: string }): Club[] {
  return CLUBS.filter(
    (c) =>
      (filter.districtId === undefined || c.districtId === filter.districtId) &&
      (filter.divisionId === undefined || c.divisionId === filter.divisionId),
  ).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
