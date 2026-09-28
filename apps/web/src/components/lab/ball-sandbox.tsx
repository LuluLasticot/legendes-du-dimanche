'use client';

import { SITUATIONS, type GesturePoint, type Situation } from '@legendes/engine/moments';
import type { SandboxHandle, SandboxSettings, SandboxStep, ShotReport } from '@legendes/render3d';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { publicEnv } from '@/env';
import {
  clearSandboxSettings,
  loadSandboxSettings,
  saveSandboxSettings,
} from '@/lib/lab/sandbox-settings';

/** Past this gauge value a penalty gets hard to control (engine: moments.penaltyGauge). */
const GAUGE_SWEET_END = 0.82;

/**
 * Thin mount of the ball sandbox: hands a canvas to render3d and a container to Tweakpane (both
 * loaded on demand), draws the traced gesture as an SVG overlay, the situation picker, the hint
 * of the current step, the penalty gauge and the last shot report.
 */
export function BallSandbox() {
  const t = useTranslations('lab.ball');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<SandboxHandle | null>(null);
  const [trace, setTrace] = useState<readonly GesturePoint[] | null>(null);
  const [aspect, setAspect] = useState(1);
  const [report, setReport] = useState<ShotReport | null>(null);
  const [failed, setFailed] = useState(false);
  const [step, setStep] = useState<SandboxStep | null>(null);
  const [gauge, setGauge] = useState<number | null>(null);
  const [situation, setSituation] = useState<Situation | null>(null);
  const selectSituationRef = useRef<(situation: Situation) => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    const paneContainer = paneRef.current;
    if (!canvas || !paneContainer) return;
    let cancelled = false;
    let dispose = (): void => {};

    const observer = new ResizeObserver(() =>
      setAspect(canvas.clientWidth / Math.max(1, canvas.clientHeight)),
    );
    observer.observe(canvas);

    Promise.all([import('@legendes/render3d'), import('./tuning-pane')])
      .then(([render3d, { createTuningPane }]) => {
        if (cancelled) return;
        const defaults = render3d.defaultSandboxSettings();
        const initial = loadSandboxSettings(defaults);
        const handle = render3d.mountBallSandbox(canvas, initial, {
          quality: render3d.qualityFromQuery(window.location.search) ?? 'auto',
          characterAssetsUrl: publicEnv.NEXT_PUBLIC_CHARACTER_ASSETS_URL ?? '/assets/characters/',
        });
        handleRef.current = handle;
        const offGesture = handle.onGesture((points) => setTrace(points ? [...points] : null));
        const offShot = handle.onShot(setReport);
        const offStep = handle.onStep(setStep);
        const offGauge = handle.onGauge(setGauge);
        setSituation(initial.situation);

        const tp = (key: string): string => t(`panel.${key}` as Parameters<typeof t>[0]);
        let current: { pane: { dispose(): void }; settings: SandboxSettings } | null = null;
        const buildPane = (settings: SandboxSettings): void => {
          current?.pane.dispose();
          current = createTuningPane(
            paneContainer,
            settings,
            (key) => (key.startsWith('surfaces.') ? t(key as Parameters<typeof t>[0]) : tp(key)),
            {
              onChange: (next) => {
                handle.setSettings(next);
                saveSandboxSettings(next);
                setSituation(next.situation);
              },
              onResetSettings: () => {
                clearSandboxSettings();
                handle.setSettings(defaults);
                buildPane(defaults);
                setSituation(defaults.situation);
              },
              onCopy: () => {
                if (current)
                  void navigator.clipboard.writeText(JSON.stringify(current.settings, null, 2));
              },
            },
            window.matchMedia('(min-width: 768px)').matches,
          );
        };
        buildPane(initial);
        selectSituationRef.current = (next) => {
          if (!current) return;
          const settings = { ...current.settings, situation: next };
          handle.setSettings(settings);
          saveSandboxSettings(settings);
          buildPane(settings);
          setSituation(next);
          setReport(null);
        };

        dispose = () => {
          offGesture();
          offShot();
          offStep();
          offGauge();
          current?.pane.dispose();
          handle.dispose();
          handleRef.current = null;
        };
      })
      .catch((error: unknown) => {
        console.error(error);
        setFailed(true);
      });

    return () => {
      cancelled = true;
      observer.disconnect();
      dispose();
    };
  }, [t]);

  const outcomeLabel = (outcome: ShotReport['outcome']): string =>
    outcome === null ? '…' : t(`outcomes.${outcome}` as Parameters<typeof t>[0]);

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden select-none">
      <canvas ref={canvasRef} className="block size-full touch-none" />

      {trace && trace.length > 1 && (
        <svg
          className="pointer-events-none absolute inset-0 size-full"
          viewBox={`0 0 ${aspect} 1`}
          preserveAspectRatio="xMinYMin meet"
          aria-hidden
        >
          <polyline
            points={trace.map((p) => `${p.u},${p.v}`).join(' ')}
            fill="none"
            // CSS variables only work through style, not presentation attributes.
            style={{ stroke: 'var(--ld-color-floodlight-400)' }}
            strokeWidth={0.008}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.85}
          />
        </svg>
      )}

      <div
        ref={paneRef}
        className="absolute top-3 left-3 max-h-[calc(100%-8.5rem)] w-72 max-w-[calc(100%-1.5rem)] overflow-y-auto overscroll-contain"
      />

      {report && (
        <dl className="pointer-events-none absolute top-3 right-3 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 rounded-md bg-pitch-950/75 px-3 py-2 font-mono text-[11px] text-chalk-muted backdrop-blur-sm">
          <dt className="col-span-2 text-chalk">
            {t(`situations.${report.situation}`)} · {t('hud.shot', { index: report.index + 1 })}
            {report.replay ? ` · ${t('hud.replay')}` : ''}
          </dt>
          <dt>{t('hud.power')}</dt>
          <dd className="text-right text-chalk">{Math.round(report.power * 100)} %</dd>
          <dt>{t('hud.bulge')}</dt>
          <dd className="text-right text-chalk">{report.bulge.toFixed(2)}</dd>
          <dt>{t('hud.speed')}</dt>
          <dd className="text-right text-chalk">{report.speedKmh.toFixed(0)} km/h</dd>
          <dt>{t('hud.spin')}</dt>
          <dd className="text-right text-chalk">{report.spinRps.toFixed(1)} tr/s</dd>
          <dt>{t('hud.error')}</dt>
          <dd className="text-right text-chalk">{report.errorDeg.toFixed(2)}°</dd>
          {report.difficulty > 0 && (
            <>
              <dt>{t('hud.difficulty')}</dt>
              <dd className="text-right text-chalk">{Math.round(report.difficulty * 100)} %</dd>
            </>
          )}
          <dt>{t('hud.solver')}</dt>
          <dd className="text-right text-chalk">
            {(report.solverMiss * 100).toFixed(1)} cm · {report.solverIterations} it.
          </dd>
          {report.save && (
            <>
              <dt>{t('hud.save')}</dt>
              <dd className="text-right text-chalk">{t(`saves.${report.save}`)}</dd>
            </>
          )}
          <dt>{t('hud.outcome')}</dt>
          <dd className="text-right text-floodlight-400">{outcomeLabel(report.outcome)}</dd>
        </dl>
      )}

      {gauge !== null && (
        <div
          className="pointer-events-none absolute top-1/2 right-4 h-48 w-4 -translate-y-1/2 overflow-hidden rounded-pill border border-chalk/30 bg-pitch-950/70"
          role="meter"
          aria-label={t('gauge')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(gauge * 100)}
        >
          {/* Sweet spot, then the zone where the strike gets away from the shooter. */}
          <div
            className="absolute inset-x-0 bg-floodlight-400/35"
            style={{ bottom: '55%', height: `${(GAUGE_SWEET_END - 0.55) * 100}%` }}
          />
          <div
            className="absolute inset-x-0 top-0 bg-danger/50"
            style={{ height: `${(1 - GAUGE_SWEET_END) * 100}%` }}
          />
          <div
            className="absolute inset-x-0 h-1 bg-chalk"
            style={{ bottom: `calc(${gauge * 100}% - 2px)` }}
          />
        </div>
      )}

      {step && step !== 'playing' && (
        <p className="pointer-events-none absolute bottom-28 left-1/2 w-[min(30rem,86%)] -translate-x-1/2 rounded-md bg-pitch-950/65 px-3 py-2 text-center text-xs text-chalk backdrop-blur-sm">
          {t(`hints.${step}`)}
        </p>
      )}

      <div
        className="absolute bottom-16 left-1/2 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 gap-1 overflow-x-auto rounded-pill bg-pitch-950/60 p-1 backdrop-blur-sm"
        role="tablist"
        aria-label={t('panel.situation')}
      >
        {SITUATIONS.map((kind) => (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={situation === kind}
            onClick={() => selectSituationRef.current(kind)}
            className={`shrink-0 rounded-pill px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
              situation === kind
                ? 'bg-floodlight-400 text-pitch-950'
                : 'text-chalk hover:bg-pitch-800'
            }`}
          >
            {t(`situations.${kind}`)}
          </button>
        ))}
      </div>

      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
        <button
          type="button"
          onClick={() => handleRef.current?.replay()}
          className="rounded-pill border border-floodlight-400/40 bg-pitch-900/80 px-3 py-1.5 text-xs font-semibold whitespace-nowrap sm:px-4 sm:py-2 sm:text-sm text-floodlight-300 backdrop-blur-sm hover:bg-pitch-800"
        >
          {t('replay')}
        </button>
        <button
          type="button"
          onClick={() => handleRef.current?.reset()}
          className="rounded-pill border border-chalk/20 bg-pitch-900/80 px-3 py-1.5 text-xs font-semibold whitespace-nowrap sm:px-4 sm:py-2 sm:text-sm text-chalk backdrop-blur-sm hover:bg-pitch-800"
        >
          {t('reset')}
        </button>
      </div>

      {failed && (
        <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-chalk">
          {t('webglError')}
        </p>
      )}
    </div>
  );
}
