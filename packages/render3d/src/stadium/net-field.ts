// Net deformation: each ball impact adds a damped, spreading bulge along the panel's outward
// normal. Pure function of the impacts and time, so replays deform the net identically.

export interface NetImpact {
  /** Impact point in world coordinates. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Peak bulge in metres. */
  readonly amplitude: number;
  /** Time of the impact (seconds, same clock as `now`). */
  readonly time: number;
}

export interface NetFieldOptions {
  /** Radius of the bulge, metres. */
  readonly radius: number;
  /** Oscillation frequency, Hz. */
  readonly frequency: number;
  /** Exponential damping rate, 1/s. */
  readonly damping: number;
}

export const DEFAULT_NET_FIELD: NetFieldOptions = { radius: 0.55, frequency: 3.2, damping: 4.5 };

/** Seconds after which an impact no longer moves the net visibly. */
export function impactLifetime(options: NetFieldOptions = DEFAULT_NET_FIELD): number {
  return Math.log(1000) / options.damping;
}

/** Signed outward offset (metres) of a net point at time `now`. */
export function netOffset(
  x: number,
  y: number,
  z: number,
  impacts: readonly NetImpact[],
  now: number,
  options: NetFieldOptions = DEFAULT_NET_FIELD,
): number {
  let offset = 0;
  const r2 = options.radius * options.radius;
  for (const impact of impacts) {
    const t = now - impact.time;
    if (t < 0) continue;
    const dx = x - impact.x;
    const dy = y - impact.y;
    const dz = z - impact.z;
    // The bulge widens a little as it rings out.
    const spread = r2 * (1 + t * 1.5);
    const falloff = Math.exp(-(dx * dx + dy * dy + dz * dz) / spread);
    const envelope = Math.exp(-options.damping * t) * Math.cos(2 * Math.PI * options.frequency * t);
    offset += impact.amplitude * falloff * envelope;
  }
  return offset;
}

/** Bulge amplitude for an impact speed (m/s), capped. */
export function impactAmplitude(speed: number): number {
  return Math.min(0.6, speed * 0.028);
}
