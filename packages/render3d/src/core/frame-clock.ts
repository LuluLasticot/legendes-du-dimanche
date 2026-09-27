// Couples the variable render rate to the fixed simulation rate (engine ticks), with time
// scaling (slow motion) and hit-stop (freeze frames). The simulation only ever advances by whole
// ticks, so what is rendered never changes what is simulated; `alpha` interpolates between the
// last two simulated states for smooth display.

import { TICK_DT } from '@legendes/engine/time';

export interface FrameAdvance {
  /** Real elapsed seconds (clamped). */
  readonly realDt: number;
  /** Simulated seconds consumed this frame (scaled, zero during hit-stop). */
  readonly simDt: number;
  /** Whole simulation ticks to step this frame. */
  readonly ticks: number;
  /** Interpolation factor in [0, 1) between the previous and current tick. */
  readonly alpha: number;
  /** Current time scale (1 = normal, < 1 = slow motion). */
  readonly timeScale: number;
  readonly frozen: boolean;
}

export interface FrameClockOptions {
  /** Longest real frame taken into account (avoids a spiral after a tab switch). */
  readonly maxFrameDt?: number;
  /** Most ticks stepped in one frame. */
  readonly maxTicksPerFrame?: number;
}

export class FrameClock {
  /** Time scale currently applied. */
  timeScale = 1;
  private targetScale = 1;
  private scaleRate = 0;
  private hitStopLeft = 0;
  private accumulator = 0;
  private readonly maxFrameDt: number;
  private readonly maxTicksPerFrame: number;

  constructor(options: FrameClockOptions = {}) {
    this.maxFrameDt = options.maxFrameDt ?? 0.1;
    this.maxTicksPerFrame = options.maxTicksPerFrame ?? 24;
  }

  /** Ramps the time scale to `scale` over `seconds` of real time (0 = immediately). */
  setTimeScale(scale: number, seconds = 0): void {
    this.targetScale = Math.max(0, scale);
    if (seconds <= 0) {
      this.timeScale = this.targetScale;
      this.scaleRate = 0;
    } else {
      this.scaleRate = Math.abs(this.targetScale - this.timeScale) / seconds;
    }
  }

  /** Freezes the simulation for `seconds` of real time (impact frames). Does not stack. */
  hitStop(seconds: number): void {
    this.hitStopLeft = Math.max(this.hitStopLeft, seconds);
  }

  /** Drops any accumulated time (after a reset or a replay jump). */
  reset(): void {
    this.accumulator = 0;
    this.hitStopLeft = 0;
  }

  advance(realDtInput: number): FrameAdvance {
    const realDt = Math.min(Math.max(0, realDtInput), this.maxFrameDt);

    if (this.scaleRate > 0) {
      const delta = this.targetScale - this.timeScale;
      const step = this.scaleRate * realDt;
      this.timeScale =
        Math.abs(delta) <= step ? this.targetScale : this.timeScale + Math.sign(delta) * step;
      if (this.timeScale === this.targetScale) this.scaleRate = 0;
    }

    let frozen = false;
    let simDt = realDt * this.timeScale;
    if (this.hitStopLeft > 1e-9) {
      frozen = true;
      const frozenPart = Math.min(realDt, this.hitStopLeft);
      this.hitStopLeft -= frozenPart;
      if (this.hitStopLeft < 1e-9) this.hitStopLeft = 0;
      simDt = (realDt - frozenPart) * this.timeScale;
    }

    this.accumulator += simDt;
    let ticks = Math.floor(this.accumulator / TICK_DT + 1e-9);
    if (ticks > this.maxTicksPerFrame) {
      ticks = this.maxTicksPerFrame;
      this.accumulator = 0;
    } else {
      this.accumulator -= ticks * TICK_DT;
    }
    const alpha = Math.min(0.999999, Math.max(0, this.accumulator / TICK_DT));
    return { realDt, simDt, ticks, alpha, timeScale: this.timeScale, frozen };
  }
}
