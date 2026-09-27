// Persistence of the sandbox settings (per-viewer convenience in localStorage), validated with Zod
// at the storage boundary: anything malformed or from an older version falls back to defaults.

import { physics } from '@legendes/engine';
import type { SandboxSettings } from '@legendes/render3d';
import { z } from 'zod';

const STORAGE_KEY = 'ldd.lab.ball.v2';

const n = (min: number, max: number) => z.number().min(min).max(max);

export const sandboxSettingsSchema = z.strictObject({
  shooter: z.strictObject({
    shotPower: n(1, 99),
    curve: n(1, 99),
    finishing: n(1, 99),
    composure: n(1, 99),
    weakFoot: z.boolean(),
    weakFootStars: n(1, 5),
    pressure: n(0, 1),
  }),
  spot: z.strictObject({ distance: n(6, 40), offset: n(-30, 30) }),
  pitch: z.strictObject({
    surface: z.enum(physics.PHYSICS_SURFACES),
    windSpeed: n(0, 25),
    windDirection: n(-180, 360),
  }),
  air: z.strictObject({
    gravity: n(0, 30),
    dragCoefficient: n(0, 1),
    magnusCoefficient: n(0, 5),
    spinDecayTime: n(0.1, 60),
  }),
  surface: z.strictObject({
    restitution: n(0, 1),
    bounceFriction: n(0, 1),
    rollingResistance: n(0, 1),
    bounceJitter: n(0, 1),
    rollThreshold: n(0, 5),
  }),
  gesture: z.strictObject({
    fullBulgeRatio: n(0.01, 1),
    fullPowerSpeed: n(0.1, 10),
    minLength: n(0, 0.5),
    stillThreshold: n(0, 0.05),
  }),
  shot: z.strictObject({
    minSpeed: n(0, 40),
    maxSpeedLow: n(1, 50),
    maxSpeedHigh: n(1, 50),
    maxSpinLow: n(0, 200),
    maxSpinHigh: n(0, 200),
    errorDegLow: n(0, 20),
    errorDegHigh: n(0, 20),
    weakFootPenaltyPerStar: n(0, 2),
    pressurePenalty: n(0, 5),
    lob: z.boolean(),
  }),
  debug: z.strictObject({
    prediction: z.boolean(),
    vectors: z.boolean(),
    trail: z.boolean(),
    timeScale: n(0.05, 2),
    replayScale: n(0.05, 1),
    seed: z.number().int().min(0).max(0xffffffff),
  }),
}) satisfies z.ZodType<SandboxSettings>;

export function loadSandboxSettings(fallback: SandboxSettings): SandboxSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = sandboxSettingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export function saveSandboxSettings(settings: SandboxSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or blocked storage: settings simply won't persist.
  }
}

export function clearSandboxSettings(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore: nothing to clear.
  }
}
