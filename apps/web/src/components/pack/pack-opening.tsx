'use client';

// A pack opening in the game: the 3D scene of the lab, its clues and its buttons, without the
// lab's menus and tuning. The cards are given (drawn by the server); "Continuer" ends it.

import { cardClassOf, type CardClass, type PackCard } from '@legendes/data';
import type { PackOpeningHandle, PackStep } from '@legendes/render3d';
import type { PackArtType } from '@legendes/ui/card';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFaceTranslators } from '@/components/card/player-card';
import { publicEnv } from '@/env';
import { buildPackAssets } from './pack-assets';
import { PackClues, PackHeroCaption } from './pack-clues';

const MUTED_KEY = 'ld.pack.muted';
const WALKOUT_STEPS: readonly PackStep[] = [
  'lights',
  'league',
  'pause',
  'club',
  'position',
  'player',
  'tension',
  'impact',
];

const button =
  'pointer-events-auto rounded-md bg-floodlight-400 px-5 py-2 font-display text-lg font-extrabold tracking-wide text-pitch-950 uppercase hover:bg-floodlight-300';

export function PackOpening({
  type,
  cards,
  onDone,
}: {
  type: PackArtType;
  /** The pack's cards, least valuable first (as drawn by the server). */
  cards: readonly PackCard[];
  onDone: () => void;
}) {
  const t = useTranslations('packOpening');
  const tp = useTranslations('packs');
  const tr = useFaceTranslators();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<PackOpeningHandle | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [step, setStep] = useState<PackStep>('idle');
  const [muted, setMuted] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem(MUTED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const best = cards.at(-1);
  const labels = useMemo(
    () => ({
      title: tp(`types.${type}.name`),
      contents: tp(`types.${type}.contents`),
      tearHere: tp('print.tearHere'),
      odds: tp('print.odds'),
      legal: tp('print.legal'),
    }),
    [tp, type],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let handle: PackOpeningHandle | null = null;
    import('@legendes/render3d')
      .then(async (render3d) => {
        const assets = await buildPackAssets(render3d, { type, cards }, tr, labels);
        if (cancelled) return;
        handle = render3d.mountPackOpening(canvas, assets, {
          characterAssetsUrl:
            publicEnv.NEXT_PUBLIC_CHARACTER_ASSETS_URL ?? '/api/assets/characters/',
          quality: render3d.qualityFromQuery(window.location.search) ?? 'auto',
          onStep: setStep,
        });
        handle.setMuted(mutedRef.current);
        handleRef.current = handle;
        setStep('idle');
        setState('ready');
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) setState('failed');
      });
    return () => {
      cancelled = true;
      handle?.dispose();
      handleRef.current = null;
    };
  }, [type, cards, tr, labels]);

  const toggleMute = (): void => {
    const next = !muted;
    setMuted(next);
    handleRef.current?.setMuted(next);
    try {
      window.localStorage.setItem(MUTED_KEY, next ? '1' : '0');
    } catch {
      // Private mode: the choice is not kept.
    }
  };

  const summary = useMemo(() => {
    const counts = new Map<CardClass, number>();
    for (const { card } of cards) {
      const c = cardClassOf(card);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].reverse();
  }, [cards]);

  return (
    <div
      className="relative min-h-0 flex-1 select-none"
      data-step={state === 'ready' ? step : state}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label={t('title')} />

      {state !== 'ready' && (
        <div
          className="absolute inset-0 grid place-items-center gap-4 p-6 text-center"
          role="status"
        >
          <p className="text-sm text-chalk-muted">
            {state === 'failed' ? t('failed') : t('loading')}
          </p>
          {state === 'failed' && (
            <button type="button" onClick={onDone} className={button}>
              {t('continue')}
            </button>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end gap-2 p-3">
        {WALKOUT_STEPS.includes(step) && (
          <button
            type="button"
            onClick={() => handleRef.current?.skip()}
            className="pointer-events-auto rounded-md bg-chalk/15 px-3 py-1.5 text-sm font-semibold text-chalk backdrop-blur hover:bg-chalk/25"
          >
            {t('skip')} ›
          </button>
        )}
        <button
          type="button"
          onClick={toggleMute}
          className="pointer-events-auto grid size-8 place-items-center rounded-md border border-chalk/20 bg-pitch-900/85 text-chalk backdrop-blur"
          aria-label={muted ? t('unmute') : t('mute')}
          aria-pressed={muted}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
            {muted ? (
              <path d="M17 9l5 6M22 9l-5 6" />
            ) : (
              <path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" />
            )}
          </svg>
        </button>
      </div>

      <PackClues step={step} best={best} />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4 pb-6 text-center">
        {state === 'ready' && step === 'idle' && (
          <>
            <p className="text-sm text-chalk-muted">{t('hint')}</p>
            <button type="button" onClick={() => handleRef.current?.tear()} className={button}>
              {t('open')}
            </button>
          </>
        )}
        {step === 'hero' && best && <PackHeroCaption best={best} next={t('heroNext')} />}
        {step === 'grid' && (
          <>
            <p className="text-sm text-chalk-muted">{t('gridHint')}</p>
            <button type="button" onClick={() => handleRef.current?.revealAll()} className={button}>
              {t('gridAll')}
            </button>
          </>
        )}
        {step === 'summary' && (
          <>
            <p className="text-sm text-chalk" role="status">
              {t('summary')} : {summary.map(([c, n]) => `${n} ${tp(`classes.${c}`)}`).join(' · ')}
            </p>
            <button type="button" onClick={onDone} className={button}>
              {t('continue')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
