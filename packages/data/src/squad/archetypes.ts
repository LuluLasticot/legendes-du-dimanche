// Player archetypes (GDD §5.4): how a player's points are spread over the six card attributes
// (pace, shooting, passing, dribbling, defending, physical) and, for keepers, over the keeping
// ones. Offsets are relative: the generator re-centres the vector so that the player's overall
// rating (the engine's `playerRating`) is exactly the rating drawn for him.

import type { Position } from '@legendes/engine/sim/positions';

export const ARCHETYPES = [
  // Goalkeepers
  'wall', // Mur: reflexes
  'sweeper-keeper', // Libéro: feet and speed
  'cat', // Chat: diving
  // Defenders
  'leader', // Patron: defending and physical
  'ball-player', // Relanceur: passing
  'stopper', // Stoppeur: raw defending
  'wing-back', // Latéral piston: pace and stamina
  'full-back', // Latéral: balanced
  // Midfielders
  'anchor', // Sentinelle
  'box-to-box', // Box-to-box
  'playmaker', // Meneur: vision and passing
  'pitbull', // Pitbull: aggression
  'wide-midfielder', // Milieu de côté
  // Attackers
  'winger', // Ailier percutant
  'poacher', // Renard des surfaces
  'target-man', // Pivot
  'false-nine', // Faux 9
] as const;
export type Archetype = (typeof ARCHETYPES)[number];

type Offsets = readonly [
  pace: number,
  shooting: number,
  passing: number,
  dribbling: number,
  defending: number,
  physical: number,
];

/** Keeping offsets: diving, handling, kicking (PIE), reflexes, speed, positioning. */
type KeeperOffsets = readonly [number, number, number, number, number, number];

export interface ArchetypeDef {
  readonly offsets: Offsets;
  readonly keeper?: KeeperOffsets;
  /** Height range in cm. */
  readonly height: readonly [number, number];
  /** Extra endurance (added to the rating). */
  readonly stamina: number;
}

export const ARCHETYPE_DEFS: Readonly<Record<Archetype, ArchetypeDef>> = {
  wall: {
    offsets: [0, 0, 0, 0, 0, 0],
    keeper: [-2, 0, -4, 8, -4, 2],
    height: [183, 196],
    stamina: 0,
  },
  'sweeper-keeper': {
    offsets: [0, 0, 0, 0, 0, 0],
    keeper: [-2, -2, 9, 0, 8, 0],
    height: [178, 192],
    stamina: 0,
  },
  cat: {
    offsets: [0, 0, 0, 0, 0, 0],
    keeper: [8, -4, -2, 3, 2, -1],
    height: [176, 188],
    stamina: 0,
  },

  leader: { offsets: [-6, -20, -6, -12, 10, 8], height: [183, 195], stamina: 0 },
  'ball-player': { offsets: [-4, -16, 7, -3, 6, 2], height: [178, 190], stamina: 0 },
  stopper: { offsets: [-2, -22, -10, -16, 12, 6], height: [180, 194], stamina: -2 },
  'wing-back': { offsets: [10, -8, 3, 4, 0, 0], height: [168, 182], stamina: 10 },
  'full-back': { offsets: [3, -14, 2, -2, 6, 3], height: [170, 184], stamina: 4 },

  anchor: { offsets: [-4, -12, 3, -6, 10, 4], height: [174, 188], stamina: 4 },
  'box-to-box': { offsets: [2, -2, 1, 0, 3, 6], height: [172, 186], stamina: 10 },
  playmaker: { offsets: [-2, 2, 10, 8, -14, -8], height: [166, 182], stamina: -2 },
  pitbull: { offsets: [0, -10, -4, -6, 10, 10], height: [170, 186], stamina: 6 },
  'wide-midfielder': { offsets: [8, 0, 2, 6, -14, -4], height: [166, 182], stamina: 6 },

  winger: { offsets: [10, 2, -2, 10, -24, -6], height: [164, 180], stamina: 2 },
  poacher: { offsets: [2, 12, -8, 2, -32, -2], height: [168, 186], stamina: -4 },
  'target-man': { offsets: [-6, 6, -6, -6, -26, 14], height: [180, 196], stamina: -2 },
  'false-nine': { offsets: [2, 4, 6, 8, -26, -8], height: [166, 182], stamina: 0 },
};

/** Which archetypes fill a position, with their weights. */
export const ARCHETYPES_BY_POSITION: Readonly<
  Record<Position, readonly (readonly [Archetype, number])[]>
> = {
  GK: [
    ['wall', 0.4],
    ['cat', 0.35],
    ['sweeper-keeper', 0.25],
  ],
  CB: [
    ['leader', 0.4],
    ['ball-player', 0.3],
    ['stopper', 0.3],
  ],
  RB: [
    ['wing-back', 0.5],
    ['full-back', 0.5],
  ],
  LB: [
    ['wing-back', 0.5],
    ['full-back', 0.5],
  ],
  RWB: [['wing-back', 1]],
  LWB: [['wing-back', 1]],
  CDM: [
    ['anchor', 0.5],
    ['pitbull', 0.5],
  ],
  CM: [
    ['box-to-box', 0.4],
    ['playmaker', 0.3],
    ['pitbull', 0.15],
    ['anchor', 0.15],
  ],
  RM: [['wide-midfielder', 1]],
  LM: [['wide-midfielder', 1]],
  CAM: [
    ['playmaker', 0.7],
    ['false-nine', 0.3],
  ],
  RW: [['winger', 1]],
  LW: [['winger', 1]],
  CF: [
    ['false-nine', 0.6],
    ['poacher', 0.4],
  ],
  ST: [
    ['poacher', 0.45],
    ['target-man', 0.35],
    ['false-nine', 0.2],
  ],
};

/** Positions a player can also cover (secondary positions). */
export const NEIGHBOURS: Readonly<Record<Position, readonly Position[]>> = {
  GK: [],
  CB: ['CDM', 'RB', 'LB'],
  RB: ['RWB', 'CB', 'RM'],
  LB: ['LWB', 'CB', 'LM'],
  RWB: ['RB', 'RM', 'RW'],
  LWB: ['LB', 'LM', 'LW'],
  CDM: ['CM', 'CB'],
  CM: ['CDM', 'CAM'],
  RM: ['RW', 'CM', 'RWB'],
  LM: ['LW', 'CM', 'LWB'],
  CAM: ['CM', 'CF', 'RW', 'LW'],
  RW: ['RM', 'ST', 'CF'],
  LW: ['LM', 'ST', 'CF'],
  CF: ['ST', 'CAM'],
  ST: ['CF', 'RW', 'LW'],
};

/** Positions of a squad in order of priority: the first 22 to 25 make a balanced squad. */
export const SQUAD_ORDER: readonly Position[] = [
  'GK',
  'CB',
  'CB',
  'RB',
  'LB',
  'CDM',
  'CM',
  'CM',
  'ST',
  'RW',
  'LW',
  'CAM',
  'CM',
  'ST',
  'CB',
  'RM',
  'LM',
  'GK',
  'RB',
  'LB',
  'CDM',
  'ST',
  'CB',
  'CM',
  'GK',
];

/** Shirt numbers a position usually wears, most usual first. */
export const PREFERRED_NUMBERS: Readonly<Record<Position, readonly number[]>> = {
  GK: [1, 16, 30, 40],
  RB: [2, 22, 12],
  LB: [3, 25, 13],
  CB: [4, 5, 15, 23, 14],
  RWB: [2, 22],
  LWB: [3, 25],
  CDM: [6, 14, 18],
  CM: [8, 6, 18, 20, 17],
  RM: [7, 17, 27],
  LM: [11, 21, 24],
  CAM: [10, 19, 8],
  RW: [7, 17, 27],
  LW: [11, 21, 24],
  CF: [9, 19, 10],
  ST: [9, 29, 26, 19],
};
