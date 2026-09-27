// Tunable physics parameters. Everything that shapes the feel lives here (and is exposed in
// the /lab tuning page) rather than as constants in the integrator.

import { v3, type Vec3 } from './vec3.ts';

export const PHYSICS_SURFACES = ['grass', 'artificial', 'muddy', 'dirt'] as const;
export type PhysicsSurface = (typeof PHYSICS_SURFACES)[number];

export interface AirParams {
  /** m/s², positive (applied downwards). */
  readonly gravity: number;
  /** kg/m³. */
  readonly airDensity: number;
  /** Quadratic drag coefficient Cd (≈ 0.2–0.3 for a football above the drag crisis). */
  readonly dragCoefficient: number;
  /** Magnus lift factor: a = ½·ρ·A·r·Cm/m · (ω × v). Higher = more curl for the same spin. */
  readonly magnusCoefficient: number;
  /** Time constant of the exponential spin decay in flight, seconds. */
  readonly spinDecayTime: number;
  /** Wind velocity, m/s (world frame). */
  readonly wind: Vec3;
}

export interface SurfaceParams {
  /** Normal restitution of a bounce (0 = dead, 1 = perfectly elastic). */
  readonly restitution: number;
  /** Fraction of tangential velocity lost at each bounce. */
  readonly bounceFriction: number;
  /** Rolling resistance coefficient: deceleration = c · g. */
  readonly rollingResistance: number;
  /** Random spread of bounces (restitution and direction), 0 = perfectly predictable. */
  readonly bounceJitter: number;
  /** Below this vertical impact speed (m/s) the ball stops bouncing and rolls. */
  readonly rollThreshold: number;
}

export interface FrameParams {
  /** Restitution of posts and crossbar. */
  readonly postRestitution: number;
  /** Fraction of the ball speed kept per second once in the net. */
  readonly netSpeedRetention: number;
}

export interface PhysicsParams {
  readonly air: AirParams;
  readonly surfaces: Readonly<Record<PhysicsSurface, SurfaceParams>>;
  readonly frame: FrameParams;
}

export const DEFAULT_PHYSICS: PhysicsParams = {
  air: {
    gravity: 9.81,
    airDensity: 1.2,
    dragCoefficient: 0.25,
    magnusCoefficient: 1,
    spinDecayTime: 6,
    wind: v3(0, 0, 0),
  },
  surfaces: {
    // Pelouse : référence.
    grass: {
      restitution: 0.6,
      bounceFriction: 0.28,
      rollingResistance: 0.06,
      bounceJitter: 0,
      rollThreshold: 0.6,
    },
    // Synthétique : rebond plus haut, ballon plus rapide.
    artificial: {
      restitution: 0.68,
      bounceFriction: 0.2,
      rollingResistance: 0.035,
      bounceJitter: 0,
      rollThreshold: 0.6,
    },
    // Terrain gras : le ballon s'écrase et freine.
    muddy: {
      restitution: 0.32,
      bounceFriction: 0.5,
      rollingResistance: 0.18,
      bounceJitter: 0.04,
      rollThreshold: 0.9,
    },
    // Stabilisé : rebonds imprévisibles.
    dirt: {
      restitution: 0.62,
      bounceFriction: 0.3,
      rollingResistance: 0.07,
      bounceJitter: 0.25,
      rollThreshold: 0.6,
    },
  },
  frame: {
    postRestitution: 0.72,
    netSpeedRetention: 0.02,
  },
};

/** Returns a copy of `base` with the given wind. */
export function withWind(base: PhysicsParams, wind: Vec3): PhysicsParams {
  return { ...base, air: { ...base.air, wind } };
}
