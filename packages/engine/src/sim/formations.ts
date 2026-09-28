import type { Position } from './positions.ts';

/**
 * Formation slot. Anchor coordinates are normalised, from the team's point of view when
 * attacking upwards: x = 0 left touchline → 1 right touchline, y = 0 own goal line → 1 opposing one.
 */
export interface FormationSlot {
  readonly position: Position;
  readonly x: number;
  readonly y: number;
}

export const FORMATIONS = [
  '4-4-2',
  '4-3-3',
  '4-3-3-holding',
  '4-3-3-attack',
  '4-2-3-1',
  '4-1-2-1-2',
  '3-5-2',
  '3-4-3',
  '5-3-2',
  '5-4-1',
  '4-5-1',
] as const;

export type Formation = (typeof FORMATIONS)[number];

const s = (position: Position, x: number, y: number): FormationSlot => ({ position, x, y });

const GK = s('GK', 0.5, 0.04);
const BACK_FOUR = [
  s('LB', 0.15, 0.22),
  s('CB', 0.38, 0.18),
  s('CB', 0.62, 0.18),
  s('RB', 0.85, 0.22),
];
const BACK_THREE = [s('CB', 0.3, 0.2), s('CB', 0.5, 0.17), s('CB', 0.7, 0.2)];
const BACK_FIVE = [
  s('LWB', 0.12, 0.28),
  s('CB', 0.3, 0.18),
  s('CB', 0.5, 0.16),
  s('CB', 0.7, 0.18),
  s('RWB', 0.88, 0.28),
];
const FRONT_THREE = [s('LW', 0.18, 0.75), s('ST', 0.5, 0.82), s('RW', 0.82, 0.75)];
const TWO_STRIKERS = [s('ST', 0.38, 0.8), s('ST', 0.62, 0.8)];
const LONE_STRIKER = [s('ST', 0.5, 0.82)];

/** Slots of every formation, goalkeeper first then from defence to attack, left to right. */
export const FORMATION_SLOTS: Readonly<Record<Formation, readonly FormationSlot[]>> = {
  '4-4-2': [
    GK,
    ...BACK_FOUR,
    s('LM', 0.15, 0.5),
    s('CM', 0.38, 0.45),
    s('CM', 0.62, 0.45),
    s('RM', 0.85, 0.5),
    ...TWO_STRIKERS,
  ],
  '4-3-3': [
    GK,
    ...BACK_FOUR,
    s('CM', 0.28, 0.45),
    s('CM', 0.5, 0.42),
    s('CM', 0.72, 0.45),
    ...FRONT_THREE,
  ],
  '4-3-3-holding': [
    GK,
    ...BACK_FOUR,
    s('CDM', 0.5, 0.35),
    s('CM', 0.32, 0.48),
    s('CM', 0.68, 0.48),
    ...FRONT_THREE,
  ],
  '4-3-3-attack': [
    GK,
    ...BACK_FOUR,
    s('CM', 0.32, 0.42),
    s('CAM', 0.5, 0.58),
    s('CM', 0.68, 0.42),
    ...FRONT_THREE,
  ],
  '4-2-3-1': [
    GK,
    ...BACK_FOUR,
    s('CDM', 0.38, 0.36),
    s('CDM', 0.62, 0.36),
    s('LM', 0.18, 0.6),
    s('CAM', 0.5, 0.6),
    s('RM', 0.82, 0.6),
    ...LONE_STRIKER,
  ],
  '4-1-2-1-2': [
    GK,
    ...BACK_FOUR,
    s('CDM', 0.5, 0.34),
    s('CM', 0.32, 0.47),
    s('CM', 0.68, 0.47),
    s('CAM', 0.5, 0.6),
    ...TWO_STRIKERS,
  ],
  '3-5-2': [
    GK,
    ...BACK_THREE,
    s('LWB', 0.12, 0.45),
    s('CM', 0.36, 0.44),
    s('CAM', 0.5, 0.58),
    s('CM', 0.64, 0.44),
    s('RWB', 0.88, 0.45),
    ...TWO_STRIKERS,
  ],
  '3-4-3': [
    GK,
    ...BACK_THREE,
    s('LM', 0.15, 0.48),
    s('CM', 0.4, 0.44),
    s('CM', 0.6, 0.44),
    s('RM', 0.85, 0.48),
    ...FRONT_THREE,
  ],
  '5-3-2': [
    GK,
    ...BACK_FIVE,
    s('CM', 0.3, 0.46),
    s('CM', 0.5, 0.43),
    s('CM', 0.7, 0.46),
    ...TWO_STRIKERS,
  ],
  '5-4-1': [
    GK,
    ...BACK_FIVE,
    s('LM', 0.15, 0.5),
    s('CM', 0.4, 0.45),
    s('CM', 0.6, 0.45),
    s('RM', 0.85, 0.5),
    ...LONE_STRIKER,
  ],
  '4-5-1': [
    GK,
    ...BACK_FOUR,
    s('LM', 0.15, 0.52),
    s('CM', 0.34, 0.45),
    s('CAM', 0.5, 0.56),
    s('CM', 0.66, 0.45),
    s('RM', 0.85, 0.52),
    ...LONE_STRIKER,
  ],
};
