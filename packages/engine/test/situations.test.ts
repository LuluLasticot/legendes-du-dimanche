import { describe, expect, it } from 'vitest';
import {
  applyExecutionError,
  applyPassError,
  defendersAfterPass,
  firstTimeDifficulty,
  markerSetups,
  opponentShot,
  passBall,
  passerProfile,
  passLayout,
  RECEIVER_RUN_SPEED,
  penaltyGauge,
  penaltyKeeperFeet,
  penaltySpot,
  receptionTicks,
  shooterProfile,
  simulatePassMoment,
  simulateShotMoment,
  solvePass,
  solveShot,
  wallSize,
  type DefenderAttributes,
  type KeeperAttributes,
  type KeeperCommand,
  type ShotMomentSetup,
} from '../src/moments/index.ts';
import {
  BALL,
  DEFAULT_PHYSICS,
  GOAL,
  kickedBall,
  PITCH,
  simulateFlight,
  v3,
  type Vec3,
} from '../src/physics/index.ts';
import { Rng } from '../src/rng/index.ts';

const KEEPER: KeeperAttributes = {
  diving: 70,
  handling: 70,
  reflexes: 70,
  speed: 65,
  positioning: 70,
  heightCm: 186,
};
const MARKER: DefenderAttributes = { pace: 70, defending: 70, physical: 70, heightCm: 182 };
const SHOOTER = shooterProfile(
  { shotPower: 75, curve: 70, finishing: 75, composure: 70 },
  { weakFoot: false, weakFootStars: 3, pressure: 0 },
);

describe('ground pass solver', () => {
  const profile = passerProfile({ passing: 75, composure: 70 }, 0);
  const from = v3(PITCH.goalLineX - 30, 0, 10);
  const target = v3(PITCH.goalLineX - 14, 0, 0);
  const distance = Math.hypot(target.x - from.x, target.z - from.z);

  it('arrives no earlier than wanted while it can, still rolling', () => {
    const solution = solvePass(from, target, 150, profile, DEFAULT_PHYSICS, 'grass');
    expect(solution.arrivalTicks).not.toBeNull();
    expect(solution.arrivalTicks as number).toBeLessThanOrEqual(151);
    const path = simulateFlight(passBall(from, solution.velocity), {
      params: DEFAULT_PHYSICS,
      surface: 'grass',
      rng: null,
    });
    const at = path.samples[solution.arrivalTicks as number];
    expect(at).toBeDefined();
    const speed = Math.hypot(at?.vel.x ?? 0, at?.vel.z ?? 0);
    expect(speed).toBeGreaterThanOrEqual(profile.minArrivalSpeed - 0.1);
  });

  it('hits harder when the receiver is already there', () => {
    const late = solvePass(from, target, 200, profile, DEFAULT_PHYSICS, 'grass');
    const early = solvePass(from, target, 40, profile, DEFAULT_PHYSICS, 'grass');
    expect(Math.hypot(early.velocity.x, early.velocity.z)).toBeGreaterThan(
      Math.hypot(late.velocity.x, late.velocity.z),
    );
    expect(distance).toBeGreaterThan(15);
  });

  it('good passers are more accurate', () => {
    const spread = (passing: number): number => {
      const p = passerProfile({ passing, composure: 70 }, 0);
      const rng = Rng.create('pass-error');
      let sum = 0;
      for (let i = 0; i < 400; i++) {
        const v = applyPassError(v3(15, 0, 0), p, rng);
        sum += Math.abs(Math.atan2(v.z, v.x));
      }
      return sum / 400;
    };
    expect(spread(35)).toBeGreaterThan(spread(90) * 2.5);
  });
});

describe('pass moment', () => {
  const layout = passLayout(0);
  const pass = (seed: number, markers: number, targetZ = 3) => {
    const target = v3(PITCH.goalLineX - 11, 0, targetZ);
    const profile = passerProfile({ passing: 80, composure: 70 }, 0);
    const run = receptionTicks(layout.receiver, target, 80, RECEIVER_RUN_SPEED);
    const solution = solvePass(layout.ball, target, run, profile, DEFAULT_PHYSICS, 'grass');
    const velocity = applyPassError(solution.velocity, profile, Rng.create(seed));
    const defenders = markerSetups(layout, markers, MARKER);
    return {
      defenders,
      result: simulatePassMoment({
        ball: passBall(layout.ball, velocity),
        physics: DEFAULT_PHYSICS,
        surface: 'grass',
        receiver: { from: layout.receiver, pace: 80, speed: RECEIVER_RUN_SPEED },
        keeper: { attributes: KEEPER },
        defenders,
        seed: seed + 1,
      }),
    };
  };

  it('the receiver meets an unopposed pass near the target', () => {
    let received = 0;
    for (let seed = 0; seed < 30; seed++) {
      const { result } = pass(seed, 0);
      if (result.outcome !== 'received') continue;
      received++;
      const last = result.states[result.states.length - 1];
      const ball = last?.flight.ball.pos;
      expect(ball).toBeDefined();
      expect(Math.abs((ball?.x ?? 0) - (PITCH.goalLineX - 11))).toBeLessThan(1.5);
      expect(Math.abs((ball?.z ?? 0) - 3)).toBeLessThan(2.5);
    }
    expect(received).toBe(30);
  });

  it('markers cut out passes played close to them, and it is deterministic', () => {
    const intercepted = (targetZ: number): number => {
      let n = 0;
      for (let seed = 0; seed < 30; seed++) {
        if (pass(seed, 2, targetZ).result.outcome === 'intercepted') n++;
      }
      return n;
    };
    // Far post defender at z = −4: a ball across the goal is riskier than one kept near side.
    expect(intercepted(0)).toBeGreaterThan(intercepted(3) + 8);
    const a = pass(7, 2);
    const b = pass(7, 2);
    expect(JSON.stringify(a.result.states)).toBe(JSON.stringify(b.result.states));
  });

  it('carries the defenders positions into the shot', () => {
    const { result, defenders } = pass(3, 2);
    const last = result.states[result.states.length - 1];
    const carried = defendersAfterPass(defenders, last?.defenders ?? []);
    expect(carried).toHaveLength(defenders.length);
    expect(carried[0]?.feet).toEqual(
      v3(last?.defenders[0]?.feet.x ?? 0, 0, last?.defenders[0]?.feet.z ?? 0),
    );
  });
});

describe('first-time difficulty', () => {
  const shot = v3(1, 0, 0);
  it('is zero for a ball at rest and grows with pace and turn', () => {
    const rest = firstTimeDifficulty(
      kickedBall(v3(0, BALL.radius, 0), v3(0, 0, 0), v3(0, 0, 0)),
      shot,
    );
    const along = firstTimeDifficulty(
      kickedBall(v3(0, BALL.radius, 0), v3(10, 0, 0), v3(0, 0, 0)),
      shot,
    );
    const across = firstTimeDifficulty(
      kickedBall(v3(0, BALL.radius, 0), v3(0, 0, 10), v3(0, 0, 0)),
      shot,
    );
    const back = firstTimeDifficulty(
      kickedBall(v3(0, BALL.radius, 0), v3(-10, 0, 0), v3(0, 0, 0)),
      shot,
    );
    expect(rest).toBe(0);
    expect(along).toBeLessThan(across);
    expect(across).toBeLessThan(back);
    const volley = firstTimeDifficulty(kickedBall(v3(0, 1, 0), v3(0, 0, 10), v3(0, 0, 0)), shot);
    expect(volley).toBeGreaterThan(across);
  });

  it('widens the error cone', () => {
    const base = { weakFoot: false, weakFootStars: 3, pressure: 0 };
    const attrs = { shotPower: 70, curve: 70, finishing: 70, composure: 70 };
    expect(shooterProfile(attrs, { ...base, difficulty: 1 }).errorRad).toBeCloseTo(
      shooterProfile(attrs, base).errorRad * 2.5,
      9,
    );
  });
});

describe('penalty', () => {
  const run = (positioning: number, n: number) => {
    let goals = 0;
    let diveBeforeHalfway = 0;
    const from = v3(penaltySpot().x, BALL.radius, 0);
    for (let i = 0; i < n; i++) {
      const rng = Rng.create('penalty').fork('kick', i);
      const side = rng.chance(0.5) ? -1 : 1;
      const target = v3(PITCH.goalLineX, 0.3 + rng.float() * 1.6, side * (2.2 + rng.float() * 1));
      const solution = solveShot(
        from,
        { target, power: 0.75, bulge: 0, lob: false },
        SHOOTER,
        DEFAULT_PHYSICS,
        'grass',
      );
      const struck = applyExecutionError(solution, SHOOTER, rng.fork('exec'));
      const result = simulateShotMoment({
        ball: kickedBall(from, struck.velocity, struck.spin),
        physics: DEFAULT_PHYSICS,
        surface: 'grass',
        keeper: {
          attributes: { ...KEEPER, positioning },
          feet: penaltyKeeperFeet(),
          mode: 'penalty',
        },
        seed: rng.fork('moment').nextU32(),
      });
      if (result.outcome === 'goal') goals++;
      const dive = result.events.find((e) => e.type === 'keeper-dive');
      if (dive && dive.tick < 20) diveBeforeHalfway++;
    }
    return { rate: goals / n, dives: diveBeforeHalfway / n };
  };

  it('converts most penalties, and the keeper commits at the kick', () => {
    const { rate, dives } = run(70, 300);
    expect(rate).toBeGreaterThan(0.6);
    expect(rate).toBeLessThan(0.92);
    expect(dives).toBeGreaterThan(0.7);
  });

  it('a keeper who reads penalties saves more', () => {
    expect(run(95, 400).rate).toBeLessThan(run(5, 400).rate);
  });

  it('gauge: full power past the sweet spot gets hard to control', () => {
    expect(penaltyGauge(0.5)).toEqual({ power: 0.5, difficulty: 0 });
    expect(penaltyGauge(0.82).difficulty).toBe(0);
    expect(penaltyGauge(1).difficulty).toBe(1);
    expect(penaltyGauge(0.91).difficulty).toBeGreaterThan(0);
  });
});

describe('keeper controlled by the player', () => {
  const from = v3(PITCH.goalLineX - 16, BALL.radius, 0);
  const lowCorner = v3(PITCH.goalLineX, 0.4, -2.3);
  const setup = (commands: readonly KeeperCommand[]): ShotMomentSetup => {
    const solution = solveShot(
      from,
      { target: lowCorner, power: 0.6, bulge: 0, lob: false },
      SHOOTER,
      DEFAULT_PHYSICS,
      'grass',
    );
    return {
      ball: kickedBall(from, solution.velocity, solution.spin),
      physics: DEFAULT_PHYSICS,
      surface: 'grass',
      keeper: { attributes: KEEPER, mode: 'player', commands },
      seed: 11,
    };
  };

  it('no dive: the corner is left open', () => {
    expect(simulateShotMoment(setup([])).outcome).toBe('goal');
  });

  it('diving the right way in time saves it, the wrong way does not', () => {
    const right = simulateShotMoment(setup([{ tick: 40, target: lowCorner }]));
    expect(right.outcome).toBe('saved');
    const wrong = simulateShotMoment(setup([{ tick: 40, target: v3(PITCH.goalLineX, 0.4, 2.3) }]));
    expect(wrong.outcome).toBe('goal');
  });

  it('a swipe a little early is held until the right moment; too late is still a goal', () => {
    expect(simulateShotMoment(setup([{ tick: 1, target: lowCorner }])).outcome).not.toBe('goal');
    expect(simulateShotMoment(setup([{ tick: 80, target: lowCorner }])).outcome).toBe('goal');
  });

  it('on the right side, a rough swipe is pulled towards the ball', () => {
    const rough = v3(PITCH.goalLineX, 1.2, -1.6);
    expect(simulateShotMoment(setup([{ tick: 30, target: rough }])).outcome).not.toBe('goal');
  });
});

describe('situations', () => {
  it('wall size shrinks with distance', () => {
    expect(wallSize(18, 0)).toBe(5);
    expect(wallSize(26, 0)).toBe(3);
    expect(wallSize(40, 0)).toBe(0);
  });

  it('the opponent mostly hits the target area', () => {
    let onTarget = 0;
    const from: Vec3 = v3(PITCH.goalLineX - 18, BALL.radius, 3);
    for (let i = 0; i < 100; i++) {
      const shot = opponentShot(from, SHOOTER, DEFAULT_PHYSICS, 'grass', Rng.create(i));
      expect(Math.abs(shot.target.z)).toBeLessThan(GOAL.width / 2);
      const flight = simulateFlight(kickedBall(from, shot.velocity, shot.spin), {
        params: DEFAULT_PHYSICS,
        surface: 'grass',
        rng: null,
      });
      if (flight.outcome === 'goal') onTarget++;
    }
    expect(onTarget).toBeGreaterThan(55);
  });
});
