// Team building rules that the match feels (GDD §6): playing out of position, collectifs,
// player rating by position and team rating.

import { FORMATION_SLOTS } from './formations.ts';
import type { MatchPlayer, MatchTeam, PlayerAttributes } from './model.ts';
import { ATTRIBUTE_KEYS } from './model.ts';
import { POSITION_LINE, type Position, type PositionLine } from './positions.ts';

/** Share of a player's level kept in a slot: main 100 %, secondary 95 %, same line 85 %… */
export function positionEfficiency(player: MatchPlayer, slot: Position): number {
  const [main, ...others] = player.positions;
  if (main === slot) return 1;
  if (others.includes(slot)) return 0.95;
  const line = POSITION_LINE[slot];
  const playerLine = main ? POSITION_LINE[main] : line;
  if (line === 'goalkeeper' || playerLine === 'goalkeeper') return 0.4;
  if (line === playerLine) return 0.85;
  return 0.7;
}

const tiers = (count: number, steps: readonly [number, number, number]): number =>
  count >= steps[2] ? 3 : count >= steps[1] ? 2 : count >= steps[0] ? 1 : 0;

/**
 * Collectif points of each player of the eleven (0–3, GDD §6.2): shared club (2/4/7), district
 * (3/5/8) or league (3/5/8) — the best counts; division (4) adds one; none out of position.
 */
export function collectifs(team: MatchTeam): number[] {
  const eleven = lineupPlayers(team);
  const slots = FORMATION_SLOTS[team.formation];
  const count = (key: 'club' | 'district' | 'league' | 'division', value: string): number =>
    eleven.filter((p) => p[key] === value).length;
  return eleven.map((p, i) => {
    const slot = slots[i]?.position;
    if (!slot || positionEfficiency(p, slot) < 0.95) return 0;
    const best = Math.max(
      tiers(count('club', p.club), [2, 4, 7]),
      tiers(count('district', p.district), [3, 5, 8]),
      tiers(count('league', p.league), [3, 5, 8]),
    );
    return Math.min(3, best + (count('division', p.division) >= 4 ? 1 : 0));
  });
}

/** Players of the eleven, in slot order. */
export function lineupPlayers(team: MatchTeam): MatchPlayer[] {
  return team.lineup.map((id) => playerById(team, id));
}

export function playerById(team: MatchTeam, id: string): MatchPlayer {
  const player = team.players.find((p) => p.id === id);
  if (!player) throw new RangeError(`Unknown player ${id} in ${team.id}`);
  return player;
}

/** Up to +5 on the attributes at 3 collectif points (ponytail: all six, not only the key ones). */
const COLLECTIF_BONUS = 5 / 3;

/** Attributes as they play in `slot`, with the player's collectif points. */
export function effectiveAttributes(
  player: MatchPlayer,
  slot: Position,
  collectif: number,
): PlayerAttributes {
  const k = positionEfficiency(player, slot);
  const bonus = collectif * COLLECTIF_BONUS;
  const at = (key: keyof PlayerAttributes): number =>
    Math.min(99, Math.max(1, player.attributes[key] * k + bonus));
  return {
    pace: at('pace'),
    shooting: at('shooting'),
    passing: at('passing'),
    dribbling: at('dribbling'),
    defending: at('defending'),
    physical: at('physical'),
  };
}

const WEIGHTS: Readonly<Record<Exclude<PositionLine, 'goalkeeper'>, PlayerAttributes>> = {
  defence: {
    pace: 0.15,
    shooting: 0.03,
    passing: 0.12,
    dribbling: 0.05,
    defending: 0.45,
    physical: 0.2,
  },
  midfield: {
    pace: 0.1,
    shooting: 0.1,
    passing: 0.35,
    dribbling: 0.2,
    defending: 0.15,
    physical: 0.1,
  },
  attack: {
    pace: 0.2,
    shooting: 0.4,
    passing: 0.1,
    dribbling: 0.2,
    defending: 0.02,
    physical: 0.08,
  },
};

/** Overall rating of a player at a position (weighted attributes; keepers: keeping ones). */
export function playerRating(
  player: MatchPlayer,
  position: Position = player.positions[0] ?? 'CM',
): number {
  const line = POSITION_LINE[position];
  if (line === 'goalkeeper') {
    const g = player.keeper;
    return Math.round(
      g.diving * 0.22 + g.handling * 0.2 + g.reflexes * 0.25 + g.positioning * 0.23 + g.speed * 0.1,
    );
  }
  const w = WEIGHTS[line];
  let sum = 0;
  for (const key of ATTRIBUTE_KEYS) sum += player.attributes[key] * w[key];
  return Math.round(sum);
}

/**
 * Team rating (GDD §6.3): mean of the eleven in their slots, plus the average excess of the
 * players above that mean (stars lift a team more than the mean says).
 */
export function teamRating(team: MatchTeam): number {
  const slots = FORMATION_SLOTS[team.formation];
  const ratings = lineupPlayers(team).map((p, i) => {
    const slot = slots[i]?.position ?? 'CM';
    return playerRating(p, slot) * positionEfficiency(p, slot);
  });
  const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const excess = ratings.reduce((a, r) => a + Math.max(0, r - mean), 0) / ratings.length;
  return Math.round(mean + excess);
}
