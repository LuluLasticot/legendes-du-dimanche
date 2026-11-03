import { describe, expect, it } from 'vitest';
import { simulateMatch } from '@legendes/engine/sim';
import {
  bestSquad,
  generateSquad,
  openStarterPack,
  toMatchTeam,
  toMatchTeamFromSheet,
  WORLD,
} from '../src/index.ts';

const club = WORLD.clubs.find((c) => c.divisionId === 'escaut-d5')!;
const rival = WORLD.clubs.find((c) => c.divisionId === 'escaut-d5' && c.id !== club.id)!;

describe('the player eleven as a match team', () => {
  it('lines up the sheet in order, with its bench, and plays a whole match', () => {
    const sheet = bestSquad(openStarterPack(club, 'mt').cards);
    const team = toMatchTeamFromSheet(club, sheet);
    expect(team.formation).toBe(sheet.formation);
    expect(team.lineup).toEqual(sheet.slots.map((s) => s.card!.card.player.id));
    expect(team.bench).toEqual(sheet.bench.map((c) => c.card.player.id));
    const result = simulateMatch({
      seed: 3,
      home: team,
      away: toMatchTeam(rival, generateSquad(rival)),
      conditions: { surface: 'grass', rain: false, windSpeed: 0, windDirection: 0 },
    });
    expect(result.duration).toBeGreaterThan(80 * 60);
  });

  it('refuses an eleven with an empty slot', () => {
    const sheet = bestSquad(openStarterPack(club, 'mt').cards.slice(0, 6));
    expect(() => toMatchTeamFromSheet(club, sheet)).toThrow();
  });
});
