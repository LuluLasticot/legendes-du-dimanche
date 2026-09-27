// Tweakpane tuning panel for the ball sandbox (imperative DOM widget, loaded on demand).

import { physics } from '@legendes/engine';
import type { SandboxSettings } from '@legendes/render3d';
import { Pane, type FolderApi } from 'tweakpane';

type Translate = (key: string) => string;

export interface TuningPaneActions {
  onChange: (settings: SandboxSettings) => void;
  onResetSettings: () => void;
  onCopy: () => void;
}

/**
 * Builds the panel on a mutable copy of the settings. Returns the pane (dispose it on unmount)
 * and the live settings object it edits.
 */
export function createTuningPane(
  container: HTMLElement,
  initial: SandboxSettings,
  t: Translate,
  actions: TuningPaneActions,
  expanded: boolean,
): { pane: Pane; settings: SandboxSettings } {
  const settings = structuredClone(initial);
  const pane = new Pane({ container, title: t('title'), expanded });

  const folder = (key: string, open = false): FolderApi =>
    pane.addFolder({ title: t(key), expanded: open });
  const num = <T extends object>(
    f: FolderApi,
    obj: T,
    key: keyof T & string,
    min: number,
    max: number,
    step: number,
    labelKey: string = key,
  ): void => {
    f.addBinding(obj, key, { label: t(labelKey), min, max, step });
  };

  const shooter = folder('shooter', true);
  for (const key of ['shotPower', 'curve', 'finishing', 'composure'] as const)
    num(shooter, settings.shooter, key, 1, 99, 1);
  shooter.addBinding(settings.shooter, 'weakFoot', { label: t('weakFoot') });
  num(shooter, settings.shooter, 'weakFootStars', 1, 5, 1);
  num(shooter, settings.shooter, 'pressure', 0, 1, 0.05);

  const spot = folder('spot', true);
  num(spot, settings.spot, 'distance', 8, 35, 0.5);
  num(spot, settings.spot, 'offset', -20, 20, 0.5);

  const pitch = folder('pitch');
  const surfaceOptions = Object.fromEntries(
    physics.PHYSICS_SURFACES.map((s) => [t(`surfaces.${s}`), s] as const),
  );
  pitch
    .addBinding(settings.pitch, 'surface', { label: t('surface'), options: surfaceOptions })
    .on('change', (event) => {
      // A new surface starts from its own default ground physics.
      Object.assign(settings.surface, physics.DEFAULT_PHYSICS.surfaces[event.value]);
      pane.refresh();
    });
  num(pitch, settings.pitch, 'windSpeed', 0, 15, 0.5);
  num(pitch, settings.pitch, 'windDirection', -180, 180, 5);

  const keeper = folder('keeper', true);
  keeper.addBinding(settings.keeper, 'enabled', { label: t('keeperEnabled') });
  for (const key of ['diving', 'handling', 'reflexes', 'speed', 'positioning'] as const) {
    num(keeper, settings.keeper, key, 1, 99, 1);
  }
  num(keeper, settings.keeper, 'heightCm', 165, 205, 1);
  const keeperTuning = folder('keeperTuning');
  num(keeperTuning, settings.keeper, 'reactionSlow', 0.05, 0.8, 0.01);
  num(keeperTuning, settings.keeper, 'reactionFast', 0.05, 0.8, 0.01);
  num(keeperTuning, settings.keeper, 'readErrorHigh', 0, 2, 0.02);
  num(keeperTuning, settings.keeper, 'readErrorLow', 0, 2, 0.02);
  num(keeperTuning, settings.keeper, 'diveReachLow', 0.5, 3.5, 0.05);
  num(keeperTuning, settings.keeper, 'diveReachHigh', 0.5, 3.5, 0.05);
  num(keeperTuning, settings.keeper, 'diveTimeSlow', 0.2, 1.2, 0.01);
  num(keeperTuning, settings.keeper, 'diveTimeFast', 0.2, 1.2, 0.01);
  num(keeperTuning, settings.keeper, 'catchLow', 0, 1, 0.01);
  num(keeperTuning, settings.keeper, 'catchHigh', 0, 1, 0.01);
  num(keeperTuning, settings.keeper, 'parryRestitution', 0, 1, 0.01);
  num(keeperTuning, settings.keeper, 'lateAdjustLow', 0, 0.6, 0.01);
  num(keeperTuning, settings.keeper, 'lateAdjustHigh', 0, 0.6, 0.01);
  num(keeperTuning, settings.keeper, 'maxShuffle', 0, 2, 0.05);

  const defenders = folder('defenders', true);
  num(defenders, settings.defenders, 'wall', 0, 6, 1);
  num(defenders, settings.defenders, 'markers', 0, 2, 1);
  num(defenders, settings.defenders, 'markerDistance', 2, 15, 0.5);
  num(defenders, settings.defenders, 'markerSpread', 0, 5, 0.1);
  for (const key of ['pace', 'defending', 'physical'] as const)
    num(defenders, settings.defenders, key, 1, 99, 1);
  num(defenders, settings.defenders, 'heightCm', 165, 200, 1);
  const defenderTuning = folder('defenderTuning');
  num(defenderTuning, settings.defenders, 'reactionSlow', 0, 0.8, 0.01, 'markerReactionSlow');
  num(defenderTuning, settings.defenders, 'reactionFast', 0, 0.8, 0.01, 'markerReactionFast');
  num(defenderTuning, settings.defenders, 'wallReactionSlow', 0, 0.8, 0.01);
  num(defenderTuning, settings.defenders, 'wallReactionFast', 0, 0.8, 0.01);
  num(defenderTuning, settings.defenders, 'speedLow', 2, 11, 0.1);
  num(defenderTuning, settings.defenders, 'speedHigh', 2, 11, 0.1);
  num(defenderTuning, settings.defenders, 'jumpLow', 0, 1, 0.01);
  num(defenderTuning, settings.defenders, 'jumpHigh', 0, 1, 0.01);
  num(defenderTuning, settings.defenders, 'lungeLow', 0, 1.2, 0.01);
  num(defenderTuning, settings.defenders, 'lungeHigh', 0, 1.2, 0.01);
  num(defenderTuning, settings.defenders, 'deflectRestitution', 0, 1, 0.01);

  const shot = folder('shot');
  shot.addBinding(settings.shot, 'lob', { label: t('lob') });
  num(shot, settings.shot, 'minSpeed', 2, 20, 0.5);
  num(shot, settings.shot, 'maxSpeedLow', 10, 40, 0.5);
  num(shot, settings.shot, 'maxSpeedHigh', 10, 45, 0.5);
  num(shot, settings.shot, 'maxSpinLow', 0, 120, 1);
  num(shot, settings.shot, 'maxSpinHigh', 0, 150, 1);
  num(shot, settings.shot, 'errorDegHigh', 0, 12, 0.1);
  num(shot, settings.shot, 'errorDegLow', 0, 6, 0.05);
  num(shot, settings.shot, 'weakFootPenaltyPerStar', 0, 1, 0.05);
  num(shot, settings.shot, 'pressurePenalty', 0, 3, 0.1);

  const gesture = folder('gesture');
  num(gesture, settings.gesture, 'fullBulgeRatio', 0.05, 0.6, 0.01);
  num(gesture, settings.gesture, 'fullPowerSpeed', 0.3, 6, 0.1);
  num(gesture, settings.gesture, 'minLength', 0, 0.2, 0.005);
  num(gesture, settings.gesture, 'stillThreshold', 0, 0.01, 0.0001);

  const air = folder('air');
  num(air, settings.air, 'gravity', 0, 20, 0.01);
  num(air, settings.air, 'dragCoefficient', 0, 0.6, 0.01);
  num(air, settings.air, 'magnusCoefficient', 0, 3, 0.05);
  num(air, settings.air, 'spinDecayTime', 0.5, 20, 0.5);

  const ground = folder('surfaceParams');
  num(ground, settings.surface, 'restitution', 0, 1, 0.01);
  num(ground, settings.surface, 'bounceFriction', 0, 1, 0.01);
  num(ground, settings.surface, 'rollingResistance', 0, 0.5, 0.005);
  num(ground, settings.surface, 'bounceJitter', 0, 1, 0.01);
  num(ground, settings.surface, 'rollThreshold', 0, 3, 0.05);

  const debug = folder('debug');
  debug.addBinding(settings.debug, 'prediction', { label: t('prediction') });
  debug.addBinding(settings.debug, 'vectors', { label: t('vectors') });
  debug.addBinding(settings.debug, 'trail', { label: t('trail') });
  num(debug, settings.debug, 'timeScale', 0.1, 1.5, 0.05);
  num(debug, settings.debug, 'replayScale', 0.05, 1, 0.05);
  num(debug, settings.debug, 'seed', 0, 9999, 1);

  pane.addButton({ title: t('copy') }).on('click', actions.onCopy);
  pane.addButton({ title: t('resetSettings') }).on('click', actions.onResetSettings);
  pane.on('change', () => actions.onChange(structuredClone(settings)));

  return { pane, settings };
}
