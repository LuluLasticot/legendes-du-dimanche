// The player's eleven (a TeamSheet of owned cards, from any club) as the engine plays it.

import { DEFAULT_TACTIC, type MatchTeam, type Tactic } from '@legendes/engine/sim';
import { kitsOf, type KitSpec } from '../identity/kit.ts';
import type { Club } from '../schema.ts';
import { coloursOf, toMatchPlayer } from '../squad/bridge.ts';
import type { TeamSheet } from './auto-squad.ts';

export function toMatchTeamFromSheet(
  club: Club,
  sheet: TeamSheet,
  options: { kit?: KitSpec; tactic?: Tactic } = {},
): MatchTeam {
  const eleven = sheet.slots.map((s) => {
    if (!s.card) throw new Error(`Empty slot ${s.position}: the eleven is not complete`);
    return s.card;
  });
  return {
    id: club.id,
    name: club.name,
    colours: coloursOf(options.kit ?? kitsOf(club).home),
    formation: sheet.formation,
    lineup: eleven.map((c) => c.card.player.id),
    bench: sheet.bench.map((c) => c.card.player.id),
    players: [...eleven, ...sheet.bench].map((c) => toMatchPlayer(c.card.player, c.club)),
    tactic: options.tactic ?? DEFAULT_TACTIC,
  };
}
