import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BALL,
  DEFAULT_PHYSICS,
  GOAL,
  kickedBall,
  PHYSICS_SURFACES,
  PITCH,
  restingBall,
  simulateFlight,
  stepBall,
  v3,
  withWind,
  type BallState,
  type FlightContext,
  type PhysicsParams,
  type PhysicsSurface,
  type Vec3,
} from '../src/physics/index.ts';
import { Rng } from '../src/rng/index.ts';
import { TICK_DT } from '../src/time/index.ts';

const air = (overrides: Partial<PhysicsParams['air']>): PhysicsParams => ({
  ...DEFAULT_PHYSICS,
  air: { ...DEFAULT_PHYSICS.air, ...overrides },
});
const VACUUM = air({ dragCoefficient: 0, magnusCoefficient: 0 });
const NO_GRAVITY = air({ dragCoefficient: 0, magnusCoefficient: 0, gravity: 0 });

const ctx = (
  params: PhysicsParams = DEFAULT_PHYSICS,
  surface: PhysicsSurface = 'grass',
): FlightContext => ({
  params,
  surface,
  rng: null,
});

const ZERO = v3(0, 0, 0);
const kick = (vel: Vec3, spin: Vec3 = ZERO, from: Vec3 = v3(0, BALL.radius, 0)): BallState =>
  kickedBall(from, vel, spin);

function firstBounce(ball: BallState, c: FlightContext) {
  const flight = simulateFlight(ball, c, { maxTicks: 1200 });
  const bounce = flight.events.find((e) => e.type === 'bounce');
  if (!bounce) throw new Error('no bounce');
  return { tick: bounce.tick, pos: bounce.pos, flight };
}

function apex(ball: BallState, c: FlightContext): number {
  return Math.max(...simulateFlight(ball, c, { maxTicks: 400 }).samples.map((s) => s.pos.y));
}

describe('flight', () => {
  it('matches the analytic parabola in a vacuum', () => {
    const { tick, pos } = firstBounce(kick(v3(10, 10, 0)), ctx(VACUUM));
    const flightTime = (2 * 10) / 9.81;
    expect(Math.abs(tick * TICK_DT - flightTime)).toBeLessThan(2 * TICK_DT);
    expect(pos.x).toBeCloseTo(10 * flightTime, 0);
  });

  it('drag shortens the range', () => {
    const vacuum = firstBounce(kick(v3(20, 12, 0)), ctx(VACUUM)).pos.x;
    const withDrag = firstBounce(kick(v3(20, 12, 0)), ctx()).pos.x;
    expect(withDrag).toBeLessThan(vacuum * 0.85);
  });

  it('sidespin around +Y curls a ball travelling +X towards −Z (Magnus)', () => {
    const flight = simulateFlight(kick(v3(25, 5, 0), v3(0, 60, 0)), ctx(), { maxTicks: 120 });
    expect(flight.samples.at(-1)!.pos.z).toBeLessThan(-1);
    const mirrored = simulateFlight(kick(v3(25, 5, 0), v3(0, -60, 0)), ctx(), { maxTicks: 120 });
    expect(mirrored.samples.at(-1)!.pos.z).toBeCloseTo(-flight.samples.at(-1)!.pos.z, 9);
  });

  it('backspin lifts, topspin dips', () => {
    const plain = apex(kick(v3(20, 8, 0)), ctx());
    expect(apex(kick(v3(20, 8, 0), v3(0, 0, 50)), ctx())).toBeGreaterThan(plain + 0.3);
    expect(apex(kick(v3(20, 8, 0), v3(0, 0, -50)), ctx())).toBeLessThan(plain - 0.3);
  });

  it('wind pushes the ball', () => {
    const flight = simulateFlight(
      kick(v3(20, 10, 0)),
      ctx(withWind(DEFAULT_PHYSICS, v3(0, 0, 8))),
      {
        maxTicks: 180,
      },
    );
    expect(flight.samples.at(-1)!.pos.z).toBeGreaterThan(0.5);
  });

  it('always stays finite and ends (random kicks)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -35, max: 35, noNaN: true }),
        fc.double({ min: 0, max: 25, noNaN: true }),
        fc.double({ min: -35, max: 35, noNaN: true }),
        fc.double({ min: -80, max: 80, noNaN: true }),
        fc.constantFrom(...PHYSICS_SURFACES),
        (vx, vy, vz, spin, surface) => {
          const flight = simulateFlight(
            kick(v3(vx, vy, vz), v3(spin, spin, -spin)),
            ctx(DEFAULT_PHYSICS, surface),
            {
              maxTicks: 3000,
            },
          );
          for (const s of flight.samples) {
            expect(Number.isFinite(s.pos.x + s.pos.y + s.pos.z + s.vel.x + s.vel.y + s.vel.z)).toBe(
              true,
            );
            expect(s.pos.y).toBeGreaterThanOrEqual(BALL.radius - 1e-9);
          }
          expect(flight.outcome).not.toBeNull();
        },
      ),
      { numRuns: 150 },
    );
  });
});

describe('surfaces', () => {
  const dropHeight = (surface: PhysicsSurface) => {
    const flight = simulateFlight(
      kick(v3(0, 0, 0), ZERO, v3(0, 2, 0)),
      ctx(DEFAULT_PHYSICS, surface),
      {
        maxTicks: 240,
      },
    );
    const bounceTick = flight.events.find((e) => e.type === 'bounce')!.tick;
    return Math.max(...flight.samples.slice(bounceTick).map((s) => s.pos.y));
  };

  const rollDistance = (surface: PhysicsSurface) => {
    const flight = simulateFlight(
      { ...restingBall(-40, 0), vel: v3(10, 0, 0) },
      ctx(DEFAULT_PHYSICS, surface),
      {
        maxTicks: 6000,
      },
    );
    expect(flight.outcome).toBe('stopped');
    return flight.samples.at(-1)!.pos.x;
  };

  it('bounces lowest on mud, highest on artificial turf', () => {
    expect(dropHeight('muddy')).toBeLessThan(dropHeight('grass'));
    expect(dropHeight('grass')).toBeLessThan(dropHeight('artificial'));
  });

  it('rolls shortest on mud, longest on artificial turf', () => {
    expect(rollDistance('muddy')).toBeLessThan(rollDistance('grass'));
    expect(rollDistance('grass')).toBeLessThan(rollDistance('artificial'));
  });

  it('a bounce never adds energy (without jitter)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.7, max: 30, noNaN: true }),
        fc.double({ min: -20, max: 20, noNaN: true }),
        fc.constantFrom(...PHYSICS_SURFACES),
        (impact, vx, surface) => {
          const ball = kick(v3(vx, -impact, 0), ZERO, v3(0, BALL.radius + 1e-4, 0));
          const next = stepBall(ball, VACUUM, surface, TICK_DT, null).state;
          const before = vx * vx + impact * impact;
          const after = next.vel.x * next.vel.x + next.vel.y * next.vel.y + next.vel.z * next.vel.z;
          expect(after).toBeLessThanOrEqual(before + 2 * 9.81 * TICK_DT * impact + 1e-9);
        },
      ),
    );
  });

  it('stabilisé bounces are random but reproducible from the seed', () => {
    const run = (seed: number) =>
      simulateFlight(
        kick(v3(15, 6, 0)),
        { params: DEFAULT_PHYSICS, surface: 'dirt', rng: Rng.create(seed) },
        {
          maxTicks: 600,
        },
      ).samples.at(-1)!.pos;
    expect(run(1)).toEqual(run(1));
    expect(run(1)).not.toEqual(run(2));
  });
});

describe('goal frame and outcomes', () => {
  const spot = v3(PITCH.goalLineX - 11, BALL.radius, 0);
  const aimAt = (target: Vec3, speed: number): Vec3 => {
    const dx = target.x - spot.x;
    const dy = target.y - spot.y;
    const dz = target.z - spot.z;
    const l = Math.hypot(dx, dy, dz);
    return v3((dx / l) * speed, (dy / l) * speed, (dz / l) * speed);
  };

  it('a shot into the goal is a goal and ends up in the net', () => {
    const flight = simulateFlight(
      kick(aimAt(v3(PITCH.goalLineX, 1, 2), 26), ZERO, spot),
      ctx(NO_GRAVITY),
      {
        ticksAfterOutcome: 180,
      },
    );
    expect(flight.outcome).toBe('goal');
    expect(flight.events.some((e) => e.type === 'net')).toBe(true);
    const end = flight.samples.at(-1)!.pos;
    expect(end.x).toBeGreaterThan(PITCH.goalLineX);
    expect(end.x).toBeLessThanOrEqual(PITCH.goalLineX + GOAL.netDepth);
  });

  it('wide and over', () => {
    expect(
      simulateFlight(kick(aimAt(v3(PITCH.goalLineX, 1, 6), 25), ZERO, spot), ctx(NO_GRAVITY))
        .outcome,
    ).toBe('wide');
    expect(
      simulateFlight(kick(aimAt(v3(PITCH.goalLineX, 4, 0), 25), ZERO, spot), ctx(NO_GRAVITY))
        .outcome,
    ).toBe('over');
  });

  it('hits the right post and the crossbar', () => {
    const postZ = GOAL.width / 2 + GOAL.postRadius;
    const post = simulateFlight(
      kick(aimAt(v3(PITCH.goalLineX, 1, postZ), 25), ZERO, spot),
      ctx(NO_GRAVITY),
      {
        maxTicks: 90,
      },
    );
    expect(post.events.find((e) => e.type === 'frame')).toMatchObject({ part: 'right-post' });
    expect(post.samples.at(-1)!.vel.x).toBeLessThan(0);

    const bar = simulateFlight(
      kick(aimAt(v3(PITCH.goalLineX, GOAL.height + GOAL.postRadius, 0), 25), ZERO, spot),
      ctx(NO_GRAVITY),
      { maxTicks: 90 },
    );
    expect(bar.events.find((e) => e.type === 'frame')).toMatchObject({ part: 'crossbar' });
  });

  it('a curled free kick from 22 m can go in with default physics', () => {
    const fk = v3(PITCH.goalLineX - 22, BALL.radius, -6);
    const flight = simulateFlight(kick(v3(24, 6.2, 2.2), v3(0, -45, 0), fk), ctx());
    expect(flight.outcome).toBe('goal');
  });
});
