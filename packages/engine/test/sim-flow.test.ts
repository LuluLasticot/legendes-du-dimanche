import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TACTIC,
  demoTeam,
  matchRatings,
  MatchSim,
  replayMatch,
  type MatchSetup,
  type ShotOutcome,
} from '../src/sim/index.ts';

const setup = (seed: number): MatchSetup => ({
  seed,
  home: demoTeam(seed, { id: 'home', name: 'Home', rating: 62 }),
  away: demoTeam(seed + 7, { id: 'away', name: 'Away', rating: 58 }),
  conditions: { surface: 'grass', rain: false, windSpeed: 0, windDirection: 0 },
});

/** Plays a match like the match screen: pause at half-time, changes there, moments answered. */
const play = (seed: number) => {
  const sim = new MatchSim(setup(seed), { userSide: 0, pauseAtHalfTime: true });
  let breaks = 0;
  const answers: ShotOutcome[] = ['goal', 'save-catch', 'miss', 'save-parry', 'goal', 'post'];
  let n = 0;
  while (sim.step()) {
    if (sim.waiting === 'moment') sim.resolveMoment(answers[n++ % answers.length] as ShotOutcome);
    else if (sim.waiting === 'half-time') {
      breaks++;
      const out = sim.lineup(0)[10];
      const bench = sim.benchOf(0).find((p) => p.positions[0] === 'ST');
      if (out && bench) sim.substitute(0, out.id, bench.id);
      sim.setTactic(0, { ...DEFAULT_TACTIC, mentality: 2, pressing: 5 });
      sim.resumeSecondHalf();
    }
  }
  return { sim, breaks, result: sim.result() };
};

describe('match flow with the player', () => {
  it('stops once at half-time and lets the coach change things', () => {
    const { sim, breaks, result } = play(4);
    expect(breaks).toBe(1);
    expect(
      result.events.filter((e) => e.kind === 'sub' && e.half === 2).length,
    ).toBeGreaterThanOrEqual(1);
    expect(sim.tacticOf(0).mentality).toBe(2);
    expect(sim.subsLeft(0)).toBeLessThan(5);
  });

  it("replays the same match from the player's inputs", () => {
    for (const seed of [1, 2, 3, 9]) {
      const { sim, result } = play(seed);
      const again = replayMatch(setup(seed), { userSide: 0, pauseAtHalfTime: true }, sim.inputs);
      expect(JSON.stringify(again)).toBe(JSON.stringify(result));
    }
  });

  it('other inputs, other match', () => {
    const { sim, result } = play(2);
    const changed = { ...sim.inputs, moments: sim.inputs.moments.map(() => 'goal' as const) };
    const other = replayMatch(setup(2), { userSide: 0, pauseAtHalfTime: true }, changed);
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(result));
  });
});

describe('ratings', () => {
  it('rates everyone who played, in a sane range, with a man of the match', () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = setup(seed);
      const { result } = play(seed);
      const ratings = matchRatings(s, result);
      const played = ratings.players.filter((p) => p.minutes > 0);
      expect(played.length).toBeGreaterThanOrEqual(22);
      for (const p of played) {
        expect(p.rating).toBeGreaterThanOrEqual(3);
        expect(p.rating).toBeLessThanOrEqual(10);
        expect(p.minutes).toBeLessThanOrEqual(100);
      }
      const motm = ratings.manOfTheMatch;
      expect(motm).not.toBeNull();
      expect(Math.max(...played.map((p) => p.rating))).toBe(motm?.rating);
    }
  });

  it('scorers are rewarded, a red card and conceding hurt', () => {
    const s = setup(3);
    const { result } = play(3);
    const ratings = matchRatings(s, result);
    const goals = result.events.filter((e) => e.kind === 'goal');
    for (const g of goals.slice(0, 3)) {
      const p = ratings.players.find((x) => x.id === g.player);
      expect(p?.goals).toBeGreaterThanOrEqual(1);
      expect(p?.rating).toBeGreaterThan(6.4);
    }
    const reds = result.events.filter((e) => e.kind === 'red');
    for (const r of reds) {
      expect(ratings.players.find((x) => x.id === r.player)?.rating).toBeLessThan(6);
    }
  });
});
