// Settings of the ball sandbox (/lab/ball): everything that shapes the feel, exposed to the
// tuning panel. Plain data (JSON-serialisable) mapped to engine parameters by `toEngine…`.

import { moments, physics } from '@legendes/engine';

export interface SandboxSettings {
  shooter: {
    shotPower: number;
    curve: number;
    finishing: number;
    composure: number;
    weakFoot: boolean;
    weakFootStars: number;
    pressure: number;
  };
  spot: {
    /** Distance to the goal line, metres. */
    distance: number;
    /** Lateral offset from the centre (+ = right of the attacker), metres. */
    offset: number;
  };
  pitch: {
    surface: physics.PhysicsSurface;
    /** Wind speed, m/s. */
    windSpeed: number;
    /** Wind direction, degrees (0 = towards the goal, 90 = to the right). */
    windDirection: number;
  };
  air: {
    gravity: number;
    dragCoefficient: number;
    magnusCoefficient: number;
    spinDecayTime: number;
  };
  surface: physics.SurfaceParams;
  gesture: moments.GestureTuning;
  shot: {
    minSpeed: number;
    maxSpeedLow: number;
    maxSpeedHigh: number;
    maxSpinLow: number;
    maxSpinHigh: number;
    errorDegLow: number;
    errorDegHigh: number;
    weakFootPenaltyPerStar: number;
    pressurePenalty: number;
    lob: boolean;
  };
  debug: {
    prediction: boolean;
    vectors: boolean;
    trail: boolean;
    /** Time scale of normal shots (1 = real time). */
    timeScale: number;
    /** Time scale of replays. */
    replayScale: number;
    /** Base seed of execution errors (change it to get other draws). */
    seed: number;
  };
}

export function defaultSandboxSettings(surface: physics.PhysicsSurface = 'grass'): SandboxSettings {
  const { air, surfaces } = physics.DEFAULT_PHYSICS;
  const shot = moments.DEFAULT_SHOT_TUNING;
  return {
    shooter: {
      shotPower: 80,
      curve: 75,
      finishing: 78,
      composure: 70,
      weakFoot: false,
      weakFootStars: 3,
      pressure: 0.2,
    },
    spot: { distance: 20, offset: -4 },
    pitch: { surface, windSpeed: 0, windDirection: 90 },
    air: {
      gravity: air.gravity,
      dragCoefficient: air.dragCoefficient,
      magnusCoefficient: air.magnusCoefficient,
      spinDecayTime: air.spinDecayTime,
    },
    surface: { ...surfaces[surface] },
    gesture: { ...moments.DEFAULT_GESTURE_TUNING },
    shot: {
      minSpeed: shot.minSpeed,
      maxSpeedLow: shot.maxSpeedRange[0],
      maxSpeedHigh: shot.maxSpeedRange[1],
      maxSpinLow: shot.maxSpinRange[0],
      maxSpinHigh: shot.maxSpinRange[1],
      errorDegLow: shot.errorDegRange[1],
      errorDegHigh: shot.errorDegRange[0],
      weakFootPenaltyPerStar: shot.weakFootPenaltyPerStar,
      pressurePenalty: shot.pressurePenalty,
      lob: false,
    },
    debug: {
      prediction: true,
      vectors: false,
      trail: true,
      timeScale: 1,
      replayScale: 0.35,
      seed: 1,
    },
  };
}

export function toPhysicsParams(s: SandboxSettings): physics.PhysicsParams {
  const d = physics.DEFAULT_PHYSICS;
  const rad = (s.pitch.windDirection * Math.PI) / 180;
  return {
    air: {
      ...d.air,
      ...s.air,
      wind: physics.v3(Math.cos(rad) * s.pitch.windSpeed, 0, Math.sin(rad) * s.pitch.windSpeed),
    },
    surfaces: { ...d.surfaces, [s.pitch.surface]: { ...s.surface } },
    frame: d.frame,
  };
}

export function toShotTuning(s: SandboxSettings): moments.ShotTuning {
  return {
    ...moments.DEFAULT_SHOT_TUNING,
    minSpeed: s.shot.minSpeed,
    maxSpeedRange: [s.shot.maxSpeedLow, s.shot.maxSpeedHigh],
    maxSpinRange: [s.shot.maxSpinLow, s.shot.maxSpinHigh],
    errorDegRange: [s.shot.errorDegHigh, s.shot.errorDegLow],
    weakFootPenaltyPerStar: s.shot.weakFootPenaltyPerStar,
    pressurePenalty: s.shot.pressurePenalty,
  };
}
