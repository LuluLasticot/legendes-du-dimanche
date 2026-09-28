import { describe, expect, it } from 'vitest';
import {
  collectifs,
  demoTeam,
  effectiveAttributes,
  FORMATION_SLOTS,
  lineupPlayers,
  positionEfficiency,
  teamRating,
  type MatchTeam,
} from '../src/sim/index.ts';

const team = (rating: number, id = 'fc-a'): MatchTeam => demoTeam(1, { id, name: 'FC A', rating });

describe('demo teams', () => {
  it('are deterministic and complete (11 + 7, formation order)', () => {
    const a = team(60);
    expect(JSON.stringify(a)).toBe(JSON.stringify(team(60)));
    expect(a.lineup).toHaveLength(11);
    expect(a.bench).toHaveLength(7);
    const slots = FORMATION_SLOTS[a.formation];
    lineupPlayers(a).forEach((p, i) => expect(p.positions[0]).toBe(slots[i]?.position));
  });

  it('team rating follows the target level', () => {
    for (const target of [45, 60, 72]) {
      expect(Math.abs(teamRating(team(target)) - target)).toBeLessThan(5);
    }
    expect(teamRating(team(72))).toBeGreaterThan(teamRating(team(50)));
  });
});

describe('position and collectifs', () => {
  const t = team(65);
  const [gk, back] = lineupPlayers(t);

  it('out of position costs', () => {
    if (!gk || !back) throw new Error('lineup');
    expect(positionEfficiency(back, back.positions[0] ?? 'CB')).toBe(1);
    expect(positionEfficiency(back, 'CM')).toBeLessThan(0.9);
    expect(positionEfficiency(back, 'GK')).toBe(0.4);
    expect(effectiveAttributes(back, 'ST', 0).shooting).toBeLessThan(back.attributes.shooting);
  });

  it('a whole club together gets full collectifs, a mixed eleven fewer', () => {
    expect(collectifs(t)).toEqual(Array(11).fill(3));
    const mixed: MatchTeam = {
      ...t,
      players: t.players.map((p, i) => ({
        ...p,
        club: `club-${i}`,
        district: `d-${i % 3}`,
        league: `l-${i % 2}`,
        division: `div-${i}`,
      })),
    };
    const points = collectifs(mixed);
    expect(points.reduce((a, b) => a + b, 0)).toBeLessThan(33);
    expect(Math.max(...points)).toBeLessThanOrEqual(3);
  });
});
