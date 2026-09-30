import { describe, expect, it } from 'vitest';
import { sim } from '@legendes/engine';
import { hashString } from '@legendes/engine/hash';
import { baseRatingRange, PLAYER_MAX_AGE, PLAYER_MIN_AGE, tierForRating } from '@legendes/shared';
import {
  DIVISIONS,
  divisionRef,
  generateSquad,
  getClub,
  playerSchema,
  toMatchTeam,
  WORLD,
  type Club,
  type Player,
} from '../src/index.ts';

const clubs = WORLD.clubs;
const squads = new Map(clubs.map((c) => [c.id, generateSquad(c)]));
const rangeOf = (club: Club) => {
  const division = DIVISIONS.find((d) => d.id === club.divisionId);
  if (!division) throw new Error(club.divisionId);
  return baseRatingRange(divisionRef(division));
};
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
/** Hash of the squads of the whole pilot (see the test that uses it). */
const SQUADS_GOLDEN = 'cb317a62';
const allPlayers: Player[] = [...squads.values()].flatMap((s) => [...s.players]);

describe('squads of the pilot', () => {
  it('are deterministic: same club, same season, same players', () => {
    const club = clubs[7] as Club;
    expect(generateSquad(club)).toEqual(generateSquad(club));
    expect(generateSquad(club, '2027-28')).not.toEqual(generateSquad(club));
  });

  it('keep their identity: every squad of the pilot hashes to the committed value', () => {
    // A change of the generator or of the club list changes every player (and their card ids).
    // Update this value on purpose, once the change is meant; see D-032.
    const digest = hashString(JSON.stringify([...squads.values()])).toString(16);
    expect({ digest, players: allPlayers.length }).toEqual({
      digest: SQUADS_GOLDEN,
      players: 4839,
    });
  });

  it('hold 22 to 25 valid adult players with a real spread of positions', () => {
    for (const squad of squads.values()) {
      expect(squad.players.length).toBeGreaterThanOrEqual(22);
      expect(squad.players.length).toBeLessThanOrEqual(25);
      const mains = squad.players.map((p) => p.positions[0]);
      expect(mains.filter((p) => p === 'GK').length).toBeGreaterThanOrEqual(2);
      expect(mains.filter((p) => p === 'CB').length).toBeGreaterThanOrEqual(3);
      expect(mains.filter((p) => p === 'ST' || p === 'CF').length).toBeGreaterThanOrEqual(2);
      expect(new Set(squad.players.map((p) => p.number)).size).toBe(squad.players.length);
      expect(new Set(squad.players.map((p) => p.id)).size).toBe(squad.players.length);
      expect(new Set(squad.players.map((p) => `${p.firstName} ${p.lastName}`)).size).toBe(
        squad.players.length,
      );
    }
    for (const p of allPlayers) {
      expect(playerSchema.safeParse(p).success).toBe(true);
      // Rule 6 of CLAUDE.md: adults only, always.
      expect(p.age).toBeGreaterThanOrEqual(PLAYER_MIN_AGE);
      expect(p.age).toBeLessThanOrEqual(PLAYER_MAX_AGE);
      expect(2026 - p.birthYear).toBe(p.age);
      expect(p.tier).toBe(tierForRating(p.rating));
    }
  });

  it('follow the division: ratings sit in its band (GDD §5.2) and rise with the level', () => {
    const byDivision = new Map<string, number[]>();
    for (const club of clubs) {
      const range = rangeOf(club);
      const squad = squads.get(club.id);
      const starters = [...(squad?.players ?? [])].sort((a, b) => b.rating - a.rating).slice(0, 11);
      const m = mean(starters.map((p) => p.rating));
      // The eleven best of a club are around the band's upper half, never outside it by much.
      expect(m).toBeGreaterThan(range.min - 2);
      expect(m).toBeLessThan(range.max + 5);
      byDivision.set(club.divisionId, [...(byDivision.get(club.divisionId) ?? []), m]);
    }
    const level = (id: string): number => mean(byDivision.get(id) ?? [0]);
    // D1 to D3 share one band (GDD §5.2) and D4 and below another: D3 is above D6.
    expect(level('escaut-d3')).toBeGreaterThan(level('escaut-d6'));
    expect(level('hdf-r1')).toBeGreaterThan(level('escaut-d1'));
    expect(level('n1-a')).toBeGreaterThan(level('hdf-r1'));
  });

  it('mix the tiers like the pyramid: gold at the top, bronze in the districts', () => {
    const share = (ids: (c: Club) => boolean, tier: string): number => {
      const ps = clubs.filter(ids).flatMap((c) => squads.get(c.id)?.players ?? []);
      return ps.filter((p) => p.tier === tier).length / Math.max(1, ps.length);
    };
    expect(share((c) => c.divisionId.startsWith('n'), 'gold')).toBeGreaterThan(0.3);
    expect(share((c) => c.divisionId.startsWith('escaut-d'), 'gold')).toBeLessThan(0.01);
    expect(share((c) => c.divisionId.startsWith('escaut-d'), 'bronze')).toBeGreaterThan(0.9);
    expect(share((c) => c.divisionId.startsWith('hdf-r'), 'silver')).toBeGreaterThan(0.2);
    // Overlap on purpose: some district players out-rate some regional ones.
    const d1 = allPlayers
      .filter((p) => getClub(p.clubId)?.divisionId === 'escaut-d1')
      .map((p) => p.rating);
    const r3 = allPlayers
      .filter((p) => getClub(p.clubId)?.divisionId === 'hdf-r3')
      .map((p) => p.rating);
    expect(Math.max(...d1)).toBeGreaterThan(Math.min(...r3));
  });

  it('look like an amateur squad: ages, feet, heights, keepers, traits', () => {
    expect(mean(allPlayers.map((p) => p.age))).toBeGreaterThan(24.5);
    expect(mean(allPlayers.map((p) => p.age))).toBeLessThan(28.5);
    expect(allPlayers.filter((p) => p.age >= 35).length).toBeGreaterThan(20);
    const left = allPlayers.filter((p) => p.foot === 'left').length / allPlayers.length;
    expect(left).toBeGreaterThan(0.15);
    expect(left).toBeLessThan(0.35);
    const keepers = allPlayers.filter((p) => p.positions[0] === 'GK');
    expect(mean(keepers.map((p) => p.heightCm))).toBeGreaterThan(184);
    for (const k of keepers) expect(k.keeper.reflexes).toBeGreaterThan(k.attributes.shooting);
    const outfield = allPlayers.filter((p) => p.positions[0] !== 'GK');
    expect(mean(outfield.map((p) => p.keeper.reflexes))).toBeLessThan(45);
    // Pace fades with age.
    expect(mean(allPlayers.filter((p) => p.age >= 34).map((p) => p.attributes.pace))).toBeLessThan(
      mean(allPlayers.filter((p) => p.age <= 24).map((p) => p.attributes.pace)),
    );
    // Traits: roughly half of the players have one, nobody more than two, one captain per squad.
    const withTrait = allPlayers.filter((p) => p.traits.length > 0).length / allPlayers.length;
    expect(withTrait).toBeGreaterThan(0.25);
    expect(withTrait).toBeLessThan(0.75);
    expect(allPlayers.every((p) => p.traits.length <= 2)).toBe(true);
    for (const squad of squads.values())
      expect(squad.players.filter((p) => p.traits.includes('captain')).length).toBeLessThanOrEqual(
        1,
      );
    expect(
      allPlayers.filter((p) => p.traits.includes('one-footed')).every((p) => p.weakFoot === 1),
    ).toBe(true);
    expect(allPlayers.filter((p) => p.traits.includes('veteran')).every((p) => p.age >= 33)).toBe(
      true,
    );
  });

  it('are named with variety, and printable on a card', () => {
    const full = allPlayers.map((p) => `${p.firstName} ${p.lastName}`);
    expect(new Set(full).size / full.length).toBeGreaterThan(0.85);
    expect(new Set(allPlayers.map((p) => p.lastName)).size).toBeGreaterThan(150);
    for (const p of allPlayers) expect(p.displayName).toMatch(/^\S\. \S+/);
    // Young players get the first names of their decade.
    const fifties = allPlayers.filter((p) => p.birthYear < 1990).map((p) => p.firstName);
    const noughties = allPlayers.filter((p) => p.birthYear >= 2000).map((p) => p.firstName);
    expect(new Set(fifties).size).toBeGreaterThan(20);
    expect(noughties).toContain('Théo');
    expect(fifties).not.toContain('Théo');
  });
});

describe('from squad to match', () => {
  it('builds a legal team: an eleven in formation, seven on the bench, a keeper in goal', () => {
    for (const club of clubs.slice(0, 40)) {
      const squad = squads.get(club.id);
      if (!squad) throw new Error('squad');
      const team = toMatchTeam(club, squad);
      expect(team.lineup).toHaveLength(11);
      expect(team.bench.length).toBeGreaterThanOrEqual(6);
      expect(team.bench.length).toBeLessThanOrEqual(7);
      expect(new Set([...team.lineup, ...team.bench]).size).toBe(
        team.lineup.length + team.bench.length,
      );
      const goalkeeper = sim.playerById(team, team.lineup[0] ?? '');
      expect(goalkeeper.positions[0]).toBe('GK');
      expect(sim.teamRating(team)).toBeGreaterThan(30);
      expect(team.colours.shirt).toBe(club.colours.primary);
      expect(toMatchTeam(club, squad)).toEqual(team);
    }
  });

  it('plays: a stronger division wins far more often, with credible scores', () => {
    const pick = (id: string): Club[] => clubs.filter((c) => c.divisionId === id).slice(0, 8);
    const top = pick('n1-a').concat(pick('hdf-r1'));
    const bottom = pick('escaut-d6');
    expect(top.length).toBeGreaterThan(4);
    expect(bottom.length).toBeGreaterThan(4);
    let wins = 0;
    let games = 0;
    let goals = 0;
    for (const [i, a] of top.entries())
      for (const [j, b] of bottom.entries()) {
        const setup = {
          seed: i * 31 + j,
          home: toMatchTeam(a, squads.get(a.id) as never),
          away: toMatchTeam(b, squads.get(b.id) as never),
          conditions: { surface: 'grass' as const, rain: false, windSpeed: 0, windDirection: 0 },
        };
        const result = sim.simulateMatch(setup);
        games++;
        goals += result.score[0] + result.score[1];
        if (result.score[0] > result.score[1]) wins++;
      }
    expect(wins / games).toBeGreaterThan(0.75);
    expect(goals / games).toBeGreaterThan(1.5);
    expect(goals / games).toBeLessThan(6);
  });

  it('two clubs of a division are close: neither crushes the other', () => {
    const d3 = clubs.filter((c) => c.divisionId === 'escaut-d3').slice(0, 12);
    let homeWins = 0;
    let games = 0;
    for (let i = 0; i + 1 < d3.length; i += 2)
      for (let seed = 0; seed < 20; seed++) {
        const a = d3[i] as Club;
        const b = d3[i + 1] as Club;
        const result = sim.simulateMatch({
          seed,
          home: toMatchTeam(a, squads.get(a.id) as never),
          away: toMatchTeam(b, squads.get(b.id) as never),
          conditions: { surface: 'grass', rain: false, windSpeed: 0, windDirection: 0 },
        });
        games++;
        if (result.score[0] > result.score[1]) homeWins++;
      }
    expect(homeWins / games).toBeGreaterThan(0.15);
    expect(homeWins / games).toBeLessThan(0.85);
  });
});
