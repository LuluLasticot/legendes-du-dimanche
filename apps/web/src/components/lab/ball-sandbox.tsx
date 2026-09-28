'use client';

import type { GesturePoint } from '@legendes/engine/moments';
import type { SandboxHandle, SandboxSettings, ShotReport } from '@legendes/render3d';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { publicEnv } from '@/env';
import {
  clearSandboxSettings,
  loadSandboxSettings,
  saveSandboxSettings,
} from '@/lib/lab/sandbox-settings';

/**
 * Thin mount of the ball sandbox: hands a canvas to render3d and a container to Tweakpane (both
 * loaded on demand), draws the traced gesture as an SVG overlay and shows the last shot report.
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
              },
              onResetSettings: () => {
                clearSandboxSettings();
                handle.setSettings(defaults);
                buildPane(defaults);
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

        dispose = () => {
          offGesture();
          offShot();
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
    <div className="relative min-h-0 flex-1 select-none">
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

      <div ref={paneRef} className="absolute top-3 left-3 w-72 max-w-[calc(100%-1.5rem)]" />

      {report && (
        <dl className="pointer-events-none absolute top-3 right-3 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 rounded-md bg-pitch-950/75 px-3 py-2 font-mono text-[11px] text-chalk-muted backdrop-blur-sm">
          <dt className="col-span-2 text-chalk">
            {t('hud.shot', { index: report.index + 1 })}
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

      {!report && (
        <p className="pointer-events-none absolute top-1/3 left-1/2 w-[min(28rem,80%)] -translate-x-1/2 rounded-md bg-pitch-950/60 px-3 py-2 text-center text-xs text-chalk backdrop-blur-sm">
          {t('hint')}
        </p>
      )}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
        <button
          type="button"
          onClick={() => handleRef.current?.replay()}
          className="rounded-pill border border-floodlight-400/40 bg-pitch-900/80 px-4 py-2 text-sm font-semibold text-floodlight-300 backdrop-blur-sm hover:bg-pitch-800"
        >
          {t('replay')}
        </button>
        <button
          type="button"
          onClick={() => handleRef.current?.reset()}
          className="rounded-pill border border-chalk/20 bg-pitch-900/80 px-4 py-2 text-sm font-semibold text-chalk backdrop-blur-sm hover:bg-pitch-800"
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
