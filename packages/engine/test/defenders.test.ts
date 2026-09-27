import { describe, expect, it } from 'vitest';
import {
  applyExecutionError,
  createDefender,
  DEFAULT_DEFENDER_TUNING,
  shooterProfile,
  simulateShotMoment,
  solveShot,
  stepDefender,
  wallPositions,
  type DefenderAttributes,
  type DefenderSetup,
  type ShotMomentSetup,
} from '../src/moments/index.ts';
import {
  BALL,
  DEFAULT_PHYSICS,
  GOAL,
  kickedBall,
  PITCH,
  v3,
  type Vec3,
} from '../src/physics/index.ts';
import { Rng } from '../src/rng/index.ts';

const AVERAGE: DefenderAttributes = { pace: 65, defending: 65, physical: 65, heightCm: 182 };
const QUICK: DefenderAttributes = { pace: 90, defending: 88, physical: 80, heightCm: 186 };
const SLOW: DefenderAttributes = { pace: 35, defending: 35, physical: 40, heightCm: 176 };

const spot = (distance: number, z = 0): Vec3 => v3(PITCH.goalLineX - distance, BALL.radius, z);
const profile = shooterProfile(
  { shotPower: 85, curve: 85, finishing: 85, composure: 80 },
  { weakFoot: false, weakFootStars: 3, pressure: 0 },
);

function setup(
  from: Vec3,
  target: Vec3,
  defenders: DefenderSetup[],
  opts: { power?: number; bulge?: number; seed?: number; lob?: boolean } = {},
): ShotMomentSetup {
  const solution = solveShot(
    from,
    { target, power: opts.power ?? 0.9, bulge: opts.bulge ?? 0, lob: opts.lob ?? false },
    profile,
    DEFAULT_PHYSICS,
    'grass',
  );
  const s = applyExecutionError(solution, profile, Rng.create(opts.seed ?? 1));
  return {
    ball: kickedBall(from, s.velocity, s.spin),
    physics: DEFAULT_PHYSICS,
    surface: 'grass',
    keeper: null,
    defenders,
    seed: opts.seed ?? 1,
  };
}

const wall = (n: number, attributes = AVERAGE): DefenderSetup[] =>
  Array.from({ length: n }, () => ({ role: 'wall' as const, attributes }));

describe('wall', () => {
  it('stands 9.15 m from the ball, from the near post line inwards', () => {
    const ball = spot(22, -6);
    const positions = wallPositions(ball, 4);
    for (const p of positions) {
      const d = Math.hypot(p.x - ball.x, p.z - ball.z);
      expect(d).toBeGreaterThan(9.1);
      expect(d).toBeLessThan(9.4);
    }
    // Near post is on the ball's side (−Z): the others step towards the centre (+Z).
    expect(positions[3]!.z).toBeGreaterThan(positions[0]!.z);
  });

  it('jumps after its reaction delay and lands', () => {
    const rng = Rng.create(1);
    let d = createDefender('wall', v3(40, 0, 0), AVERAGE, DEFAULT_DEFENDER_TUNING, rng);
    const standing = d.head.y;
    let peak = 0;
    const ctx = { params: DEFAULT_PHYSICS, surface: 'grass' as const, rng: null };
    const ball = kickedBall(spot(22), v3(20, 5, 0), v3(0, 0, 0));
    for (let t = 1; t < 120; t++) {
      d = stepDefender(d, t, ball, AVERAGE, DEFAULT_DEFENDER_TUNING, ctx);
      peak = Math.max(peak, d.head.y - standing);
    }
    expect(peak).toBeGreaterThan(0.3);
    expect(d.head.y).toBeCloseTo(standing, 6);
  });

  it('blocks a driven shot through it, not a curler over it', () => {
    const from = spot(22, -5);
    const nearPost = v3(PITCH.goalLineX, 0.6, -GOAL.width / 2 + 0.5);
    const driven = simulateShotMoment(setup(from, nearPost, wall(4), { power: 1 }));
    expect(driven.outcome).toBe('blocked');
    expect(driven.events.some((e) => e.type === 'block')).toBe(true);

    const topCorner = v3(PITCH.goalLineX, 2.1, -GOAL.width / 2 + 0.45);
    // Over the middle of the wall, bowing right into the near top corner.
    const curler = simulateShotMoment(setup(from, topCorner, wall(4), { power: 0.55, bulge: 0.7 }));
    expect(curler.events.some((e) => e.type === 'block')).toBe(false);
  });
});

describe('markers', () => {
  it('a marker next to the shot line closes it down; one far away does not', () => {
    const from = spot(18);
    const target = v3(PITCH.goalLineX, 0.4, 0.5);
    const close = simulateShotMoment(
      setup(from, target, [{ role: 'marker', feet: v3(from.x + 7, 0, 0.9), attributes: AVERAGE }]),
    );
    expect(close.outcome).toBe('blocked');
    const far = simulateShotMoment(
      setup(from, target, [{ role: 'marker', feet: v3(from.x + 7, 0, 6), attributes: AVERAGE }]),
    );
    expect(far.outcome).toBe('goal');
  });

  it('quick, sharp defenders block more than slow ones', () => {
    const rng = Rng.create('marker-stats');
    const shots = Array.from({ length: 120 }, (_, i) => ({
      from: spot(rng.range(14, 24), rng.range(-6, 6)),
      target: v3(PITCH.goalLineX, rng.range(0.2, 1.6), rng.range(-3, 3)),
      marker: rng.range(5, 9),
      side: rng.range(-1.8, 1.8),
      seed: i + 1,
    }));
    const blocked = (attributes: DefenderAttributes): number =>
      shots.filter((s) => {
        const feet = v3(s.from.x + s.marker, 0, s.from.z + s.side);
        return (
          simulateShotMoment(
            setup(s.from, s.target, [{ role: 'marker', feet, attributes }], { seed: s.seed }),
          ).outcome === 'blocked'
        );
      }).length;
    const quick = blocked(QUICK);
    const slow = blocked(SLOW);
    // Most blocks come from standing on the shooting line; quickness adds the marginal ones.
    expect(quick).toBeGreaterThan(slow * 1.3);
    expect(slow).toBeGreaterThan(0);
  });

  it('is deterministic with defenders and deflections', () => {
    const s = setup(
      spot(20, -4),
      v3(PITCH.goalLineX, 0.5, -2),
      [...wall(3), { role: 'marker', feet: v3(35, 0, -1), attributes: AVERAGE }],
      { seed: 5 },
    );
    const a = simulateShotMoment(s, 720, 60);
    const b = simulateShotMoment(s, 720, 60);
    expect(a.outcome).toBe(b.outcome);
    expect(a.states.map((st) => st.flight.ball.pos)).toEqual(
      b.states.map((st) => st.flight.ball.pos),
    );
    expect(a.states.map((st) => st.defenders.map((d) => d.head))).toEqual(
      b.states.map((st) => st.defenders.map((d) => d.head)),
    );
  });
});
