import { defaultSandboxSettings } from '@legendes/render3d';
import { describe, expect, it } from 'vitest';
import { sandboxSettingsSchema } from './sandbox-settings';

describe('sandboxSettingsSchema', () => {
  it('accepts the defaults of every surface', () => {
    for (const surface of ['grass', 'artificial', 'muddy', 'dirt'] as const) {
      expect(sandboxSettingsSchema.safeParse(defaultSandboxSettings(surface)).success).toBe(true);
    }
  });

  it('rejects out-of-range, missing and unknown fields', () => {
    const defaults = defaultSandboxSettings();
    expect(
      sandboxSettingsSchema.safeParse({
        ...defaults,
        shooter: { ...defaults.shooter, finishing: 140 },
      }).success,
    ).toBe(false);
    expect(sandboxSettingsSchema.safeParse({ ...defaults, debug: undefined }).success).toBe(false);
    expect(sandboxSettingsSchema.safeParse({ ...defaults, extra: true }).success).toBe(false);
  });
});
