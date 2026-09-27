// Dynamic resolution then quality downgrade when the frame rate cannot be held.
// Ported from Carte du Ciel (app.ts), extracted as a pure, testable state machine.

import { lowerQuality, type QualityLevel } from './quality.ts';

const round2 = (x: number): number => Math.round(x * 100) / 100;

export type AdaptiveDecision =
  | { readonly type: 'none' }
  | { readonly type: 'resolution'; readonly resolution: number }
  | { readonly type: 'quality'; readonly level: QualityLevel };

export interface AdaptiveOptions {
  /** Frames averaged per decision. */
  readonly window?: number;
  /** Frame time above which resolution goes down (default 1/40 s). */
  readonly slowFrame?: number;
  /** Frame time below which resolution goes back up (default 1/58 s). */
  readonly fastFrame?: number;
}

export class AdaptiveResolution {
  resolution = 1;
  private acc = 0;
  private n = 0;
  private cooldown = 1;
  private slowStreak = 0;
  private readonly window: number;
  private readonly slowFrame: number;
  private readonly fastFrame: number;

  constructor(options: AdaptiveOptions = {}) {
    this.window = options.window ?? 30;
    this.slowFrame = options.slowFrame ?? 1 / 40;
    this.fastFrame = options.fastFrame ?? 1 / 58;
  }

  /** Feeds one frame time; returns what the stage should change, if anything. */
  sample(dt: number, level: QualityLevel, minRes: number): AdaptiveDecision {
    this.cooldown -= dt;
    this.acc += dt;
    this.n++;
    if (this.n < this.window) return { type: 'none' };
    const avg = this.acc / this.n;
    this.acc = 0;
    this.n = 0;
    if (this.cooldown > 0) return { type: 'none' };

    if (avg > this.slowFrame && this.resolution > minRes) {
      this.resolution = Math.max(minRes, round2(this.resolution - 0.15));
      this.cooldown = 2;
      return { type: 'resolution', resolution: this.resolution };
    }
    if (avg < this.fastFrame && this.resolution < 1) {
      this.resolution = Math.min(1, round2(this.resolution + 0.1));
      this.cooldown = 4;
      return { type: 'resolution', resolution: this.resolution };
    }
    this.slowStreak = avg > 1 / 36 && this.resolution <= minRes ? this.slowStreak + 1 : 0;
    if (this.slowStreak >= 3 && level !== 'low') {
      this.slowStreak = 0;
      this.resolution = 1;
      this.cooldown = 3;
      return { type: 'quality', level: lowerQuality(level) };
    }
    return { type: 'none' };
  }
}
