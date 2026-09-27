// Trauma-based camera shake (Squirrel Eiserloh, GDC 2016): impacts add trauma, shake grows with
// trauma², trauma decays over time. Ported from Carte du Ciel's camera rig.

export interface ShakeOffset {
  readonly x: number;
  readonly y: number;
  /** Roll, radians. */
  readonly roll: number;
}

export interface ShakeOptions {
  /** Trauma lost per second. */
  readonly decay?: number;
  /** Max translation at full trauma (world units). */
  readonly maxOffset?: number;
  /** Max roll at full trauma (radians). */
  readonly maxRoll?: number;
  /** prefers-reduced-motion: no shake at all. */
  readonly reducedMotion?: boolean;
}

export class CameraShake {
  trauma = 0;
  private t = 0;
  private readonly decay: number;
  private readonly maxOffset: number;
  private readonly maxRoll: number;
  private readonly reduced: boolean;

  constructor(options: ShakeOptions = {}) {
    this.decay = options.decay ?? 1.6;
    this.maxOffset = options.maxOffset ?? 0.16;
    this.maxRoll = options.maxRoll ?? 0.02;
    this.reduced = options.reducedMotion ?? false;
  }

  add(amount: number): void {
    if (this.reduced) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number): ShakeOffset {
    this.trauma = Math.max(0, this.trauma - dt * this.decay);
    this.t += dt;
    const s = this.trauma * this.trauma;
    if (s === 0) return { x: 0, y: 0, roll: 0 };
    const n = (f: number, o: number): number =>
      Math.sin(this.t * f + o) * 0.6 + Math.sin(this.t * f * 2.13 + o * 1.7) * 0.4;
    return {
      x: n(31, 1.3) * this.maxOffset * s,
      y: n(27, 4.1) * this.maxOffset * s,
      roll: n(23, 2.2) * this.maxRoll * s,
    };
  }
}
