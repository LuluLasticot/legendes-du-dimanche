'use client';

import { toSvgString, type Card, type Club } from '@legendes/data';
import type { CardViewerHandle } from '@legendes/render3d';
import {
  CARD_FINISHES,
  cardBackMaskNode,
  cardBackNode,
  cardMaskNode,
  cardNode,
  DEFAULT_CARD_TUNING,
  silhouette,
} from '@legendes/ui/card';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useCardFace, useCardLabel } from './player-card';

/** The card's fonts, embedded in the 3D textures (an SVG drawn as an image cannot see the page's). */
const FONTS = [
  { family: 'Big Shoulders', weight: 700, url: '/fonts/big-shoulders-latin-700-normal.woff' },
  { family: 'Big Shoulders', weight: 800, url: '/fonts/big-shoulders-latin-800-normal.woff' },
  { family: 'Big Shoulders', weight: 900, url: '/fonts/big-shoulders-latin-900-normal.woff' },
  { family: 'Manrope', weight: 700, url: '/fonts/manrope-latin-700-normal.woff' },
  { family: 'Manrope', weight: 800, url: '/fonts/manrope-latin-800-normal.woff' },
] as const;

type OrientationPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

/**
 * A card in 3D (D-035), mounted on a canvas: tilt with the mouse, the finger or the gyroscope,
 * turn it over, replay its reveal. Thin mount: the scene lives in `@legendes/render3d`.
 */
export function CardViewer3D({
  card,
  club,
  revealOnOpen = true,
}: {
  card: Card;
  club: Club;
  revealOnOpen?: boolean;
}) {
  const t = useTranslations('lab.cards.viewer');
  const face = useCardFace(card, club);
  const label = useCardLabel(card, club);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<CardViewerHandle | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [gyro, setGyro] = useState<'off' | 'on' | 'unavailable'>(() =>
    typeof window !== 'undefined' &&
    'DeviceOrientationEvent' in window &&
    window.matchMedia('(pointer: coarse)').matches
      ? 'off'
      : 'unavailable',
  );
  const [stats, setStats] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    const current = face;
    const finish = CARD_FINISHES[current.look];

    // Texture size: about the card's height on screen in device pixels, 512 to 1024 wide.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(
      512,
      Math.min(1024, Math.round(((canvas.clientHeight * 0.8 * dpr) / 350) * 250 * 1.25)),
    );
    const height = Math.round((width * 350) / 250);
    const svgs = [
      // No painted sheen nor grain: the shader lights the card (and the grain's blending is lost
      // when an SVG is drawn as an image).
      toSvgString(cardNode(current, { ...DEFAULT_CARD_TUNING, sheen: 0, grain: 0 })),
      toSvgString(cardMaskNode(current)),
      toSvgString(cardBackNode(current.look, `${current.uid}-back`)),
      toSvgString(cardBackMaskNode(current.look, `${current.uid}-back`)),
    ] as const;

    import('@legendes/render3d')
      .then(async (render3d) => {
        const css = await render3d.cardFontCss(FONTS);
        const [faceTex, faceMask, back, backMask] = await Promise.all(
          svgs.map((svg) => render3d.rasterizeSvg(svg, width, height, css)),
        );
        if (cancelled || !faceTex || !faceMask || !back || !backMask) return;
        handleRef.current = render3d.mountCardViewer(
          canvas,
          { outline: silhouette(0), face: faceTex, faceMask, back, backMask, finish },
          {
            rank: finish.rank,
            faceDown: revealOnOpen,
            quality: render3d.qualityFromQuery(window.location.search) ?? 'auto',
          },
        );
        setState('ready');
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) setState('failed');
      });

    const showStats = new URLSearchParams(window.location.search).has('stats');
    const timer = showStats
      ? window.setInterval(() => {
          const s = handleRef.current?.stats;
          if (s)
            setStats(
              `${s.fps.toFixed(0)} i/s · ${s.frameMs.toFixed(1)} ms · ${s.drawCalls} appels · ${s.quality}`,
            );
        }, 500)
      : 0;

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [face, revealOnOpen]);

  const enableGyro = async (): Promise<void> => {
    const request = (DeviceOrientationEvent as OrientationPermission).requestPermission;
    if (request && (await request()) !== 'granted') return;
    handleRef.current?.enableGyro();
    setGyro('on');
  };

  return (
    <div className="flex h-full flex-col items-center gap-3">
      <div className="relative w-full flex-1">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
          role="img"
          aria-label={label}
        />
        {state !== 'ready' && (
          <p
            className="absolute inset-0 grid place-items-center text-sm text-chalk-muted"
            role="status"
          >
            {state === 'failed' ? t('failed') : t('loading')}
          </p>
        )}
        {stats && (
          <p className="absolute top-2 left-2 rounded bg-black/60 px-2 py-1 font-mono text-[11px] text-chalk">
            {stats}
          </p>
        )}
      </div>
      <p className="text-center text-xs text-chalk-faint">{t('hint')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => handleRef.current?.flip()}
          disabled={state !== 'ready'}
          className="rounded-md border border-chalk/20 px-4 py-2 text-sm text-chalk enabled:hover:border-floodlight-400 disabled:opacity-40"
        >
          {t('flip')}
        </button>
        <button
          type="button"
          onClick={() => void handleRef.current?.reveal()}
          disabled={state !== 'ready'}
          className="rounded-md bg-floodlight-400 px-4 py-2 text-sm font-bold text-pitch-950 enabled:hover:bg-floodlight-300 disabled:opacity-40"
        >
          {t('reveal')}
        </button>
        {gyro === 'off' && (
          <button
            type="button"
            onClick={() => void enableGyro()}
            disabled={state !== 'ready'}
            className="rounded-md border border-chalk/20 px-4 py-2 text-sm text-chalk disabled:opacity-40"
          >
            {t('gyro')}
          </button>
        )}
      </div>
    </div>
  );
}
