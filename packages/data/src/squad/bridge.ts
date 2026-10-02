// From a generated squad to what the match engine plays: the eleven, the bench, the formation
// and the tactic, and the kit colours of the club.

import { Rng } from '@legendes/engine/rng';
import {
  DEFAULT_TACTIC,
  FORMATION_SLOTS,
  playerRating,
  positionEfficiency,
  teamRating,
  type Formation,
  type MatchPlayer,
  type MatchTeam,
  type PlayStyle,
  type Tactic,
} from '@legendes/engine/sim';
import { pickInk } from '../identity/colour.ts';
import { kitsOf, type KitSpec } from '../identity/kit.ts';
import { DISTRICTS } from '../reference.ts';
import type { Club } from '../schema.ts';
import type { Player, Squad } from './player.ts';

/** A generated player as the engine sees him. */
export function toMatchPlayer(player: Player, club: Club): MatchPlayer {
  const district = DISTRICTS.find((d) => d.id === club.districtId);
  return {
    id: player.id,
    name: `${player.firstName} ${player.lastName}`,
    number: player.number,
    positions: player.positions,
    foot: player.foot,
    weakFoot: player.weakFoot,
    attributes: player.attributes,
    keeper: {
      diving: player.keeper.diving,
      handling: player.keeper.handling,
      reflexes: player.keeper.reflexes,
      speed: player.keeper.speed,
      positioning: player.keeper.positioning,
      heightCm: player.heightCm,
    },
    stamina: player.stamina,
    composure: player.composure,
    club: club.id,
    district: club.districtId,
    league: district?.leagueId ?? 'unknown',
    division: club.divisionId,
  };
}

/** Formations a club may line up in (the ones a 22-player amateur squad can fill). */
const CANDIDATES: readonly Formation[] = ['4-4-2', '4-3-3', '4-2-3-1', '4-5-1', '3-5-2'];

/** Best available player for each slot, goalkeeper first, then defence to attack. */
function pickEleven(players: readonly MatchPlayer[], formation: Formation): MatchPlayer[] {
  const slots = FORMATION_SLOTS[formation];
  const free = [...players];
  return slots.map((slot) => {
    let best = 0;
    let bestScore = -1;
    free.forEach((p, i) => {
      const score = playerRating(p, slot.position) * positionEfficiency(p, slot.position);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return free.splice(best, 1)[0] as MatchPlayer;
  });
}

const STYLES: readonly (readonly [PlayStyle, number])[] = [
  ['balanced', 0.55],
  ['counter', 0.15],
  ['possession', 0.12],
  ['long-ball', 0.08],
  ['high-press', 0.05],
  ['low-block', 0.05],
];

/** Readable colours for a kit: shirt, shorts, and the number that shows on the shirt. */
function coloursOf(kit: KitSpec): MatchTeam['colours'] {
  return {
    shirt: kit.body,
    shorts: kit.shorts,
    number: pickInk([kit.body], ['#ffffff', '#111111'], 3),
  };
}

/**
 * The club's team for a match: the formation that gives the best team rating, the best eleven in
 * it, seven substitutes (a keeper first), and a playing style drawn from the club's seed.
 */
export function toMatchTeam(
  club: Club,
  squad: Squad,
  options: {
    formation?: Formation;
    tactic?: Tactic;
    /** The kit worn (default: home; `matchKits` picks the away kit on a clash). */
    kit?: KitSpec;
  } = {},
): MatchTeam {
  const colours = coloursOf(options.kit ?? kitsOf(club).home);
  const players = squad.players.map((p) => toMatchPlayer(p, club));
  const build = (formation: Formation): MatchTeam => {
    const eleven = pickEleven(players, formation);
    const rest = players.filter((p) => !eleven.includes(p));
    const keeper = rest
      .filter((p) => p.positions[0] === 'GK')
      .sort((a, b) => playerRating(b, 'GK') - playerRating(a, 'GK'))[0];
    const others = rest
      .filter((p) => p !== keeper)
      .sort((a, b) => playerRating(b) - playerRating(a))
      .slice(0, keeper ? 6 : 7);
    return {
      id: club.id,
      name: club.name,
      colours,
      formation,
      lineup: eleven.map((p) => p.id),
      bench: [...(keeper ? [keeper] : []), ...others].map((p) => p.id),
      players,
      tactic: options.tactic ?? DEFAULT_TACTIC,
    };
  };
  const formation =
    options.formation ??
    CANDIDATES.map((f) => ({ f, team: build(f) })).sort(
      (a, b) => teamRating(b.team) - teamRating(a.team),
    )[0]?.f ??
    '4-4-2';
  const team = build(formation);
  if (options.tactic) return team;
  const rng = Rng.create(`tactic:${club.id}:${squad.season}`);
  const style = STYLES[rng.weightedIndex(STYLES.map(([, w]) => w))]?.[0] ?? 'balanced';
  return { ...team, tactic: { ...DEFAULT_TACTIC, style } };
}
