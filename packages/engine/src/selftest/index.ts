// Determinism self-test: a canonical scenario exercising the PRNG, deterministic math and real
// ball flights at 120 Hz, reduced to a bit-exact fingerprint. The same digest must be
// produced by every JavaScript runtime (browsers, Node, Deno). Tested in CI; can also be run
// at server start-up before trusting the engine to validate matches.

import { Fingerprint } from '../hash/index.ts';
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

export function runDeterminismScenario(): DeterminismReport {
  const fp = new Fingerprint();
  rngSection(fp);
  mathSection(fp);
  physicsSection(fp);
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
