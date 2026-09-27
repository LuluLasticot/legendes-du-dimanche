import { physics } from '@legendes/engine';
import { describe, expect, it } from 'vitest';
import {
  defaultSandboxSettings,
  toPhysicsParams,
  toShotTuning,
} from '../src/scenes/sandbox-settings.ts';

describe('sandbox settings → engine', () => {
  it('maps the wind direction (0° = towards the goal, 90° = right)', () => {
    const s = defaultSandboxSettings();
    const towards = toPhysicsParams({ ...s, pitch: { ...s.pitch, windSpeed: 5, windDirection: 0 } })
      .air.wind;
    expect(towards.x).toBeCloseTo(5, 9);
    expect(towards.z).toBeCloseTo(0, 9);
    const right = toPhysicsParams({ ...s, pitch: { ...s.pitch, windSpeed: 5, windDirection: 90 } })
      .air.wind;
    expect(right.z).toBeCloseTo(5, 9);
  });

  it('overrides only the selected surface', () => {
    const s = defaultSandboxSettings('muddy');
    const params = toPhysicsParams({ ...s, surface: { ...s.surface, restitution: 0.1 } });
    expect(params.surfaces.muddy.restitution).toBe(0.1);
    expect(params.surfaces.grass).toEqual(physics.DEFAULT_PHYSICS.surfaces.grass);
  });

  it('round-trips the default shot tuning', () => {
    const tuning = toShotTuning(defaultSandboxSettings());
    expect(tuning.maxSpeedRange).toEqual([21, 34]);
    expect(tuning.errorDegRange).toEqual([4.5, 0.6]);
  });
});
