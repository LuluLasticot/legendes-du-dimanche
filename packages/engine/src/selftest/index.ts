// Determinism self-test: a canonical scenario exercising the PRNG, deterministic math and real
// ball flights at 120 Hz, reduced to a bit-exact fingerprint. The same digest must be
// produced by every JavaScript runtime (browsers, Node, Deno). Tested in CI; can also be run
// at server start-up before trusting the engine to validate matches.

import { Fingerprint } from '../hash/index.ts';
import {
  applyExecutionError,
  applyPassError,
  firstTimeDifficulty,
  passBall,
  passerProfile,
  penaltyGauge,
  shooterProfile,
  simulatePassMoment,
  simulateShotMoment,
  solvePass,
  solveShot,
  type DefenderTuning,
  type KeeperTuning,
  type PassTuning,
  type ReceiverTuning,
  type ShotTuning,
} from '../moments/index.ts';
import * as m from '../math/index.ts';
import { deriveSeed, Rng, type Seed } from '../rng/index.ts';
import {
  BALL,
  kickedBall,
  PHYSICS_SURFACES,
  PITCH,
  simulateFlight,
  v3,
  type PhysicsParams,
} from '../physics/index.ts';
import { DETERMINISM_GOLDEN } from './golden.ts';

export { DETERMINISM_GOLDEN };

export interface DeterminismReport {
  digest: string;
  words: number;
}

const RNG_SEEDS: readonly (Seed | string)[] = [0, 1, 42, 0xdeadbeef, 'legendes-du-dimanche'];

function rngSection(fp: Fingerprint): void {
  for (const seed of RNG_SEEDS) {
    const rng = Rng.create(seed);
    fp.u32(rng.seed);
    for (let i = 0; i < 64; i++) fp.u32(rng.nextU32());
    for (let i = 0; i < 16; i++) fp.f64(rng.float());
    for (let i = 0; i < 16; i++) fp.f64(rng.int(-10, 10));
    for (let i = 0; i < 4; i++) fp.f64(rng.int(0, 4294967295));
    for (let i = 0; i < 8; i++) fp.f64(rng.normal(0, 1));
    for (let i = 0; i < 16; i++) fp.u32(rng.weightedIndex([1, 0, 3.5, 0.25, 7]));
    const deck = Array.from({ length: 52 }, (_, i) => i);
    for (const card of rng.shuffle(deck)) fp.u32(card);
    fp.u32(rng.sign() + 1);
    for (const word of rng.getState()) fp.u32(word);

    const child = rng.fork('moment', 3);
    for (let i = 0; i < 8; i++) fp.u32(child.nextU32());
    fp.u32(deriveSeed(rng.seed, 'match', 'phase', 17));
  }
}

const SPECIAL_VALUES = [0, -0, 1e-300, -1e-300, 5e-324, 1e300, Infinity, -Infinity, NaN];

function mathSection(fp: Fingerprint): void {
  for (let i = 0; i < 1000; i++) {
    const x = (i - 500) * 0.1237;
    const [s, c] = m.sinCos(x);
    fp.f64(m.sin(x))
      .f64(m.cos(x))
      .f64(s)
      .f64(c)
      .f64(m.tan(x * 0.25));
    fp.f64(m.atan(x)).f64(m.atan2(x, 1.3 - x * 0.5));
    fp.f64(m.exp(x * 0.1))
      .f64(m.log(Math.abs(x) + 1e-3))
      .f64(m.log2(Math.abs(x) + 1));
    fp.f64(m.pow(Math.abs(x) + 0.25, 1.7))
      .f64(m.pow(x, 3))
      .f64(m.pow(1.0001, x));
    fp.f64(m.asin(m.sin(x)))
      .f64(m.acos(m.cos(x)))
      .f64(m.hypot(x, 2.5));
    fp.f64(m.wrapAngle(x * 3));
  }
  for (const v of SPECIAL_VALUES) {
    fp.f64(m.sin(v)).f64(m.cos(v)).f64(m.atan(v)).f64(m.exp(v)).f64(m.log(v));
    fp.f64(m.pow(v, 0.5)).f64(m.pow(v, -2)).f64(m.atan2(v, -1)).f64(m.atan2(1, v));
  }
}

/**
 * Frozen physics parameters: the golden must change only when the integrator code changes,
 * never when the default tuning (DEFAULT_PHYSICS, /lab) is adjusted.
 */
const SELFTEST_PHYSICS: PhysicsParams = {
  air: {
    gravity: 9.81,
    airDensity: 1.2,
    dragCoefficient: 0.25,
    magnusCoefficient: 1,
    spinDecayTime: 6,
    wind: v3(0.8, 0, -1.3),
  },
  surfaces: {
    grass: {
      restitution: 0.6,
      bounceFriction: 0.28,
      rollingResistance: 0.06,
      bounceJitter: 0,
      rollThreshold: 0.6,
    },
    artificial: {
      restitution: 0.68,
      bounceFriction: 0.2,
      rollingResistance: 0.035,
      bounceJitter: 0,
      rollThreshold: 0.6,
    },
    muddy: {
      restitution: 0.32,
      bounceFriction: 0.5,
      rollingResistance: 0.18,
      bounceJitter: 0.04,
      rollThreshold: 0.9,
    },
    dirt: {
      restitution: 0.62,
      bounceFriction: 0.3,
      rollingResistance: 0.07,
      bounceJitter: 0.25,
      rollThreshold: 0.6,
    },
  },
  frame: { postRestitution: 0.72, netSpeedRetention: 0.02 },
};

/** Real ball flights (air, bounces on every surface, goal frame, net) at the fixed tick rate. */
function physicsSection(fp: Fingerprint): void {
  const rng = Rng.create('selftest:physics');
  for (let shot = 0; shot < 12; shot++) {
    const shotRng = rng.fork('shot', shot);
    const surface = PHYSICS_SURFACES[shot % PHYSICS_SURFACES.length] ?? 'grass';
    const from = v3(PITCH.goalLineX - shotRng.range(8, 30), BALL.radius, shotRng.range(-12, 12));
    const target = v3(PITCH.goalLineX, shotRng.range(0.2, 3), shotRng.range(-5, 5));
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    const horizontal = m.hypot(dx, dz);
    const speed = shotRng.range(15, 32);
    const [sp, cp] = m.sinCos(shotRng.range(0.02, 0.3));
    const ball = kickedBall(
      from,
      v3((dx / horizontal) * speed * cp, speed * sp, (dz / horizontal) * speed * cp),
      v3(shotRng.range(-10, 10), shotRng.range(-60, 60), shotRng.range(-30, 30)),
    );
    const flight = simulateFlight(
      ball,
      { params: SELFTEST_PHYSICS, surface, rng: shotRng.fork('bounces') },
      {
        maxTicks: 900,
        ticksAfterOutcome: 60,
      },
    );
    for (const s of flight.samples) {
      fp.f64(s.pos.x).f64(s.pos.y).f64(s.pos.z).f64(s.vel.x).f64(s.vel.y).f64(s.vel.z);
      fp.f64(s.spin.x)
        .f64(s.spin.y)
        .f64(s.spin.z)
        .u32(s.grounded ? 1 : 0);
    }
    for (const e of flight.events)
      fp.u32(e.tick).str(e.type).f64(e.pos.x).f64(e.pos.y).f64(e.pos.z);
    fp.str(flight.outcome ?? 'none').u32(flight.outcomeTick ?? 0);
  }
}

/** Frozen copy of the shot tuning, for the same reason as SELFTEST_PHYSICS. */
const SELFTEST_SHOT_TUNING: ShotTuning = {
  maxSpeedRange: [21, 34],
  minSpeed: 9,
  maxSpinRange: [18, 70],
  errorDegRange: [4.5, 0.6],
  weakFootPenaltyPerStar: 0.3,
  pressurePenalty: 1,
  lobBackspin: 25,
  paceErrorRatio: 0.6,
  difficultyPenalty: 1.5,
};

/** Shot solver + seeded execution error. */
function shotSection(fp: Fingerprint): void {
  const rng = Rng.create('selftest:shots');
  for (let i = 0; i < 8; i++) {
    const shotRng = rng.fork('shot', i);
    const profile = shooterProfile(
      {
        shotPower: shotRng.int(30, 95),
        curve: shotRng.int(30, 95),
        finishing: shotRng.int(30, 95),
        composure: shotRng.int(30, 95),
      },
      {
        weakFoot: shotRng.chance(0.3),
        weakFootStars: shotRng.int(1, 5),
        pressure: shotRng.float(),
      },
      SELFTEST_SHOT_TUNING,
    );
    const from = v3(PITCH.goalLineX - shotRng.range(11, 28), BALL.radius, shotRng.range(-10, 10));
    const solution = solveShot(
      from,
      {
        target: v3(PITCH.goalLineX, shotRng.range(0.3, 2.2), shotRng.range(-3.3, 3.3)),
        power: shotRng.range(0.5, 1),
        bulge: shotRng.range(-1, 1),
        lob: i === 7,
      },
      profile,
      SELFTEST_PHYSICS,
      'grass',
      { tuning: SELFTEST_SHOT_TUNING },
    );
    const struck = applyExecutionError(
      solution,
      profile,
      shotRng.fork('execution'),
      SELFTEST_SHOT_TUNING,
    );
    for (const v of [solution.velocity, solution.spin, struck.velocity, struck.spin])
      fp.f64(v.x).f64(v.y).f64(v.z);
    fp.f64(solution.miss)
      .u32(solution.iterations)
      .u32(solution.converged ? 1 : 0);
  }
}

/** Frozen copy of the keeper tuning, for the same reason as SELFTEST_PHYSICS. */
const SELFTEST_KEEPER_TUNING: KeeperTuning = {
  reactionRange: [0.32, 0.13],
  readErrorRange: [0.9, 0.18],
  curlReadPenalty: 0.006,
  diveReachRange: [1.2, 1.95],
  diveTimeRange: [0.62, 0.42],
  shuffleSpeedRange: [1.6, 3],
  jumpRange: [0.25, 0.6],
  lineDepthRange: [0.3, 1],
  catchRange: [0.45, 0.92],
  catchSpeedFree: 12,
  catchSpeedPenalty: 0.03,
  catchStretchPenalty: 0.3,
  parryRestitution: 0.38,
  lateAdjustRange: [0.05, 0.22],
  maxShuffle: 0.5,
  penaltyReaction: 0.06,
  penaltyReadRange: [0.28, 0.58],
};

/** Frozen copy of the defender tuning, for the same reason as SELFTEST_PHYSICS. */
const SELFTEST_DEFENDER_TUNING: DefenderTuning = {
  reactionRange: [0.3, 0.08],
  wallReactionRange: [0.26, 0.1],
  speedRange: [5.5, 8.2],
  accelerationTime: 0.45,
  jumpRange: [0.22, 0.55],
  lungeRange: [0.2, 0.55],
  lungeTime: 0.28,
  deflectRestitution: 0.4,
  deflectSpread: 0.25,
};

/** Whole shot moments against a keeper (reaction, read, dive, catch/parry draws). */
function momentSection(fp: Fingerprint): void {
  const rng = Rng.create('selftest:moments');
  for (let i = 0; i < 10; i++) {
    const r = rng.fork('moment', i);
    const from = v3(PITCH.goalLineX - r.range(11, 26), BALL.radius, r.range(-10, 10));
    const target = v3(PITCH.goalLineX, r.range(0.3, 2.3), r.range(-3.4, 3.4));
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    const h = m.hypot(dx, dz);
    const speed = r.range(16, 30);
    const velocity = v3((dx / h) * speed, r.range(1, 6), (dz / h) * speed);
    const result = simulateShotMoment(
      {
        ball: kickedBall(from, velocity, v3(0, r.range(-50, 50), 0)),
        physics: SELFTEST_PHYSICS,
        surface: PHYSICS_SURFACES[i % PHYSICS_SURFACES.length] ?? 'grass',
        keeper: {
          attributes: {
            diving: r.int(30, 95),
            handling: r.int(30, 95),
            reflexes: r.int(30, 95),
            speed: r.int(30, 95),
            positioning: r.int(30, 95),
            heightCm: r.int(175, 198),
          },
          tuning: SELFTEST_KEEPER_TUNING,
        },
        defenders: [
          ...Array.from({ length: i % 4 }, () => ({
            role: 'wall' as const,
            attributes: {
              pace: 60,
              defending: r.int(30, 95),
              physical: r.int(30, 95),
              heightCm: r.int(172, 195),
            },
          })),
          {
            role: 'marker' as const,
            feet: v3(from.x + r.range(4, 9), 0, from.z + r.range(-2, 2)),
            attributes: {
              pace: r.int(30, 95),
              defending: r.int(30, 95),
              physical: r.int(30, 95),
              heightCm: 182,
            },
          },
        ],
        defenderTuning: SELFTEST_DEFENDER_TUNING,
        seed: r.nextU32(),
      },
      720,
      30,
    );
    for (const state of result.states) {
      const b = state.flight.ball.pos;
      fp.f64(b.x).f64(b.y).f64(b.z);
      const k = state.keeper;
      if (k)
        fp.str(k.phase).f64(k.hands.x).f64(k.hands.y).f64(k.hands.z).f64(k.feet.z).f64(k.head.y);
      for (const d of state.defenders) fp.f64(d.feet.x).f64(d.feet.z).f64(d.head.y);
    }
    for (const e of result.events) fp.u32(e.tick).str(e.type);
    fp.str(result.outcome ?? 'none');
  }
}

/** Frozen copies of the pass and receiver tunings, for the same reason as SELFTEST_PHYSICS. */
const SELFTEST_PASS_TUNING: PassTuning = {
  maxSpeedRange: [17, 26],
  minSpeed: 5,
  minArrivalSpeed: 5,
  errorDegRange: [7, 1],
  pressurePenalty: 0.8,
  paceErrorRatio: 0.8,
};
const SELFTEST_RECEIVER_TUNING: ReceiverTuning = {
  speedRange: [6, 8.8],
  accelerationTime: 0.5,
  controlRadius: 0.55,
  maxHeight: 1.1,
  planMargin: 0.15,
};

/** Situations: pass moments (receiver, markers, keeper shifting), penalties, player dives. */
function situationSection(fp: Fingerprint): void {
  const rng = Rng.create('selftest:situations');
  const keeper = (r: Rng) => ({
    diving: r.int(30, 95),
    handling: r.int(30, 95),
    reflexes: r.int(30, 95),
    speed: r.int(30, 95),
    positioning: r.int(30, 95),
    heightCm: r.int(175, 198),
  });
  for (let i = 0; i < 6; i++) {
    const r = rng.fork('pass', i);
    const from = v3(PITCH.goalLineX - r.range(6, 30), 0, r.range(-20, 20));
    const receiver = v3(PITCH.goalLineX - r.range(16, 24), 0, r.range(-8, 8));
    const target = v3(PITCH.goalLineX - r.range(8, 16), 0, r.range(-6, 6));
    const profile = passerProfile(
      { passing: r.int(30, 95), composure: r.int(30, 95) },
      r.float(),
      SELFTEST_PASS_TUNING,
    );
    const solution = solvePass(from, target, r.int(60, 200), profile, SELFTEST_PHYSICS, 'grass');
    const velocity = applyPassError(solution.velocity, profile, r.fork('error'));
    fp.f64(velocity.x)
      .f64(velocity.z)
      .u32(solution.arrivalTicks ?? 0);
    const result = simulatePassMoment({
      ball: passBall(from, velocity),
      physics: SELFTEST_PHYSICS,
      surface: PHYSICS_SURFACES[i % PHYSICS_SURFACES.length] ?? 'grass',
      receiver: {
        from: receiver,
        pace: r.int(30, 95),
        speed: r.range(0, 6),
        tuning: SELFTEST_RECEIVER_TUNING,
      },
      keeper: { attributes: keeper(r), tuning: SELFTEST_KEEPER_TUNING },
      defenders: [
        {
          role: 'marker',
          feet: v3(target.x + r.range(-5, 5), 0, target.z + r.range(-5, 5)),
          attributes: {
            pace: r.int(30, 95),
            defending: r.int(30, 95),
            physical: 70,
            heightCm: 182,
          },
        },
      ],
      defenderTuning: SELFTEST_DEFENDER_TUNING,
      seed: r.nextU32(),
    });
    for (const state of result.states) {
      const b = state.flight.ball.pos;
      fp.f64(b.x).f64(b.z).f64(state.receiver.feet.x).f64(state.receiver.feet.z);
      if (state.keeper) fp.f64(state.keeper.feet.z);
      for (const d of state.defenders) fp.f64(d.feet.x).f64(d.feet.z);
    }
    for (const e of result.events) fp.u32(e.tick).str(e.type);
    fp.str(result.outcome ?? 'none');
    const last = result.states[result.states.length - 1];
    if (last) fp.f64(firstTimeDifficulty(last.flight.ball, v3(1, 0, 0)));
  }

  for (let i = 0; i < 12; i++) {
    const r = rng.fork('keeper-mode', i);
    const penalty = i % 2 === 0;
    const from = penalty
      ? v3(PITCH.goalLineX - 11, BALL.radius, 0)
      : v3(PITCH.goalLineX - r.range(12, 22), BALL.radius, r.range(-6, 6));
    const gauge = penaltyGauge(r.float());
    fp.f64(gauge.power).f64(gauge.difficulty);
    const profile = shooterProfile(
      { shotPower: r.int(30, 95), curve: 60, finishing: r.int(30, 95), composure: 60 },
      { weakFoot: false, weakFootStars: 3, pressure: r.float(), difficulty: gauge.difficulty },
      SELFTEST_SHOT_TUNING,
    );
    const target = v3(PITCH.goalLineX, r.range(0.2, 2.2), r.range(-3.3, 3.3));
    const solution = solveShot(
      from,
      { target, power: gauge.power, bulge: r.range(-0.5, 0.5), lob: false },
      profile,
      SELFTEST_PHYSICS,
      'grass',
      { tuning: SELFTEST_SHOT_TUNING },
    );
    const struck = applyExecutionError(
      solution,
      profile,
      r.fork('execution'),
      SELFTEST_SHOT_TUNING,
    );
    const result = simulateShotMoment({
      ball: kickedBall(from, struck.velocity, struck.spin),
      physics: SELFTEST_PHYSICS,
      surface: 'grass',
      keeper: penalty
        ? {
            attributes: keeper(r),
            tuning: SELFTEST_KEEPER_TUNING,
            feet: v3(PITCH.goalLineX - 0.1, 0, 0),
            mode: 'penalty',
          }
        : {
            attributes: keeper(r),
            tuning: SELFTEST_KEEPER_TUNING,
            mode: 'player',
            commands: [
              { tick: r.int(1, 90), target: v3(PITCH.goalLineX, r.range(0.2, 2), r.range(-3, 3)) },
            ],
          },
      seed: r.nextU32(),
    });
    for (const state of result.states) {
      const b = state.flight.ball.pos;
      fp.f64(b.x).f64(b.y).f64(b.z);
      const k = state.keeper;
      if (k) fp.str(k.phase).f64(k.hands.x).f64(k.hands.y).f64(k.hands.z);
    }
    for (const e of result.events) fp.u32(e.tick).str(e.type);
    fp.str(result.outcome ?? 'none');
  }
}

export function runDeterminismScenario(): DeterminismReport {
  const fp = new Fingerprint();
  rngSection(fp);
  mathSection(fp);
  physicsSection(fp);
  shotSection(fp);
  momentSection(fp);
  situationSection(fp);
  return { digest: fp.digest(), words: fp.size };
}

/** Runs the scenario and compares it with the committed reference. */
export function verifyDeterminism(): {
  ok: boolean;
  expected: DeterminismReport;
  actual: DeterminismReport;
} {
  const actual = runDeterminismScenario();
  const expected = { digest: DETERMINISM_GOLDEN.digest, words: DETERMINISM_GOLDEN.words };
  return {
    ok: actual.digest === expected.digest && actual.words === expected.words,
    expected,
    actual,
  };
}
