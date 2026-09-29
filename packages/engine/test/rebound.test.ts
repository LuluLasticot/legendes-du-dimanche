import { describe, expect, it } from 'vitest';
import {
  attackerMover,
  keeperMover,
  outfieldMover,
  reboundCovers,
  reboundRunners,
  secondBallSetup,
  shooterProfile,
  simulateShotMoment,
  solveShot,
  startChase,
  startShotMoment,
  stepChase,
  stepShotMoment,
  type DefenderAttributes,
  type KeeperAttributes,
  type ShotMomentSetup,
} from '../src/moments/index.ts';
import { DEFAULT_PHYSICS, GOAL, kickedBall, PITCH, v3, type Vec3 } from '../src/physics/index.ts';
import { Rng } from '../src/rng/index.ts';
import { autoResolveMoment, demoTeam, type MomentRequest } from '../src/sim/index.ts';

const KEEPER: KeeperAttributes = {
  diving: 70,
  handling: 45,
  reflexes: 75,
  speed: 65,
  positioning: 70,
  heightCm: 186,
};
const DEFENDER: DefenderAttributes = { pace: 70, defending: 70, physical: 70, heightCm: 182 };
const SHOOTER = shooterProfile(
  { shotPower: 80, curve: 70, finishing: 80, composure: 75 },
  { weakFoot: false, weakFootStars: 3, pressure: 0 },
);
const flight = { params: DEFAULT_PHYSICS, surface: 'grass' as const, rng: null };
const resting = (at: Vec3) => kickedBall(v3(at.x, 0.11, at.z), v3(0, 0, 0), v3(0, 0, 0));

describe('the race for a loose ball', () => {
  const ball = resting(v3(PITCH.goalLineX - 8, 0, 0));
  const race = (attacker: Vec3, defender: Vec3) => {
    let chase = startChase({
      tick: 0,
      attackers: [{ feet: attacker, pace: 70 }],
      defenders: [defender],
      keeper: null,
    });
    const movers = {
      attackers: [attackerMover(70)],
      defenders: [outfieldMover(7, 0.45, 2.3)],
      keeper: null,
    };
    for (let tick = 1; tick < 600; tick++) {
      const step = stepChase(chase, tick, ball, movers, flight, {
        bounced: false,
        defenders: [defender],
        keeper: null,
      });
      chase = step.chase;
      if (step.winner) return step.winner;
    }
    return null;
  };

  it('goes to whoever gets there first', () => {
    expect(race(v3(PITCH.goalLineX - 12, 0, 0), v3(PITCH.goalLineX - 8, 0, 9))).toEqual({
      side: 'attack',
      index: 0,
    });
    expect(race(v3(PITCH.goalLineX - 16, 0, 0), v3(PITCH.goalLineX - 8, 0, 3))).toEqual({
      side: 'defence',
      index: 0,
    });
  });

  it('lets a keeper who is down get up before he runs', () => {
    const keeperFeet = v3(PITCH.goalLineX - 1, 0, 0);
    const attacker = v3(PITCH.goalLineX - 20, 0, 0);
    const winner = (downUntil: number | null) => {
      let chase = startChase({
        tick: 0,
        attackers: [{ feet: attacker, pace: 70 }],
        defenders: [],
        keeper: { feet: keeperFeet, downUntil },
      });
      const movers = { attackers: [attackerMover(70)], defenders: [], keeper: keeperMover(6, 2.7) };
      for (let tick = 1; tick < 600; tick++) {
        const step = stepChase(chase, tick, ball, movers, flight, {
          bounced: false,
          defenders: [],
          keeper: keeperFeet,
        });
        chase = step.chase;
        if (step.winner) return step.winner.side;
      }
      return null;
    };
    // On his feet, the keeper is first to a ball 7 m out; lying on the grass, he is too late.
    expect(winner(null)).toBe('keeper');
    expect(winner(80)).toBe('attack');
  });
});

describe('second balls in a shot moment', () => {
  const from = v3(PITCH.goalLineX - 14, 0.11, -2);
  const runners = reboundRunners('free', from);
  const setupFor = (target: Vec3, seed: number, keeper = true): ShotMomentSetup => {
    const solution = solveShot(
      from,
      { target, power: 0.9, bulge: 0, lob: false },
      SHOOTER,
      DEFAULT_PHYSICS,
      'grass',
    );
    return {
      ball: kickedBall(from, solution.velocity, solution.spin),
      physics: DEFAULT_PHYSICS,
      surface: 'grass',
      keeper: keeper ? { attributes: KEEPER } : null,
      defenders: reboundCovers('free', from).map((feet) => ({
        role: 'cover' as const,
        feet,
        attributes: DEFENDER,
      })),
      seed,
      rebound: {
        attackers: [
          { feet: v3(from.x - 0.4, 0, from.z), pace: 75 },
          ...runners.map((feet) => ({ feet, pace: 70 })),
        ],
      },
    };
  };

  it('follows up a shot off the post: one of ours or the defence gets the ball', () => {
    const outcomes = new Set<string>();
    for (let i = 0; i < 12; i++) {
      // Inside of the far post, low: it comes back into the box.
      const target = v3(PITCH.goalLineX, 0.5 + i * 0.1, GOAL.width / 2 + 0.05);
      const result = simulateShotMoment(setupFor(target, i, false), 1200);
      if (!result.events.some((e) => e.type === 'frame')) continue;
      if (result.outcome !== null) outcomes.add(result.outcome);
      if (result.outcome === 'rebound') {
        const event = result.events.find((e) => e.type === 'rebound');
        expect(event).toBeDefined();
        const last = result.states[result.states.length - 1];
        expect(last?.flight.ball.pos.y).toBeLessThanOrEqual(1.1);
      }
    }
    expect([...outcomes].some((o) => o === 'rebound' || o === 'cleared')).toBe(true);
  });

  it('follows up parries, and is deterministic', () => {
    let parries = 0;
    let rebounds = 0;
    const first: string[] = [];
    for (let seed = 0; seed < 80; seed++) {
      const rng = Rng.create(seed);
      const target = v3(PITCH.goalLineX, 0.3 + rng.float() * 1.6, (rng.float() - 0.5) * 5);
      const result = simulateShotMoment(setupFor(target, seed), 1200);
      first.push(result.outcome ?? 'none');
      if (!result.events.some((e) => e.type === 'save' && e.kind === 'parry')) continue;
      parries++;
      if (result.outcome === 'rebound') rebounds++;
      expect(['rebound', 'cleared', 'saved', 'goal']).toContain(result.outcome);
    }
    expect(parries).toBeGreaterThan(5);
    expect(rebounds).toBeGreaterThan(0);
    // Same setups, same outcomes.
    for (let seed = 0; seed < 80; seed++) {
      const rng = Rng.create(seed);
      const target = v3(PITCH.goalLineX, 0.3 + rng.float() * 1.6, (rng.float() - 0.5) * 5);
      expect(simulateShotMoment(setupFor(target, seed), 1200).outcome ?? 'none').toBe(first[seed]);
    }
  });

  it('never chases without a rebound setup (the moments of Phase 1 are unchanged)', () => {
    for (let seed = 0; seed < 30; seed++) {
      const { rebound: _, ...plain } = setupFor(v3(PITCH.goalLineX, 1, 2.8), seed);
      const result = simulateShotMoment(plain, 1200);
      expect(result.states.every((s) => s.chase === null)).toBe(true);
      expect(result.outcome).not.toBe('rebound');
    }
  });

  it('sets the second shot up with the keeper still down if he has not got up', () => {
    for (let seed = 0; seed < 200; seed++) {
      const rng = Rng.create(seed);
      const target = v3(PITCH.goalLineX, 0.3 + rng.float() * 1.6, (rng.float() - 0.5) * 5);
      const setup = setupFor(target, seed);
      const { context, state: initial } = startShotMoment(setup);
      let state = initial;
      while (state.outcome === null && state.tick < 1200)
        state = stepShotMoment(state, context).state;
      if (state.outcome !== 'rebound') continue;
      const second = secondBallSetup(
        setup,
        state,
        kickedBall(state.flight.ball.pos, v3(20, 2, 0), v3(0, 0, 0)),
        7,
      );
      expect(second.rebound).toBeUndefined();
      expect(second.defenders).toHaveLength(setup.defenders?.length ?? 0);
      const lying = state.keeper?.phase === 'grounded' || state.keeper?.phase === 'diving';
      if (lying && state.tick < (state.chase?.keeper?.startTick ?? 0)) {
        expect(second.keeper?.down).toBeDefined();
        const { state: start } = startShotMoment(second);
        expect(start.keeper?.phase).toBe('grounded');
        return;
      }
    }
  });
});

describe('automatic resolution with second balls', () => {
  const home = demoTeam(3, { id: 'h', name: 'H', rating: 62 });
  const away = demoTeam(5, { id: 'a', name: 'A', rating: 60 });
  const request = (seed: number, kind: MomentRequest['kind']): MomentRequest => {
    const shooter = home.players[9] ?? home.players[0];
    const keeper = away.players[0];
    if (!shooter || !keeper) throw new Error('demo team');
    return {
      id: seed,
      kind,
      t: 600,
      half: 1,
      attacking: 0,
      shooter,
      shooterAttributes: {
        pace: 70,
        shooting: 72,
        passing: 65,
        dribbling: 68,
        defending: 40,
        physical: 66,
      },
      keeper,
      spot: { x: 0.45, y: 0.82 },
      xg: 0.3,
      seed,
    };
  };
  const conditions = { surface: 'grass' as const, rain: false, windSpeed: 0, windDirection: 0 };

  it('stays deterministic and in credible ranges', () => {
    for (const kind of ['shot', 'penalty', 'free-kick'] as const) {
      let goals = 0;
      for (let seed = 0; seed < 300; seed++) {
        const a = autoResolveMoment(request(seed, kind), conditions);
        expect(autoResolveMoment(request(seed, kind), conditions)).toBe(a);
        if (a === 'goal') goals++;
      }
      const rate = goals / 300;
      if (kind === 'penalty') expect(rate).toBeGreaterThan(0.55);
      else expect(rate).toBeGreaterThan(0.1);
      expect(rate).toBeLessThan(0.85);
    }
  });
});
