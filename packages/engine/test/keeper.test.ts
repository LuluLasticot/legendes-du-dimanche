import { describe, expect, it } from 'vitest';
import {
  applyExecutionError,
  createKeeper,
  DEFAULT_KEEPER_TUNING,
  keeperReachEnvelope,
  keeperSetPosition,
  shooterProfile,
  simulateShotMoment,
  solveShot,
  type KeeperAttributes,
  type ShotMomentSetup,
} from '../src/moments/index.ts';
import { BALL, DEFAULT_PHYSICS, GOAL, kickedBall, PITCH, v3, type Vec3 } from '../src/physics/index.ts';
import { Rng } from '../src/rng/index.ts';

const GOOD: KeeperAttributes = { diving: 85, handling: 85, reflexes: 88, speed: 70, positioning: 85, heightCm: 190 };
const POOR: KeeperAttributes = { diving: 35, handling: 35, reflexes: 35, speed: 40, positioning: 35, heightCm: 178 };

const spot = (distance: number, z = 0): Vec3 => v3(PITCH.goalLineX - distance, BALL.radius, z);

function strike(from: Vec3, target: Vec3, power: number, bulge: number, seed: number) {
  const profile = shooterProfile(
    { shotPower: 80, curve: 75, finishing: 80, composure: 75 },
    { weakFoot: false, weakFootStars: 3, pressure: 0 },
  );
  const solution = solveShot(from, { target, power, bulge, lob: false }, profile, DEFAULT_PHYSICS, 'grass');
  return applyExecutionError(solution, profile, Rng.create(seed));
}

function moment(from: Vec3, target: Vec3, keeper: KeeperAttributes | null, seed = 1, power = 0.8, bulge = 0): ShotMomentSetup {
  const s = strike(from, target, power, bulge, seed);
  return {
    ball: kickedBall(from, s.velocity, s.spin),
    physics: DEFAULT_PHYSICS,
    surface: 'grass',
    keeper: keeper ? { attributes: keeper } : null,
    seed,
  };
}

describe('keeper set position', () => {
  it('stands in the middle for a central ball, shifts to the near post for an angled one', () => {
    expect(keeperSetPosition(spot(20), GOOD).z).toBeCloseTo(0, 9);
    const angled = keeperSetPosition(spot(14, 12), GOOD);
    expect(angled.z).toBeGreaterThan(0.5);
    expect(angled.z).toBeLessThan(GOAL.width / 2);
    expect(angled.x).toBeLessThan(PITCH.goalLineX);
  });

  it('better positioning means standing further off the line', () => {
    expect(keeperSetPosition(spot(20), GOOD).x).toBeLessThan(keeperSetPosition(spot(20), POOR).x);
  });
});

describe('keeper reaction and reach', () => {
  it('reacts faster with better reflexes', () => {
    const good = createKeeper(v3(51, 0, 0), GOOD, DEFAULT_KEEPER_TUNING, Rng.create(3));
    const poor = createKeeper(v3(51, 0, 0), POOR, DEFAULT_KEEPER_TUNING, Rng.create(3));
    expect(good.reactionTick).toBeLessThan(poor.reactionTick);
  });

  it('cannot cover the whole goal from the middle', () => {
    expect(keeperReachEnvelope(GOOD).lateral).toBeLessThan(GOAL.width / 2 + 0.1);
  });
});

describe('shot moments with a keeper', () => {
  it('a soft shot straight at the keeper is saved', () => {
    const result = simulateShotMoment(moment(spot(20), v3(PITCH.goalLineX, 1, 0), GOOD, 1, 0.35));
    expect(result.outcome).toBe('saved');
    expect(result.events.some((e) => e.type === 'save')).toBe(true);
  });

  it('a powerful curler into the top corner beats him', () => {
    const target = v3(PITCH.goalLineX, 2.15, GOAL.width / 2 - 0.35);
    const result = simulateShotMoment(moment(spot(18, -3), target, GOOD, 2, 1, 0.7));
    expect(result.outcome).toBe('goal');
  });

  it('without a keeper the same central shot is a goal', () => {
    expect(simulateShotMoment(moment(spot(20), v3(PITCH.goalLineX, 1, 0), null, 1, 0.35)).outcome).toBe('goal');
  });

  it('is deterministic', () => {
    const setup = moment(spot(17, 4), v3(PITCH.goalLineX, 0.6, -2), GOOD, 9, 0.9, -0.4);
    const a = simulateShotMoment(setup, 720, 60);
    const b = simulateShotMoment(setup, 720, 60);
    expect(a.outcome).toBe(b.outcome);
    expect(a.states.map((s) => s.flight.ball.pos)).toEqual(b.states.map((s) => s.flight.ball.pos));
    expect(a.states.map((s) => s.keeper?.hands)).toEqual(b.states.map((s) => s.keeper?.hands));
  });

  it('a good keeper saves perceptibly more than a poor one', () => {
    const rng = Rng.create('keeper-stats');
    const shots: { from: Vec3; target: Vec3; power: number; bulge: number; seed: number }[] = [];
    for (let i = 0; i < 300; i++) {
      shots.push({
        from: spot(rng.range(12, 25), rng.range(-10, 10)),
        target: v3(PITCH.goalLineX, rng.range(0.2, 2.3), rng.range(-3.4, 3.4)),
        power: rng.range(0.55, 1),
        bulge: rng.range(-0.8, 0.8),
        seed: i + 1,
      });
    }
    const rate = (keeper: KeeperAttributes): number => {
      let goals = 0;
      let onTarget = 0;
      for (const s of shots) {
        const result = simulateShotMoment(moment(s.from, s.target, keeper, s.seed, s.power, s.bulge));
        if (result.outcome === 'goal' || result.outcome === 'saved') onTarget++;
        if (result.outcome === 'goal') goals++;
      }
      return goals / onTarget;
    };
    const good = rate(GOOD);
    const poor = rate(POOR);
    expect(poor - good).toBeGreaterThan(0.15);
    // Neither extreme: shots still score against a good keeper, and a poor one still saves some.
    expect(good).toBeGreaterThan(0.2);
    expect(poor).toBeLessThan(0.95);
  });
});
