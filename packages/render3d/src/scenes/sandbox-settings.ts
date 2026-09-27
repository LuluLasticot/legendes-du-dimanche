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
  keeper: {
    enabled: boolean;
    diving: number;
    handling: number;
    reflexes: number;
    speed: number;
    positioning: number;
    heightCm: number;
    /** Reaction delay (s) at reflexes 1 / 99. */
    reactionSlow: number;
    reactionFast: number;
    /** Read error (m) at positioning 1 / 99. */
    readErrorHigh: number;
    readErrorLow: number;
    /** Dive reach (m) at diving 1 / 99. */
    diveReachLow: number;
    diveReachHigh: number;
    /** Dive duration (s) at diving 1 / 99. */
    diveTimeSlow: number;
    diveTimeFast: number;
    /** Catch probability at handling 1 / 99. */
    catchLow: number;
    catchHigh: number;
    parryRestitution: number;
    /** Late hand correction during a dive (m) at reflexes 1 / 99. */
    lateAdjustLow: number;
    lateAdjustHigh: number;
    /** Furthest shuffle before diving (m). */
    maxShuffle: number;
  };
  defenders: {
    /** Players in the free-kick wall (0 = none). */
    wall: number;
    /** Markers between the ball and the goal (0–2). */
    markers: number;
    /** Distance of the markers from the ball (m) and lateral spread (m). */
    markerDistance: number;
    markerSpread: number;
    pace: number;
    defending: number;
    physical: number;
    heightCm: number;
    reactionSlow: number;
    reactionFast: number;
    wallReactionSlow: number;
    wallReactionFast: number;
    speedLow: number;
    speedHigh: number;
    jumpLow: number;
    jumpHigh: number;
    lungeLow: number;
    lungeHigh: number;
    deflectRestitution: number;
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
  const keeper = moments.DEFAULT_KEEPER_TUNING;
  const defender = moments.DEFAULT_DEFENDER_TUNING;
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
    keeper: {
      enabled: true,
      diving: 70,
      handling: 68,
      reflexes: 72,
      speed: 60,
      positioning: 68,
      heightCm: 186,
      reactionSlow: keeper.reactionRange[0],
      reactionFast: keeper.reactionRange[1],
      readErrorHigh: keeper.readErrorRange[0],
      readErrorLow: keeper.readErrorRange[1],
      diveReachLow: keeper.diveReachRange[0],
      diveReachHigh: keeper.diveReachRange[1],
      diveTimeSlow: keeper.diveTimeRange[0],
      diveTimeFast: keeper.diveTimeRange[1],
      catchLow: keeper.catchRange[0],
      catchHigh: keeper.catchRange[1],
      parryRestitution: keeper.parryRestitution,
      lateAdjustLow: keeper.lateAdjustRange[0],
      lateAdjustHigh: keeper.lateAdjustRange[1],
      maxShuffle: keeper.maxShuffle,
    },
    defenders: {
      wall: 0,
      markers: 0,
      markerDistance: 7,
      markerSpread: 1.2,
      pace: 65,
      defending: 65,
      physical: 65,
      heightCm: 182,
      reactionSlow: defender.reactionRange[0],
      reactionFast: defender.reactionRange[1],
      wallReactionSlow: defender.wallReactionRange[0],
      wallReactionFast: defender.wallReactionRange[1],
      speedLow: defender.speedRange[0],
      speedHigh: defender.speedRange[1],
      jumpLow: defender.jumpRange[0],
      jumpHigh: defender.jumpRange[1],
      lungeLow: defender.lungeRange[0],
      lungeHigh: defender.lungeRange[1],
      deflectRestitution: defender.deflectRestitution,
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

export function toKeeperAttributes(s: SandboxSettings): moments.KeeperAttributes {
  const k = s.keeper;
  return {
    diving: k.diving,
    handling: k.handling,
    reflexes: k.reflexes,
    speed: k.speed,
    positioning: k.positioning,
    heightCm: k.heightCm,
  };
}

export function toKeeperTuning(s: SandboxSettings): moments.KeeperTuning {
  const k = s.keeper;
  return {
    ...moments.DEFAULT_KEEPER_TUNING,
    reactionRange: [k.reactionSlow, k.reactionFast],
    readErrorRange: [k.readErrorHigh, k.readErrorLow],
    diveReachRange: [k.diveReachLow, k.diveReachHigh],
    diveTimeRange: [k.diveTimeSlow, k.diveTimeFast],
    catchRange: [k.catchLow, k.catchHigh],
    parryRestitution: k.parryRestitution,
    lateAdjustRange: [k.lateAdjustLow, k.lateAdjustHigh],
    maxShuffle: k.maxShuffle,
  };
}

export function toDefenderTuning(s: SandboxSettings): moments.DefenderTuning {
  const d = s.defenders;
  return {
    ...moments.DEFAULT_DEFENDER_TUNING,
    reactionRange: [d.reactionSlow, d.reactionFast],
    wallReactionRange: [d.wallReactionSlow, d.wallReactionFast],
    speedRange: [d.speedLow, d.speedHigh],
    jumpRange: [d.jumpLow, d.jumpHigh],
    lungeRange: [d.lungeLow, d.lungeHigh],
    deflectRestitution: d.deflectRestitution,
  };
}

/**
 * Defenders of the sandbox for a ball at `spot`: the wall (placed by the engine, only when there
 * is room for 9.15 m) then the markers, between the ball and the goal, alternating sides.
 */
export function toDefenderSetups(s: SandboxSettings, spot: physics.Vec3): moments.DefenderSetup[] {
  const d = s.defenders;
  const attributes: moments.DefenderAttributes = {
    pace: d.pace,
    defending: d.defending,
    physical: d.physical,
    heightCm: d.heightCm,
  };
  const out: moments.DefenderSetup[] = [];
  if (physics.PITCH.goalLineX - spot.x > 11) {
    for (let i = 0; i < d.wall; i++) out.push({ role: 'wall', attributes });
  }
  const toGoal = physics.v3(physics.PITCH.goalLineX - spot.x, 0, -spot.z);
  const len = Math.hypot(toGoal.x, toGoal.z);
  const dir = physics.v3(toGoal.x / len, 0, toGoal.z / len);
  const perp = physics.v3(-dir.z, 0, dir.x);
  for (let i = 0; i < d.markers; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const along = Math.min(d.markerDistance, len - 2);
    out.push({
      role: 'marker',
      feet: physics.v3(
        spot.x + dir.x * along + perp.x * side * d.markerSpread,
        0,
        spot.z + dir.z * along + perp.z * side * d.markerSpread,
      ),
      attributes,
    });
  }
  return out;
}
