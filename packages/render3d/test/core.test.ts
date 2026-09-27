import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { TICK_DT, TICK_RATE } from '@legendes/engine/time';
import { AdaptiveResolution } from '../src/core/adaptive.ts';
import { ease, Spring } from '../src/core/easing.ts';
import { FrameClock } from '../src/core/frame-clock.ts';
import {
  detectQuality,
  lowerQuality,
  qualityFromQuery,
  QUALITY_PROFILES,
} from '../src/core/quality.ts';
import { CameraShake } from '../src/core/shake.ts';

describe('FrameClock', () => {
  it('steps exactly one second of ticks per simulated second, whatever the frame rate', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0.001, max: 0.05, noNaN: true }), {
          minLength: 50,
          maxLength: 400,
        }),
        (dts) => {
          const clock = new FrameClock();
          let ticks = 0;
          let total = 0;
          for (const dt of dts) {
            total += dt;
            ticks += clock.advance(dt).ticks;
          }
          expect(Math.abs(ticks - total * TICK_RATE)).toBeLessThanOrEqual(1);
        },
      ),
    );
  });

  it('alpha stays in [0, 1)', () => {
    const clock = new FrameClock();
    for (let i = 0; i < 200; i++) {
      const { alpha } = clock.advance(0.0137);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('slow motion scales the simulated time', () => {
    const clock = new FrameClock();
    clock.setTimeScale(0.25);
    let ticks = 0;
    for (let i = 0; i < 60; i++) ticks += clock.advance(1 / 60).ticks;
    expect(ticks).toBeGreaterThanOrEqual(29);
    expect(ticks).toBeLessThanOrEqual(31);
  });

  it('ramps the time scale', () => {
    const clock = new FrameClock();
    clock.setTimeScale(0.2, 0.4);
    clock.advance(0.1);
    clock.advance(0.1);
    expect(clock.timeScale).toBeCloseTo(0.6, 9);
    for (let i = 0; i < 3; i++) clock.advance(0.1);
    expect(clock.timeScale).toBe(0.2);
  });

  it('hit-stop freezes the simulation, then resumes', () => {
    const clock = new FrameClock();
    clock.hitStop(0.05);
    const frozen = clock.advance(1 / 60);
    expect(frozen.frozen).toBe(true);
    expect(frozen.ticks).toBe(0);
    clock.advance(1 / 60);
    clock.advance(1 / 60);
    const after = clock.advance(1 / 60);
    expect(after.frozen).toBe(false);
    expect(after.ticks).toBeGreaterThan(0);
  });

  it('clamps huge frames (tab switch) instead of spiralling', () => {
    const clock = new FrameClock({ maxFrameDt: 0.1, maxTicksPerFrame: 24 });
    const frame = clock.advance(5);
    expect(frame.realDt).toBe(0.1);
    expect(frame.ticks).toBeLessThanOrEqual(24);
    expect(TICK_DT * frame.ticks).toBeLessThanOrEqual(0.1 + 1e-9);
  });
});

describe('quality', () => {
  it('detects levels from the device', () => {
    const base = { gpu: '', mobile: false, memory: 8, cores: 8, screenPx: 1440 };
    expect(detectQuality({ ...base, gpu: 'ANGLE (Google, SwiftShader)' })).toBe('low');
    expect(detectQuality({ ...base, gpu: 'Apple M2' })).toBe('high');
    expect(detectQuality({ ...base, mobile: true, gpu: 'Mali-T880' })).toBe('low');
    expect(detectQuality({ ...base, mobile: true, gpu: 'Adreno (TM) 618' })).toBe('medium');
    expect(detectQuality({ ...base, mobile: true, gpu: 'Apple GPU', memory: 0 })).toBe('high');
    expect(detectQuality({ ...base, cores: 2 })).toBe('low');
  });

  it('lowers one level at a time and reads the URL override', () => {
    expect(lowerQuality('high')).toBe('medium');
    expect(lowerQuality('low')).toBe('low');
    expect(qualityFromQuery('?q=low')).toBe('low');
    expect(qualityFromQuery('?q=ultra')).toBeNull();
  });

  it('profiles get cheaper as the level goes down', () => {
    expect(QUALITY_PROFILES.low.maxDpr).toBeLessThan(QUALITY_PROFILES.high.maxDpr);
    expect(QUALITY_PROFILES.low.shadowMapSize).toBe(0);
  });
});

describe('AdaptiveResolution', () => {
  it('lowers resolution when slow, restores it when fast, then downgrades quality', () => {
    const adaptive = new AdaptiveResolution({ window: 10 });
    const run = (dt: number, frames: number, level: 'high' | 'medium' | 'low' = 'high') => {
      const decisions = [];
      for (let i = 0; i < frames; i++) {
        const d = adaptive.sample(dt, level, 0.55);
        if (d.type !== 'none') decisions.push(d);
      }
      return decisions;
    };
    const slow = run(1 / 20, 200);
    expect(slow.some((d) => d.type === 'resolution')).toBe(true);
    expect(slow.some((d) => d.type === 'quality' && d.level === 'medium')).toBe(true);

    const fresh = new AdaptiveResolution({ window: 10 });
    fresh.resolution = 0.7;
    let restored = false;
    for (let i = 0; i < 2000; i++)
      if (fresh.sample(1 / 120, 'high', 0.55).type === 'resolution') restored = true;
    expect(restored).toBe(true);
    expect(fresh.resolution).toBe(1);
  });
});

describe('CameraShake', () => {
  it('decays to rest and respects reduced motion', () => {
    const shake = new CameraShake();
    shake.add(1);
    expect(Math.abs(shake.update(0.01).x) + Math.abs(shake.update(0.01).y)).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) shake.update(1 / 60);
    expect(shake.update(1 / 60)).toEqual({ x: 0, y: 0, roll: 0 });

    const reduced = new CameraShake({ reducedMotion: true });
    reduced.add(1);
    expect(reduced.update(0.016)).toEqual({ x: 0, y: 0, roll: 0 });
  });
});

describe('easing', () => {
  it('curves start at 0 and end at 1', () => {
    for (const f of [
      ease.linear,
      ease.sineInOut,
      ease.cubicOut,
      ease.expoOut,
      ease.quadInOut,
      ease.backOut(),
    ]) {
      expect(f(0)).toBeCloseTo(0, 9);
      expect(f(1)).toBeCloseTo(1, 9);
    }
  });

  it('a spring settles on its target', () => {
    const spring = new Spring(0);
    spring.target = 1;
    for (let i = 0; i < 120; i++) spring.step(1 / 60);
    expect(spring.value).toBeCloseTo(1, 3);
  });
});
