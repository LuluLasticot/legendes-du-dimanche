'use client';

import type { PreviewHandle, StageStats } from '@legendes/render3d';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

type Outcome = 'goal' | 'wide' | 'over' | 'touchline' | 'stopped' | 'none';

interface Hud {
  stats: StageStats;
  outcome: Outcome;
}

/** Thin mount: hands a canvas to render3d (loaded on demand) and polls its stats for the HUD. */
export function RenderPreview() {
  const t = useTranslations('lab.render');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let handle: PreviewHandle | null = null;
    let cancelled = false;
    let timer = 0;

    import('@legendes/render3d')
      .then(({ mountPreviewScene, qualityFromQuery }) => {
        if (cancelled) return;
        handle = mountPreviewScene(canvas, {
          quality: qualityFromQuery(window.location.search) ?? 'auto',
        });
        timer = window.setInterval(() => {
          if (!handle) return;
          setHud({
            stats: { ...handle.stats },
            outcome: (handle.lastOutcome as Outcome | null) ?? 'none',
          });
        }, 500);
      })
      .catch((error: unknown) => {
        console.error(error);
        setFailed(true);
      });

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      handle?.dispose();
    };
  }, []);

  return (
    <div className="relative min-h-0 flex-1">
      <canvas ref={canvasRef} className="block size-full touch-none" />
      {failed && (
        <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-chalk">
          {t('webglError')}
        </p>
      )}
      {hud && (
        <dl className="absolute top-3 right-3 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 rounded-md bg-pitch-950/75 px-3 py-2 font-mono text-[11px] text-chalk-muted backdrop-blur-sm">
          <dt>{t('fps')}</dt>
          <dd className="text-right text-chalk">{hud.stats.fps.toFixed(0)}</dd>
          <dt>{t('frameMs')}</dt>
          <dd className="text-right text-chalk">{hud.stats.frameMs.toFixed(1)}</dd>
          <dt>{t('drawCalls')}</dt>
          <dd className={`text-right ${hud.stats.drawCalls < 150 ? 'text-chalk' : 'text-danger'}`}>
            {hud.stats.drawCalls}
          </dd>
          <dt>{t('triangles')}</dt>
          <dd
            className={`text-right ${hud.stats.triangles < 300_000 ? 'text-chalk' : 'text-danger'}`}
          >
            {hud.stats.triangles.toLocaleString('fr-FR')}
          </dd>
          <dt>{t('resolution')}</dt>
          <dd className="text-right text-chalk">
            {Math.round(hud.stats.resolution * 100)} % · ×{hud.stats.pixelRatio.toFixed(2)}
          </dd>
          <dt>{t('quality')}</dt>
          <dd className="text-right text-chalk">{hud.stats.quality}</dd>
          <dt>{t('outcome')}</dt>
          <dd className="text-right text-floodlight-400">{t(`outcomes.${hud.outcome}`)}</dd>
        </dl>
      )}
    </div>
  );
}
