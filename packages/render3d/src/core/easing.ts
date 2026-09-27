// Easing curves and damping helpers (render side: Math.* is fine here, nothing is validated).

export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  sineInOut: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  quadOut: (t: number) => 1 - (1 - t) * (1 - t),
  cubicOut: (t: number) => 1 - Math.pow(1 - t, 3),
  quartOut: (t: number) => 1 - Math.pow(1 - t, 4),
  expoOut: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  quadIn: (t: number) => t * t,
  cubicIn: (t: number) => t * t * t,
  expoIn: (t: number) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  quadInOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  cubicInOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  backOut:
    (s = 1.70158): Ease =>
    (t) =>
      1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
} as const;

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Frame-rate independent exponential approach of `a` towards `b`. */
export function damp(a: number, b: number, rate: number, dt: number): number {
  return a + (b - a) * (1 - Math.exp(-rate * dt));
}

/** Critically damped-ish spring, sub-stepped for stability at low frame rates. */
export class Spring {
  value: number;
  target: number;
  velocity = 0;

  constructor(
    value = 0,
    public stiffness = 120,
    public damping = 18,
  ) {
    this.value = value;
    this.target = value;
  }

  step(dt: number): number {
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = this.stiffness * (this.target - this.value) - this.damping * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
}
