import { generateSquad, matchKits, toMatchTeam, WORLD, type Club } from '@legendes/data';
import { sim } from '@legendes/engine';

/** What the player chooses before kick-off. */
export interface MatchConfig {
  readonly seed: number;
  readonly formation: sim.Formation;
  readonly style: sim.PlayStyle;
  readonly mentality: sim.Mentality;
  readonly surface: sim.MatchConditions['surface'];
  readonly rain: boolean;
  /** Play the key moments in 3D (false: the coach resolves them). */
  readonly play: boolean;
  /** Clubs of the pilot (the player's team plays at home). */
  readonly home: string;
  readonly away: string;
}

export const DEFAULT_CONFIG: MatchConfig = {
  seed: 1,
  formation: '4-4-2',
  style: 'balanced',
  mentality: 0,
  surface: 'grass',
  rain: false,
  play: true,
  // Two Régional 1 neighbours of the Escaut.
  home: 'ac-cambrai-59122',
  away: 'us-maubeuge-59392',
};

/** A club of the pilot by id (the first one if the id is unknown, e.g. an old URL). */
export function clubOf(id: string): Club {
  return WORLD.clubs.find((c) => c.id === id) ?? WORLD.clubs[0]!;
}

export const PLAY_STYLES: readonly sim.PlayStyle[] = [
  'balanced',
  'possession',
  'counter',
  'long-ball',
  'high-press',
  'low-block',
];

export const SIDE = 0 as const;

/**
 * The two clubs' teams for a config: their generated squads (D-032), the player's formation and
 * tactic at home, the visitors' own; kits that do not clash (`matchKits`). The collection
 * replaces the home squad in Phase 4.
 */
export function buildSetup(config: MatchConfig): sim.MatchSetup {
  const home = clubOf(config.home);
  const away = clubOf(config.away);
  const kits = matchKits(home, away);
  return {
    seed: config.seed,
    home: toMatchTeam(home, generateSquad(home), {
      formation: config.formation,
      tactic: { ...sim.DEFAULT_TACTIC, style: config.style, mentality: config.mentality },
      kit: kits.home,
    }),
    away: toMatchTeam(away, generateSquad(away), { kit: kits.away }),
    conditions: {
      surface: config.surface,
      rain: config.rain,
      windSpeed: config.rain ? 4 : 0,
      windDirection: 30,
    },
  };
}
