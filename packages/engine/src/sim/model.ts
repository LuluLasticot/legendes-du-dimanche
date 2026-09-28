// Match model: what the simulation needs to know about players, teams, tactics and conditions.
// Plain serialisable data (a match = seed + these frozen teams + timed player inputs).

import type { KeeperAttributes } from '../moments/keeper.ts';
import type { PhysicsSurface } from '../physics/params.ts';
import type { Formation } from './formations.ts';
import type { Position } from './positions.ts';

/** The six headline attributes of a card (GDD §5.1), 1–99. */
export interface PlayerAttributes {
  readonly pace: number;
  readonly shooting: number;
  readonly passing: number;
  readonly dribbling: number;
  readonly defending: number;
  readonly physical: number;
}

export const ATTRIBUTE_KEYS = [
  'pace',
  'shooting',
  'passing',
  'dribbling',
  'defending',
  'physical',
] as const satisfies readonly (keyof PlayerAttributes)[];

export interface MatchPlayer {
  readonly id: string;
  readonly name: string;
  readonly number: number;
  /** Main position first, then secondary ones. */
  readonly positions: readonly Position[];
  readonly foot: 'left' | 'right';
  /** Weak foot, 1–5 stars. */
  readonly weakFoot: number;
  readonly attributes: PlayerAttributes;
  /** Goalkeeping attributes (every player has some; only keepers have good ones). */
  readonly keeper: KeeperAttributes;
  /** Endurance (fatigue) and composure (pressure), 1–99. */
  readonly stamina: number;
  readonly composure: number;
  /** Collectifs (GDD §6.2). */
  readonly club: string;
  readonly district: string;
  readonly league: string;
  readonly division: string;
}

export type Mentality = -2 | -1 | 0 | 1 | 2;
export type PlayStyle =
  'balanced' | 'possession' | 'counter' | 'long-ball' | 'high-press' | 'low-block';

/** Team tactics (GDD §6.4). Scales are 1–5 (3 = neutral). */
export interface Tactic {
  readonly mentality: Mentality;
  readonly style: PlayStyle;
  readonly width: number;
  readonly lineHeight: number;
  readonly pressing: number;
  /** Designated takers (player ids), falling back to the best available. */
  readonly takers: {
    readonly penalty?: string;
    readonly freeKick?: string;
    readonly corner?: string;
    readonly captain?: string;
  };
}

export const DEFAULT_TACTIC: Tactic = {
  mentality: 0,
  style: 'balanced',
  width: 3,
  lineHeight: 3,
  pressing: 3,
  takers: {},
};

export interface MatchTeam {
  readonly id: string;
  readonly name: string;
  readonly colours: { readonly shirt: string; readonly shorts: string; readonly number: string };
  readonly formation: Formation;
  /** The eleven, in the order of the formation slots (goalkeeper first). */
  readonly lineup: readonly string[];
  /** Up to 7 substitutes. */
  readonly bench: readonly string[];
  readonly players: readonly MatchPlayer[];
  readonly tactic: Tactic;
}

export interface MatchConditions {
  readonly surface: PhysicsSurface;
  readonly rain: boolean;
  /** Wind speed (m/s) and direction (degrees, 0 = towards the home team's attacking goal). */
  readonly windSpeed: number;
  readonly windDirection: number;
}

export interface MatchSetup {
  readonly seed: number;
  readonly home: MatchTeam;
  readonly away: MatchTeam;
  readonly conditions: MatchConditions;
}
