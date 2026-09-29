// The reference tables of the world: leagues, districts, divisions. Small, stable, written by
// hand from public sources (see sources/SOURCES.md). Clubs live in sources/clubs-hdf.csv.
//
// Pilot: the Ligue de Football des Hauts-de-France, the Escaut district in full, and the ligue
// and national divisions above it. Ligue 3 is professional since 2026-07-01 and is not in the game.

import { divisionCode, type DivisionRef } from '@legendes/shared';
import type { District, Division, League } from './schema.ts';

export const LEAGUES: readonly League[] = [
  {
    id: 'hauts-de-france',
    name: 'Ligue de Football des Hauts-de-France',
    region: 'Hauts-de-France',
  },
];

/** The seven districts of the league (Wikipédia, "Ligue de football des Hauts-de-France"). */
export const DISTRICTS: readonly District[] = [
  { id: 'aisne', leagueId: 'hauts-de-france', name: "District de l'Aisne", departments: ['02'] },
  { id: 'artois', leagueId: 'hauts-de-france', name: "District de l'Artois", departments: ['62'] },
  {
    id: 'cote-d-opale',
    leagueId: 'hauts-de-france',
    name: "District de la Côte d'Opale",
    departments: ['62'],
  },
  { id: 'escaut', leagueId: 'hauts-de-france', name: "District de l'Escaut", departments: ['59'] },
  {
    id: 'flandres',
    leagueId: 'hauts-de-france',
    name: 'District des Flandres',
    departments: ['59'],
  },
  { id: 'oise', leagueId: 'hauts-de-france', name: "District de l'Oise", departments: ['60'] },
  { id: 'somme', leagueId: 'hauts-de-france', name: 'District de la Somme', departments: ['80'] },
];

const HDF = 'hauts-de-france';

function national(rank: 1 | 2, pool: string, name: string): Division {
  return {
    id: `n${rank}-${pool.toLowerCase()}`,
    scope: 'national',
    level: 'national',
    rank,
    name,
    leagueId: null,
    districtId: null,
    pool,
  };
}

/** Divisions of the pilot: National 1 (groups A–C), National 2 (A–H), R1 to R3, and Escaut D1 to D6.
 * Since 2026-27 the fourth level is called National 1 and the fifth National 2 (the old National 3 is gone). */
export const DIVISIONS: readonly Division[] = [
  ...['A', 'B', 'C'].map((pool) => national(1, pool, `National 1 groupe ${pool}`)),
  ...['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((pool) =>
    national(2, pool, `National 2 groupe ${pool}`),
  ),
  ...([1, 2, 3] as const).map((rank): Division => ({
    id: `hdf-r${rank}`,
    scope: 'league',
    level: 'regional',
    rank,
    name: `Régional ${rank} Hauts-de-France`,
    leagueId: HDF,
    districtId: null,
    pool: null,
  })),
  ...([1, 2, 3, 4, 5, 6] as const).map((rank): Division => ({
    id: `escaut-d${rank}`,
    scope: 'district',
    level: 'district',
    rank,
    name: `District de l'Escaut D${rank}`,
    leagueId: null,
    districtId: 'escaut',
    pool: null,
  })),
];

export function divisionRef(division: Division): DivisionRef {
  return { level: division.level, rank: division.rank };
}

/** "N2", "R1", "D3"… as displayed on cards. */
export function divisionLabel(division: Division): string {
  return divisionCode(divisionRef(division));
}
