'use client';

import {
  cardClassOf,
  crestNode,
  crestOf,
  getDivision,
  identityOf,
  kitNameNode,
  kitPrintNode,
  openPack,
  PACK_TYPES,
  PACKS,
  packOdds,
  type CardClass,
  type OpenedPack,
  type PackType,
} from '@legendes/data';
import type * as Render3D from '@legendes/render3d';
import type {
  PackOpeningAssets,
  PackOpeningHandle,
  PackStep,
  PackTuning,
  WalkoutVariant,
} from '@legendes/render3d';
import {
  CARD_FINISHES,
  PACK_LOOKS,
  PACK_TEAR_V,
  packMaskNode,
  packNode,
  playerLook,
} from '@legendes/ui/card';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { CARD_FONT_FILES, cardSources, rasterize } from '@/components/card/card-assets';
import {
  cardFaceOf,
  useFaceTranslators,
  type FaceTranslators,
} from '@/components/card/player-card';
import { publicEnv } from '@/env';

const TUNING_KEY = 'ld.lab.pack.tuning';
/** A club's pitch as the 3D stadium paints it. */
const SURFACE_KEY = { grass: 'grass', artificial: 'artificial', stabilized: 'dirt' } as const;
const MUTED_KEY = 'ld.lab.pack.muted';
/** Endings of the player's walkout, in the order of the lab's menu (render3d's list). */
const VARIANTS: readonly WalkoutVariant[] = ['arms_crossed', 'crest', 'thumbs_back'];

const tuningSchema = z.object({
  walkoutRank: z.number().int().min(0).max(8),
  lightsGap: z.number().min(0.1).max(1.5),
  clueHold: z.number().min(0.3).max(3),
  clueGap: z.number().min(0).max(1.5),
  tension: z.number().min(0.3).max(4),
  flash: z.number().min(0).max(2),
  shake: z.number().min(0).max(2),
  particles: z.number().min(0).max(2),
  speed: z.number().min(0.25).max(3),
  playerRank: z.number().int().min(0).max(8),
  playerHold: z.number().min(0).max(3),
  playerDistance: z.number().min(2.5).max(8),
  playerEye: z.number().min(0.3).max(2.5),
  playerLight: z.number().min(0).max(3),
});

const SLIDERS: readonly (readonly [keyof PackTuning, number, number, number])[] = [
  ['walkoutRank', 0, 8, 1],
  ['lightsGap', 0.1, 1.5, 0.02],
  ['clueHold', 0.3, 3, 0.05],
  ['clueGap', 0, 1.5, 0.05],
  ['tension', 0.3, 4, 0.05],
  ['flash', 0, 2, 0.05],
  ['shake', 0, 2, 0.05],
  ['particles', 0, 2, 0.05],
  ['speed', 0.25, 3, 0.05],
  ['playerRank', 0, 8, 1],
  ['playerHold', 0, 3, 0.05],
  ['playerDistance', 2.5, 8, 0.05],
  ['playerEye', 0.3, 2.5, 0.05],
  ['playerLight', 0, 3, 0.05],
];

function loadTuning(defaults: PackTuning): PackTuning {
  try {
    const raw = window.localStorage.getItem(TUNING_KEY);
    if (!raw) return defaults;
    // A setting added since the last visit takes its default; the others are kept.
    const parsed = tuningSchema.partial().safeParse(JSON.parse(raw));
    return parsed.success ? { ...defaults, ...parsed.data } : defaults;
  } catch {
    return defaults;
  }
}

function store(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode: settings are not kept.
  }
}

const randomSeed = (): string => {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

/** A seed whose pack's best card is of the class asked for (to tune each reveal in the lab). */
function seedFor(type: PackType, force: CardClass | null, base: string): string {
  if (!force) return base;
  for (let i = 0; i < 6000; i++) {
    const seed = `${base}-${i}`;
    const last = openPack(type, seed).cards.at(-1);
    if (last && cardClassOf(last.card) === force) return seed;
  }
  return base;
}

async function buildAssets(
  render3d: typeof Render3D,
  opened: OpenedPack,
  tr: FaceTranslators,
  labels: Parameters<typeof packNode>[1],
): Promise<PackOpeningAssets> {
  const css = await render3d.cardFontCss(CARD_FONT_FILES);
  const backs = new Map<string, Promise<readonly [HTMLCanvasElement, HTMLCanvasElement]>>();
  const last = opened.cards.length - 1;
  const cards = await Promise.all(
    opened.cards.map(async ({ card, club }, i) => {
      const face = cardFaceOf(card, club, tr);
      const sources = await cardSources(
        render3d,
        face,
        i === last ? 1024 : 512,
        css,
        i === last ? undefined : backs,
      );
      return { ...sources, rank: CARD_FINISHES[face.look].rank };
    }),
  );
  const bestClub = opened.cards[last]?.club;
  if (!bestClub) throw new Error('Empty pack');
  const type = opened.type;
  const look = PACK_LOOKS[type];
  // The best card's player walks out in his club's home kit (his keeper's kit for a keeper),
  // with its prints and his name above his number.
  const player = opened.cards[last]?.card.player;
  const identity = identityOf(bestClub);
  const keeper = player?.positions[0] === 'GK';
  const kit = keeper ? identity.kits.keeper : identity.kits.home;
  const [front, frontMask, back, backMask, crest, prints, backName] = await Promise.all([
    rasterize(render3d, packNode(type, labels, 'pack'), 580, css),
    rasterize(render3d, packMaskNode(type, labels, 'pack'), 290, css),
    rasterize(render3d, packNode(type, labels, 'pack-back', true), 580, css),
    rasterize(render3d, packMaskNode(type, labels, 'pack-back', true), 290, css),
    rasterize(render3d, crestNode(crestOf(bestClub), 'crest-best'), 400, css),
    rasterize(
      render3d,
      kitPrintNode(kit, {
        uid: `${bestClub.id}-walkout-print`,
        crest: identity.crest,
        sponsor: keeper ? undefined : identity.sponsors[0]?.label,
      }),
      1024,
      css,
    ),
    player ? rasterize(render3d, kitNameNode(kit, player.lastName), 512, css) : null,
  ]);
  return {
    pack: {
      front,
      frontMask,
      back,
      backMask,
      tint: look.tint,
      holo: look.holo,
      tearV: PACK_TEAR_V,
    },
    cards,
    crest,
    clubColours: [bestClub.colours.primary, bestClub.colours.secondary],
    surface: SURFACE_KEY[bestClub.stadium.surface],
    player: player ? { ...playerLook(player, kit, keeper), prints, backName } : undefined,
  };
}

export function PackLab() {
  const t = useTranslations('lab.pack');
  const tp = useTranslations('packs');
  const tPos = useTranslations('positions');
  const tr = useFaceTranslators();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<PackOpeningHandle | null>(null);
  const [type, setType] = useState<PackType>('gold');
  const [force, setForce] = useState<CardClass | null>(null);
  const [variant, setVariant] = useState<WalkoutVariant | null>(null);
  const [seed, setSeed] = useState(randomSeed);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [step, setStep] = useState<PackStep>('idle');
  const [panel, setPanel] = useState<'none' | 'odds' | 'tuning'>('none');
  const [defaults, setDefaults] = useState<PackTuning | null>(null);
  const [tuning, setTuning] = useState<PackTuning | null>(null);
  const [muted, setMuted] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem(MUTED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const tuningRef = useRef(tuning);
  useEffect(() => {
    tuningRef.current = tuning;
  }, [tuning]);
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const opened = useMemo(() => openPack(type, seedFor(type, force, seed)), [type, force, seed]);
  const best = opened.cards.at(-1);
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
        const assets = await buildAssets(render3d, opened, tr, labels);
        if (cancelled) return;
        const initial = tuningRef.current ?? loadTuning(render3d.DEFAULT_PACK_TUNING);
        setDefaults(render3d.DEFAULT_PACK_TUNING);
        setTuning(initial);
        handle = render3d.mountPackOpening(canvas, assets, {
          tuning: initial,
          characterAssetsUrl:
            publicEnv.NEXT_PUBLIC_CHARACTER_ASSETS_URL ?? '/api/assets/characters/',
          walkoutVariant: variant ?? undefined,
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
  }, [opened, tr, labels, variant]);

  const newPack = (next: PackType = type): void => {
    setState('loading');
    setType(next);
    setSeed(randomSeed());
  };

  const updateTuning = (next: PackTuning): void => {
    setTuning(next);
    handleRef.current?.setTuning(next);
    store(TUNING_KEY, JSON.stringify(next));
  };

  const toggleMute = (): void => {
    const next = !muted;
    setMuted(next);
    handleRef.current?.setMuted(next);
    store(MUTED_KEY, next ? '1' : '0');
  };

  const choosing = step === 'idle' || step === 'summary';
  const idle = state === 'ready' && step === 'idle';
  const walkoutSteps: readonly PackStep[] = [
    'lights',
    'league',
    'pause',
    'club',
    'position',
    'player',
    'tension',
  ];
  const heroPlayer = best?.card.player;
  const heroDivision = best ? getDivision(best.club.divisionId) : undefined;
  const summary = useMemo(() => {
    const counts = new Map<CardClass, number>();
    for (const { card } of opened.cards) {
      const c = cardClassOf(card);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].reverse();
  }, [opened]);
  const possible = packOdds(type).map((o) => o.cardClass);

  return (
    <div
      className="relative min-h-0 flex-1 select-none"
      data-step={state === 'ready' ? step : state}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label={t('title')} />

      {state !== 'ready' && (
        <p
          className="absolute inset-0 grid place-items-center text-sm text-chalk-muted"
          role="status"
        >
          {state === 'failed' ? t('failed') : t('loading')}
        </p>
      )}

      {/* Top bar: pack, forced best card, odds, settings, sound. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto flex flex-wrap gap-2">
          {idle && (
            <>
              <select
                aria-label={t('choose')}
                value={type}
                onChange={(e) => newPack(e.target.value as PackType)}
                className="rounded-md border border-chalk/20 bg-pitch-900/85 px-2 py-1.5 text-sm text-chalk backdrop-blur"
              >
                {PACK_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {tp(`types.${p}.name`)} · {tp('price', { price: PACKS[p].price })}
                  </option>
                ))}
              </select>
              <select
                aria-label={t('force')}
                value={force ?? ''}
                onChange={(e) => {
                  setState('loading');
                  setForce((e.target.value || null) as CardClass | null);
                }}
                className="rounded-md border border-chalk/20 bg-pitch-900/85 px-2 py-1.5 text-sm text-chalk backdrop-blur"
              >
                <option value="">
                  {t('force')} : {t('forceAny')}
                </option>
                {possible.map((c) => (
                  <option key={c} value={c}>
                    {t('force')} : {tp(`classes.${c}`)}
                  </option>
                ))}
              </select>
              <select
                aria-label={t('variant')}
                value={variant ?? ''}
                onChange={(e) => {
                  setState('loading');
                  setVariant((e.target.value || null) as WalkoutVariant | null);
                }}
                className="rounded-md border border-chalk/20 bg-pitch-900/85 px-2 py-1.5 text-sm text-chalk backdrop-blur"
              >
                <option value="">
                  {t('variant')} : {t('variants.random')}
                </option>
                {VARIANTS.map((v) => (
                  <option key={v} value={v}>
                    {t('variant')} : {t(`variants.${v}`)}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <div className="pointer-events-auto flex gap-2">
          {walkoutSteps.includes(step) || step === 'impact' ? (
            <button
              type="button"
              onClick={() => handleRef.current?.skip()}
              className="rounded-md bg-chalk/15 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-chalk backdrop-blur hover:bg-chalk/25 sm:text-sm"
            >
              {t('skip')} ›
            </button>
          ) : null}
          {(choosing || step === 'grid') && (
            <>
              <button
                type="button"
                onClick={() => setPanel(panel === 'odds' ? 'none' : 'odds')}
                className="rounded-md border border-chalk/20 bg-pitch-900/85 px-2.5 py-1.5 text-xs text-chalk backdrop-blur sm:text-sm"
                aria-expanded={panel === 'odds'}
              >
                {t('showOdds')}
              </button>
              <button
                type="button"
                onClick={() => setPanel(panel === 'tuning' ? 'none' : 'tuning')}
                className="rounded-md border border-chalk/20 bg-pitch-900/85 px-2.5 py-1.5 text-xs text-chalk backdrop-blur sm:text-sm"
                aria-expanded={panel === 'tuning'}
              >
                {t('tuningToggle')}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={toggleMute}
            className="grid size-8 place-items-center rounded-md border border-chalk/20 bg-pitch-900/85 text-chalk backdrop-blur"
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
      </div>

      {panel === 'odds' && (choosing || step === 'grid') && (
        <section
          className="absolute top-14 right-3 z-10 w-72 rounded-xl border border-chalk/15 bg-pitch-900/95 p-4 text-sm text-chalk shadow-card backdrop-blur"
          aria-label={tp('odds.title')}
        >
          <h2 className="font-display text-xl">
            {tp('odds.title')} · {tp(`types.${type}.name`)}
          </h2>
          <table className="mt-2 w-full text-left">
            <thead className="text-xs text-chalk-faint">
              <tr>
                <th className="py-1 font-normal">{tp('odds.class')}</th>
                <th className="py-1 text-right font-normal">{tp('odds.expected')}</th>
                <th className="py-1 text-right font-normal">{tp('odds.atLeastOne')}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {packOdds(type).map((o) => (
                <tr key={o.cardClass} className="border-t border-chalk/5">
                  <td className="py-1">{tp(`classes.${o.cardClass}`)}</td>
                  <td className="py-1 text-right">{o.expected.toFixed(2).replace('.', ',')}</td>
                  <td className="py-1 text-right">{formatPercent(o.atLeastOne)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-chalk-faint">{tp('odds.note')}</p>
        </section>
      )}

      {panel === 'tuning' && (choosing || step === 'grid') && tuning && defaults && (
        <section
          className="absolute top-14 right-3 z-10 w-72 rounded-xl border border-chalk/15 bg-pitch-900/95 p-4 text-chalk shadow-card backdrop-blur"
          aria-label={t('tuningToggle')}
        >
          <div className="space-y-2.5">
            {SLIDERS.map(([key, min, max, stepSize]) => (
              <label key={key} className="block text-xs text-chalk-muted">
                <span className="flex justify-between">
                  {t(`tuning.${key}`)}
                  <span className="text-chalk tabular-nums">{tuning[key]}</span>
                </span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={stepSize}
                  value={tuning[key]}
                  onChange={(e) => updateTuning({ ...tuning, [key]: Number(e.target.value) })}
                  className="mt-1 w-full accent-floodlight-400"
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => updateTuning(defaults)}
            className="mt-3 rounded-md border border-chalk/20 px-3 py-1.5 text-sm text-chalk-muted hover:border-floodlight-400"
          >
            {t('tuning.reset')}
          </button>
        </section>
      )}

      {/* Clues of the walkout. */}
      <div
        className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center"
        aria-live="polite"
      >
        {step === 'league' && heroDivision && (
          <p
            key="league"
            className="font-display ld-slam text-5xl tracking-wide text-chalk drop-shadow-[0_4px_24px_rgb(0_0_0/0.8)] sm:text-7xl"
          >
            {heroDivision.name}
          </p>
        )}
        {step === 'club' && best && (
          <p
            key="club"
            className="font-display ld-rise absolute bottom-[18%] text-4xl text-chalk drop-shadow-[0_4px_24px_rgb(0_0_0/0.8)] sm:text-6xl"
          >
            {best.club.name}
          </p>
        )}
        {step === 'position' && heroPlayer && (
          <p
            key="position"
            className="font-display ld-slam text-5xl text-floodlight-300 drop-shadow-[0_4px_24px_rgb(0_0_0/0.8)] sm:text-7xl"
          >
            {tPos(`${heroPlayer.positions[0] ?? 'CM'}.long`)}
          </p>
        )}
      </div>

      {/* Bottom: hint and actions. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4 pb-6 text-center">
        {state === 'ready' && step === 'idle' && (
          <>
            <p className="text-sm text-chalk-muted">{t('hint')}</p>
            <button
              type="button"
              onClick={() => handleRef.current?.tear()}
              className="pointer-events-auto rounded-md bg-floodlight-400 px-5 py-2 text-sm font-bold text-pitch-950 hover:bg-floodlight-300"
            >
              {t('open')}
            </button>
          </>
        )}
        {step === 'hero' && best && heroPlayer && (
          <div className="ld-rise">
            {best.card.variant !== 'base' && (
              <p className="text-xs font-bold tracking-[0.2em] text-floodlight-400 uppercase">
                {tr.cards(`variants.${best.card.variant}`)}
              </p>
            )}
            <p className="font-display text-3xl text-chalk">{heroPlayer.displayName}</p>
            <p className="text-sm text-chalk-muted">
              {heroPlayer.rating} · {tPos(`${heroPlayer.positions[0] ?? 'CM'}.long`)} ·{' '}
              {best.club.name}
            </p>
            <p className="mt-2 text-xs text-chalk-faint">{t('hero.next')}</p>
          </div>
        )}
        {step === 'grid' && (
          <>
            <p className="text-sm text-chalk-muted">{t('grid.hint')}</p>
            <button
              type="button"
              onClick={() => handleRef.current?.revealAll()}
              className="pointer-events-auto rounded-md bg-floodlight-400 px-5 py-2 text-sm font-bold text-pitch-950 hover:bg-floodlight-300"
            >
              {t('grid.all')}
            </button>
          </>
        )}
        {step === 'summary' && (
          <>
            <p className="text-sm text-chalk" role="status">
              {t('summary.title')} :{' '}
              {summary.map(([c, n]) => `${n} ${tp(`classes.${c}`)}`).join(' · ')}
            </p>
            <select
              aria-label={t('choose')}
              value={type}
              onChange={(e) => newPack(e.target.value as PackType)}
              className="pointer-events-auto rounded-md border border-chalk/20 bg-pitch-900/85 px-2 py-1.5 text-sm text-chalk backdrop-blur"
            >
              {PACK_TYPES.map((p) => (
                <option key={p} value={p}>
                  {tp(`types.${p}.name`)} · {tp('price', { price: PACKS[p].price })}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => newPack()}
              className="pointer-events-auto rounded-md bg-floodlight-400 px-5 py-2 text-sm font-bold text-pitch-950 hover:bg-floodlight-300"
            >
              {t('summary.again')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const formatPercent = (p: number): string =>
  p >= 0.9995
    ? '100 %'
    : p < 0.001
      ? '< 0,1 %'
      : `${(p * 100).toFixed(p < 0.1 ? 1 : 0).replace('.', ',')} %`;
