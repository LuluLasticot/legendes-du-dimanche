import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  analyzeGesture,
  applyExecutionError,
  shooterProfile,
  solveShot,
  type GesturePoint,
  type ShotAttributes,
  type ShotIntent,
  type ShotSituation,
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

const STRIKER: ShotAttributes = { shotPower: 85, curve: 80, finishing: 88, composure: 80 };
const AVERAGE: ShotAttributes = { shotPower: 55, curve: 50, finishing: 45, composure: 50 };
const CALM: ShotSituation = { weakFoot: false, weakFootStars: 3, pressure: 0 };
const striker = shooterProfile(STRIKER, CALM);

const spot = (distance: number, z = 0): Vec3 => v3(PITCH.goalLineX - distance, BALL.radius, z);
const intent = (target: Vec3, over: Partial<ShotIntent> = {}): ShotIntent => ({
  target,
  power: 0.9,
  bulge: 0,
  lob: false,
  ...over,
});

describe('analyzeGesture', () => {
  const line = (points: [number, number][], ticksPerPoint = 3): GesturePoint[] =>
    points.map(([u, v], i) => ({ u, v, tick: i * ticksPerPoint }));

  it('a straight swipe has no bulge', () => {
    const g = analyzeGesture(
      line([
        [0.5, 0.9],
        [0.5, 0.7],
        [0.5, 0.5],
        [0.5, 0.3],
      ]),
    )!;
    expect(g.bulge).toBeCloseTo(0, 9);
    expect(g.length).toBeCloseTo(0.6, 9);
  });

  it('an arc bowing to the right gives a positive bulge (and the mirror a negative one)', () => {
    const right = analyzeGesture(
      line([
        [0.5, 0.9],
        [0.58, 0.6],
        [0.5, 0.3],
      ]),
    )!;
    const left = analyzeGesture(
      line([
        [0.5, 0.9],
        [0.42, 0.6],
        [0.5, 0.3],
      ]),
    )!;
    expect(right.bulge).toBeGreaterThan(0.4);
    expect(left.bulge).toBeCloseTo(-right.bulge, 9);
  });

  it('faster swipes mean more power', () => {
    const slow = analyzeGesture(
      line(
        [
          [0.5, 0.9],
          [0.5, 0.6],
          [0.5, 0.3],
        ],
        20,
      ),
    )!;
    const fast = analyzeGesture(
      line(
        [
          [0.5, 0.9],
          [0.5, 0.6],
          [0.5, 0.3],
        ],
        4,
      ),
    )!;
    expect(fast.power).toBeGreaterThan(slow.power);
    expect(fast.power).toBeLessThanOrEqual(1);
  });

  it('holding the finger still before lifting it does not weaken the shot', () => {
    const swipe = line(
      [
        [0.5, 0.9],
        [0.5, 0.75],
        [0.5, 0.6],
        [0.5, 0.45],
        [0.5, 0.3],
      ],
      3,
    );
    const held = [...swipe, { u: 0.5, v: 0.3, tick: 12 + 240 }];
    const heldAtStart = [{ u: 0.5, v: 0.9, tick: -240 }, ...swipe];
    const power = analyzeGesture(swipe)!.power;
    expect(analyzeGesture(held)!.power).toBeCloseTo(power, 9);
    expect(analyzeGesture(heldAtStart)!.power).toBeCloseTo(power, 9);
  });

  it('ignores taps', () => {
    expect(
      analyzeGesture(
        line([
          [0.5, 0.5],
          [0.51, 0.5],
        ]),
      ),
    ).toBeNull();
    expect(analyzeGesture([])).toBeNull();
  });
});

describe('shooterProfile', () => {
  it('better attributes mean more pace, more curl and a tighter cone', () => {
    const average = shooterProfile(AVERAGE, CALM);
    expect(striker.maxSpeed).toBeGreaterThan(average.maxSpeed);
    expect(striker.maxSpin).toBeGreaterThan(average.maxSpin);
    expect(striker.errorRad).toBeLessThan(average.errorRad);
  });

  it('weak foot and pressure widen the cone, composure limits the pressure effect', () => {
    const weak = shooterProfile(STRIKER, { ...CALM, weakFoot: true, weakFootStars: 2 });
    const weakButGood = shooterProfile(STRIKER, { ...CALM, weakFoot: true, weakFootStars: 5 });
    expect(weak.errorRad).toBeGreaterThan(striker.errorRad);
    expect(weakButGood.errorRad).toBeCloseTo(striker.errorRad, 12);
    const nervous = shooterProfile({ ...STRIKER, composure: 20 }, { ...CALM, pressure: 1 });
    const cool = shooterProfile({ ...STRIKER, composure: 95 }, { ...CALM, pressure: 1 });
    expect(nervous.errorRad).toBeGreaterThan(cool.errorRad);
  });
});

describe('solveShot', () => {
  it('hits targets in the goal mouth from 11 to 30 m, with and without curl', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 11, max: 30, noNaN: true }),
        fc.double({ min: -8, max: 8, noNaN: true }),
        fc.double({ min: -3.3, max: 3.3, noNaN: true }),
        fc.double({ min: 0.3, max: 2.2, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        (distance, fromZ, targetZ, targetY, bulge) => {
          const target = v3(PITCH.goalLineX, targetY, targetZ);
          const solution = solveShot(
            spot(distance, fromZ),
            intent(target, { bulge }),
            striker,
            DEFAULT_PHYSICS,
            'grass',
          );
          expect(solution.converged).toBe(true);
          expect(solution.miss).toBeLessThan(0.02);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('the solved strike scores when flown for real', () => {
    const target = v3(PITCH.goalLineX, 2, GOAL.width / 2 - 0.4); // top right corner
    const from = spot(20, -4);
    const solution = solveShot(
      from,
      intent(target, { bulge: 0.8 }),
      striker,
      DEFAULT_PHYSICS,
      'grass',
    );
    const flight = simulateFlight(kickedBall(from, solution.velocity, solution.spin), {
      params: DEFAULT_PHYSICS,
      surface: 'grass',
      rng: null,
    });
    expect(flight.outcome).toBe('goal');
  });

  it('a right bow makes the path bulge to the right of the straight line', () => {
    const from = spot(25);
    const target = v3(PITCH.goalLineX, 1, 0);
    const solution = solveShot(
      from,
      intent(target, { bulge: 1 }),
      striker,
      DEFAULT_PHYSICS,
      'grass',
    );
    const flight = simulateFlight(kickedBall(from, solution.velocity, solution.spin), {
      params: DEFAULT_PHYSICS,
      surface: 'grass',
      rng: null,
    });
    const mid = flight.samples.find((s) => s.pos.x >= from.x + 12.5)!;
    expect(mid.pos.z).toBeGreaterThan(0.5); // +Z is the attacker's right
  });

  it('a lob goes higher than the driven solution to the same target', () => {
    const from = spot(18);
    const target = v3(PITCH.goalLineX, 1.8, 0);
    const driven = solveShot(
      from,
      intent(target, { power: 0.5 }),
      striker,
      DEFAULT_PHYSICS,
      'grass',
    );
    const lob = solveShot(
      from,
      intent(target, { power: 0.5, lob: true }),
      striker,
      DEFAULT_PHYSICS,
      'grass',
    );
    expect(lob.converged).toBe(true);
    expect(lob.velocity.y).toBeGreaterThan(driven.velocity.y + 2);
  });

  it('power is capped by shot power', () => {
    const target = v3(PITCH.goalLineX, 1, 0);
    const weak = shooterProfile(AVERAGE, CALM);
    const fast = solveShot(
      spot(20),
      intent(target, { power: 1 }),
      striker,
      DEFAULT_PHYSICS,
      'grass',
    );
    const slow = solveShot(spot(20), intent(target, { power: 1 }), weak, DEFAULT_PHYSICS, 'grass');
    const speed = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
    expect(speed(fast.velocity)).toBeGreaterThan(speed(slow.velocity) + 3);
  });
});

describe('applyExecutionError', () => {
  const missDistance = (profile: ReturnType<typeof shooterProfile>, seed: number): number => {
    const from = spot(18);
    const target = v3(PITCH.goalLineX, 1, 0);
    const ideal = solveShot(from, intent(target), profile, DEFAULT_PHYSICS, 'grass');
    const rng = Rng.create(seed);
    let total = 0;
    const n = 200;
    for (let i = 0; i < n; i++) {
      const struck = applyExecutionError(ideal, profile, rng);
      const flight = simulateFlight(
        kickedBall(from, struck.velocity, struck.spin),
        {
          params: DEFAULT_PHYSICS,
          surface: 'grass',
          rng: null,
        },
        { maxTicks: 120 },
      );
      const crossing =
        flight.samples.find((s) => s.pos.x >= PITCH.goalLineX) ?? flight.samples.at(-1)!;
      total += Math.hypot(crossing.pos.y - 1, crossing.pos.z);
    }
    return total / n;
  };

  it('is reproducible from the seed', () => {
    const ideal = { velocity: v3(25, 3, 0), spin: v3(0, 20, 0) };
    expect(applyExecutionError(ideal, striker, Rng.create(9))).toEqual(
      applyExecutionError(ideal, striker, Rng.create(9)),
    );
  });

  it('a better finisher is perceptibly more accurate', () => {
    const good = missDistance(striker, 1);
    const poor = missDistance(shooterProfile(AVERAGE, CALM), 1);
    expect(poor).toBeGreaterThan(good * 2);
  });
});
