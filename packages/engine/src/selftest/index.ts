// Determinism self-test: a canonical scenario exercising the PRNG, deterministic math and a
// small 120 Hz ball integration, reduced to a bit-exact fingerprint. The same digest must be
// produced by every JavaScript runtime (browsers, Node, Deno). Tested in CI; can also be run
// at server start-up before trusting the engine to validate matches.

import { Fingerprint } from '../hash/index.ts';
import * as m from '../math/index.ts';
import { deriveSeed, Rng, type Seed } from '../rng/index.ts';
import { TICK_DT } from '../time/index.ts';
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
 * Toy ball flight: gravity, quadratic drag, Magnus lift, decaying spin, wind and ground
 * bounces, stepped at the fixed tick rate. Stands in for the Phase 1 physics until it exists.
 */
function ballSection(fp: Fingerprint): void {
  const rng = Rng.create('selftest:ball');
  const g = -9.81;
  const radius = 0.11;
  const drag = 0.0125; // ½·ρ·Cd·A / m
  const magnus = 0.0048;
  const spinDecay = m.exp(-TICK_DT / 4);

  for (let shot = 0; shot < 6; shot++) {
    const shotRng = rng.fork('shot', shot);
    const speed = shotRng.range(14, 32);
    const [sy, cy] = m.sinCos(shotRng.range(-0.5, 0.5)); // heading
    const [sp, cp] = m.sinCos(shotRng.range(0.05, 0.6)); // pitch
    let px = 0;
    let py = radius;
    let pz = 0;
    let vx = speed * cp * cy;
    let vy = speed * sp;
    let vz = speed * cp * sy;
    let wx = 0;
    let wy = shotRng.range(-40, 40);
    let wz = shotRng.range(-10, 10);
    const windX = shotRng.normal(0, 1.5);
    const windZ = shotRng.normal(0, 1.5);

    for (let tick = 0; tick < 360; tick++) {
      const rx = vx - windX;
      const ry = vy;
      const rz = vz - windZ;
      const rel = m.hypot3(rx, ry, rz);
      const ax = -drag * rel * rx + magnus * (wy * rz - wz * ry);
      const ay = g - drag * rel * ry + magnus * (wz * rx - wx * rz);
      const az = -drag * rel * rz + magnus * (wx * ry - wy * rx);
      vx += ax * TICK_DT;
      vy += ay * TICK_DT;
      vz += az * TICK_DT;
      px += vx * TICK_DT;
      py += vy * TICK_DT;
      pz += vz * TICK_DT;
      wx *= spinDecay;
      wy *= spinDecay;
      wz *= spinDecay;
      if (py < radius) {
        py = radius;
        vy = -vy * 0.6;
        vx *= 0.82;
        vz *= 0.82;
      }
      fp.f64(px).f64(py).f64(pz).f64(vx).f64(vy).f64(vz);
    }
    fp.f64(m.atan2(vz, vx)).f64(m.hypot(px, pz));
  }
}

export function runDeterminismScenario(): DeterminismReport {
  const fp = new Fingerprint();
  rngSection(fp);
  mathSection(fp);
  ballSection(fp);
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
