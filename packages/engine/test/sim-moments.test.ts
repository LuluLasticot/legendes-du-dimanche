import { describe, expect, it } from 'vitest';
import {
  autoResolveMoment,
  demoTeam,
  MatchSim,
  momentSpot,
  type MatchConditions,
  type MatchSetup,
  type MomentRequest,
  type ShotOutcome,
} from '../src/sim/index.ts';
import { PITCH } from '../src/physics/index.ts';

const GRASS: MatchConditions = { surface: 'grass', rain: false, windSpeed: 0, windDirection: 0 };
const setup = (seed: number): MatchSetup => ({
  seed,
  home: demoTeam(seed, { id: 'home', name: 'Home', rating: 62 }),
  away: demoTeam(seed + 7, { id: 'away', name: 'Away', rating: 62 }),
  conditions: GRASS,
});

const play = (seed: number, resolve: (m: MomentRequest) => ShotOutcome) => {
  const sim = new MatchSim(setup(seed), { userSide: 0 });
  const requests: MomentRequest[] = [];
  const result = sim.run((m) => {
    requests.push(m);
    return resolve(m);
  });
  return { sim, result, requests };
};

describe('key moments in a match', () => {
  it('3 to 6 moments per match, the match waits for each outcome', () => {
    let within = 0;
    for (let seed = 0; seed < 40; seed++) {
      const { requests, sim } = play(seed, () => 'miss');
      expect(requests.length).toBeLessThanOrEqual(6);
      expect(sim.playedMoments).toHaveLength(requests.length);
      if (requests.length >= 3) within++;
    }
    // Late in the match any chance becomes a moment until there are three: ~99 % of matches.
    expect(within).toBeGreaterThanOrEqual(39);
  });

  it("the player's outcomes decide the score", () => {
    const scored = play(3, (m) => (m.kind === 'keeper' ? 'save-catch' : 'goal'));
    const missed = play(3, (m) => (m.kind === 'keeper' ? 'goal' : 'miss'));
    const attacking = scored.requests.filter((m) => m.kind !== 'keeper').length;
    expect(scored.result.score[0]).toBeGreaterThanOrEqual(attacking);
    expect(scored.result.score[0]).toBeGreaterThan(missed.result.score[0]);
  });

  it('same seed and same inputs → same match', () => {
    const inputs = (m: MomentRequest): ShotOutcome => (m.id % 2 === 0 ? 'goal' : 'save-parry');
    expect(JSON.stringify(play(9, inputs).result)).toBe(JSON.stringify(play(9, inputs).result));
  });

  it('moment spots are in the attacking half, penalties on the spot', () => {
    for (let seed = 0; seed < 10; seed++) {
      for (const m of play(seed, () => 'miss').requests) {
        const p = momentSpot(m);
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(PITCH.goalLineX);
        if (m.kind === 'penalty') expect(p.x).toBeCloseTo(PITCH.goalLineX - 11, 6);
      }
    }
  });

  it('auto-resolution is plausible and deterministic', () => {
    const requests = Array.from({ length: 12 }, (_, s) => play(s, () => 'miss').requests).flat();
    const outcomes = requests.map((m) => autoResolveMoment(m, GRASS));
    expect(outcomes).toEqual(requests.map((m) => autoResolveMoment(m, GRASS)));
    const goals = outcomes.filter((o) => o === 'goal').length / outcomes.length;
    expect(goals).toBeGreaterThan(0.1);
    expect(goals).toBeLessThan(0.75);
  });
});
