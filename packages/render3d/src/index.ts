// @legendes/render3d — imperative Three.js rendering. Scenes expose mount / play / dispose;
// React components only hand over a canvas.

export {
  Stage,
  type FrameCallback,
  type StageFrame,
  type StageOptions,
  type StageStats,
} from './core/stage.ts';
export { PostPipeline, defaultPostSettings, type PostSettings } from './core/post.ts';
export { FrameClock, type FrameAdvance, type FrameClockOptions } from './core/frame-clock.ts';
export { CameraShake, type ShakeOffset, type ShakeOptions } from './core/shake.ts';
export { AdaptiveResolution, type AdaptiveDecision } from './core/adaptive.ts';
export { ease, damp, clamp01, Spring, type Ease } from './core/easing.ts';
export {
  detectQuality,
  lowerQuality,
  qualityFromQuery,
  QUALITY_LEVELS,
  QUALITY_PROFILES,
  type DeviceInfo,
  type QualityChoice,
  type QualityLevel,
  type QualityProfile,
} from './core/quality.ts';
export { mountPreviewScene, type PreviewHandle } from './scenes/preview.ts';
export { mountBallSandbox, type SandboxHandle, type ShotReport } from './scenes/sandbox.ts';
export {
  defaultSandboxSettings,
  toPhysicsParams,
  toShotTuning,
  type SandboxSettings,
} from './scenes/sandbox-settings.ts';
export { PlayerFigure, KEEPER_KIT, OPPONENT_KIT, type FigureKit } from './players/player-figure.ts';
export { toKeeperAttributes, toKeeperTuning } from './scenes/sandbox-settings.ts';
export { toDefenderSetups, toDefenderTuning } from './scenes/sandbox-settings.ts';
