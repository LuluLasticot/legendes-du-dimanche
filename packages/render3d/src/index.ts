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
export {
  mountBallSandbox,
  type MomentLook,
  type MomentLooks,
  type MomentResult,
  type SandboxHandle,
  type SandboxOutcome,
  type SandboxStep,
  type ShotReport,
} from './scenes/sandbox.ts';
export {
  defaultSandboxSettings,
  toPhysicsParams,
  toShotTuning,
  type SandboxSettings,
} from './scenes/sandbox-settings.ts';
export {
  PlayerFigure,
  HOME_KIT,
  KEEPER_KIT,
  OPPONENT_KIT,
  type FigureKit,
} from './players/player-figure.ts';
export {
  toKeeperAttributes,
  toKeeperTuning,
  settingsForMoment,
} from './scenes/sandbox-settings.ts';
export { toDefenderSetups, toDefenderTuning } from './scenes/sandbox-settings.ts';
export {
  CameraDirector,
  DEFAULT_DIRECTOR_SETTINGS,
  REPLAY_ANGLES,
  type CameraMode,
  type DirectorSettings,
  type ReplayAngle,
} from './camera/director.ts';
export { MatchAudio, DEFAULT_VOLUMES, type AudioVolumes } from './audio/match-audio.ts';
export { BallTrail, trailColour } from './fx/trail.ts';
export { ImpactParticles, surfaceParticles, type ParticleKind } from './fx/particles.ts';
export {
  Card3D,
  CARD3D_HEIGHT,
  CARD3D_WIDTH,
  type Card3DFinish,
  type Card3DSources,
} from './cards/card3d.ts';
export { cardFontCss, rasterizeSvg, type CardFont } from './cards/raster.ts';
export {
  mountCardViewer,
  type CardViewerHandle,
  type CardViewerOptions,
} from './scenes/card-viewer.ts';
export { PackAudio } from './audio/pack-audio.ts';
export { Pack3D, PACK3D_HEIGHT, PACK3D_WIDTH, type Pack3DSources } from './cards/pack3d.ts';
export {
  DEFAULT_PACK_TUNING,
  mountPackOpening,
  type PackCardAssets,
  type PackOpeningAssets,
  type PackOpeningHandle,
  type PackOpeningOptions,
  type PackStep,
  type PackTuning,
} from './scenes/pack-opening.ts';
export {
  DEFAULT_KIT_SHAPE,
  plainLook,
  type CharacterKitSpec,
  type CharacterLook,
  type KitShape,
} from './players/kit-material.ts';
export { createMannequinAsset } from './players/mannequin.ts';
export {
  mountKitViewer,
  type KitViewerHandle,
  type KitViewerInfo,
  type KitViewerOptions,
} from './scenes/kit-viewer.ts';
