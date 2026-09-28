// Seeded demo squads for tests and the match lab: fictional players (rule 3 of CLAUDE.md) built
// around a target rating, with attributes shaped by the position. The real generators (identity,
// archetypes, traits, looks) come with Phase 3 in packages/data.

import { clamp } from '../math/index.ts';
import { Rng, type Seed } from '../rng/index.ts';
import { FORMATION_SLOTS, type Formation } from './formations.ts';
import { DEFAULT_TACTIC, type MatchPlayer, type MatchTeam, type Tactic } from './model.ts';
import { POSITION_LINE, type Position } from './positions.ts';

const FIRST = [
  'Kévin',
  'Mehdi',
  'Julien',
  'Thomas',
  'Yanis',
  'Nicolas',
  'Sofiane',
  'Maxime',
  'Bryan',
  'Anthony',
  'Rayan',
  'Florian',
  'Karim',
  'Loïc',
  'Jordan',
  'Adrien',
  'Moussa',
  'Quentin',
];
const LAST = [
  'Lefebvre',
  'Dufour',
  'Benali',
  'Carpentier',
  'Delattre',
  'Traoré',
  'Lemaire',
  'Vasseur',
  'Hennebelle',
  'Boulanger',
  'Dumont',
  'Mercier',
  'Caron',
  'Leroy',
  'Diallo',
  'Poulain',
  'Delcroix',
  'Martel',
];

type Profile = readonly [
  pace: number,
  sho: number,
  pas: number,
  dri: number,
  def: number,
  phy: number,
];

/** Attribute offsets from the rating by position line (keepers get keeping attributes). */
const PROFILES: Readonly<Record<'defence' | 'midfield' | 'attack', Profile>> = {
  defence: [-2, -22, -6, -10, 6, 4],
  midfield: [-3, -6, 5, 2, -6, -4],
  attack: [4, 5, -6, 2, -30, -4],
};

export interface DemoTeamOptions {
  readonly id: string;
  readonly name: string;
  /** Target overall rating of the eleven (District 9 ≈ 45 … National 2 ≈ 72). */
  readonly rating: number;
  readonly formation?: Formation;
  readonly tactic?: Tactic;
  readonly colours?: MatchTeam['colours'];
}

const BENCH: readonly Position[] = ['GK', 'CB', 'LB', 'CM', 'CM', 'RW', 'ST'];

export function demoTeam(seed: Seed, options: DemoTeamOptions): MatchTeam {
  const rng = Rng.create(seed).fork('demo-team', options.id);
  const formation = options.formation ?? '4-4-2';
  const slots = FORMATION_SLOTS[formation].map((s) => s.position);
  const positions = [...slots, ...BENCH];
  const players: MatchPlayer[] = positions.map((position, i) => {
    const r = rng.fork('player', i);
    // Bench a notch below the starters.
    const level = options.rating + r.normal(0, 4) - (i >= 11 ? 3 : 0);
    const a = (offset: number): number =>
      Math.round(clamp(level + offset + r.normal(0, 4), 20, 95));
    const line = POSITION_LINE[position];
    const profile = line === 'goalkeeper' ? PROFILES.defence : PROFILES[line];
    const keeperLevel = line === 'goalkeeper' ? level : level - 35;
    const k = (offset: number): number =>
      Math.round(clamp(keeperLevel + offset + r.normal(0, 4), 10, 95));
    return {
      id: `${options.id}-${i + 1}`,
      name: `${FIRST[r.int(0, FIRST.length - 1)] ?? 'Kévin'} ${LAST[r.int(0, LAST.length - 1)] ?? 'Dufour'}`,
      number: i < 11 ? i + 1 : i + 5,
      positions: [position],
      foot: r.chance(0.25) ? 'left' : 'right',
      weakFoot: r.int(1, 4),
      attributes: {
        pace: a(profile[0]),
        shooting: a(profile[1]),
        passing: a(profile[2]),
        dribbling: a(profile[3]),
        defending: a(profile[4]),
        physical: a(profile[5]),
      },
      keeper: {
        diving: k(0),
        handling: k(-2),
        reflexes: k(2),
        speed: k(-8),
        positioning: k(0),
        heightCm: r.int(line === 'goalkeeper' ? 180 : 170, line === 'goalkeeper' ? 196 : 190),
      },
      stamina: a(0),
      composure: a(-2),
      club: options.id,
      district: 'demo',
      league: 'demo',
      division: 'demo',
    };
  });
  return {
    id: options.id,
    name: options.name,
    colours: options.colours ?? { shirt: '#0f5132', shorts: '#f4f1e8', number: '#f4f1e8' },
    formation,
    lineup: players.slice(0, 11).map((p) => p.id),
    bench: players.slice(11).map((p) => p.id),
    players,
    tactic: options.tactic ?? DEFAULT_TACTIC,
  };
}
