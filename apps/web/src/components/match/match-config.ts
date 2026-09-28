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
}

export const DEFAULT_CONFIG: MatchConfig = {
  seed: 1,
  formation: '4-4-2',
  style: 'balanced',
  mentality: 0,
  surface: 'grass',
  rain: false,
  play: true,
};

export const PLAY_STYLES: readonly sim.PlayStyle[] = [
  'balanced',
  'possession',
  'counter',
  'long-ball',
  'high-press',
  'low-block',
];

export const SIDE = 0 as const;

/** The two demo squads for a config (the real ones come from the collection in Phase 4). */
export function buildSetup(config: MatchConfig): sim.MatchSetup {
  return {
    seed: config.seed,
    home: sim.demoTeam(config.seed, {
      id: 'fca',
      name: 'FC Avesnes-le-Sec',
      rating: 58,
      formation: config.formation,
      tactic: { ...sim.DEFAULT_TACTIC, style: config.style, mentality: config.mentality },
      colours: { shirt: '#f4f1e8', shorts: '#0f5132', number: '#0f5132' },
    }),
    away: sim.demoTeam(config.seed + 1, {
      id: 'uss',
      name: 'US Saint-Amand',
      rating: 56,
      formation: '4-3-3',
      colours: { shirt: '#c4302b', shorts: '#f2f2ee', number: '#f2f2ee' },
    }),
    conditions: {
      surface: config.surface,
      rain: config.rain,
      windSpeed: config.rain ? 4 : 0,
      windDirection: 30,
    },
  };
}
