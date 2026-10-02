'use client';

import {
  DIVISIONS,
  generateSquad,
  identityOf,
  kitPrintNode,
  WORLD,
  type Club,
  type KitSpec,
  type Player,
} from '@legendes/data';
import type * as Render3D from '@legendes/render3d';
import type { CharacterLook, KitShape, KitViewerHandle, KitViewerInfo } from '@legendes/render3d';
import { playerLook } from '@legendes/ui/card';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { CARD_FONT_FILES, rasterize } from '@/components/card/card-assets';
import { publicEnv } from '@/env';

const SHAPE_KEY = 'ld.lab.kits.shape';
const KITS = ['home', 'away', 'keeper'] as const;
type KitName = (typeof KITS)[number];

/** Every setting of the kit's cut: [key, min, max, step]. */
const SLIDERS: readonly (readonly [keyof KitShape, number, number, number])[] = [
  ['sleeveEnd', 0.1, 0.9, 0.01],
  ['longSleeveEnd', 0.7, 1.05, 0.01],
  ['cuff', 0, 0.15, 0.005],
  ['handStart', 0.85, 1.2, 0.01],
  ['waist', -0.1, 0.2, 0.005],
  ['shortsHem', 0.15, 0.6, 0.01],
  ['sockTop', 0.4, 0.85, 0.01],
  ['sockCuff', 0, 0.15, 0.005],
  ['bootTop', 0.8, 1.05, 0.005],
  ['trim', 0.3, 1, 0.01],
  ['collarWidth', 0, 0.08, 0.002],
  ['collarY', -0.1, 0.1, 0.002],
  ['vDepth', 0, 0.2, 0.005],
  ['neckRadius', 0.03, 0.25, 0.005],
  ['stripeWidth', 0.02, 0.15, 0.002],
  ['hoopWidth', 0.02, 0.15, 0.002],
  ['sashWidth', 0.04, 0.3, 0.005],
  ['checkSize', 0.03, 0.2, 0.002],
  ['printSize', 0.2, 0.6, 0.005],
  ['printY', -0.2, 0.2, 0.005],
  ['numberHeight', 0.08, 0.35, 0.005],
  ['numberY', -0.25, 0.2, 0.005],
  ['hairLine', 0, 0.25, 0.005],
  ['hairBack', -0.05, 0.2, 0.005],
  ['jointTint', 0.5, 1.2, 0.01],
];

const shapeSchema = z.object(
  Object.fromEntries(SLIDERS.map(([key, min, max]) => [key, z.number().min(min).max(max)])),
);

function loadShape(defaults: KitShape): KitShape {
  try {
    const raw = window.localStorage.getItem(SHAPE_KEY);
    if (!raw) return defaults;
    // A setting added since the last visit takes its default; the others are kept.
    const parsed = shapeSchema.partial().safeParse(JSON.parse(raw));
    return parsed.success ? { ...defaults, ...parsed.data } : defaults;
  } catch {
    return defaults;
  }
}

function storeShape(shape: KitShape | null): void {
  try {
    if (shape) window.localStorage.setItem(SHAPE_KEY, JSON.stringify(shape));
    else window.localStorage.removeItem(SHAPE_KEY);
  } catch {
    // Private mode: settings are not kept.
  }
}

const divisionOrder = (id: string): number => DIVISIONS.findIndex((d) => d.id === id);
const CLUBS: readonly Club[] = [...WORLD.clubs].sort(
  (a, b) =>
    divisionOrder(a.divisionId) - divisionOrder(b.divisionId) || a.name.localeCompare(b.name, 'fr'),
);

/** The club's three print textures (crest, sponsor, digits on each kit). */
async function buildPrints(
  render3d: typeof Render3D,
  club: Club,
): Promise<Record<KitName, HTMLCanvasElement>> {
  const css = await render3d.cardFontCss(CARD_FONT_FILES);
  const identity = identityOf(club);
  const sponsor = identity.sponsors[0]?.label;
  const print = (name: KitName, kit: KitSpec) =>
    rasterize(
      render3d,
      kitPrintNode(kit, {
        uid: `${club.id}-${name}-print`,
        crest: identity.crest,
        // As on the 2D kit: the goalkeeper's shirt has no sponsor.
        sponsor: name === 'keeper' ? undefined : sponsor,
      }),
      1024,
      css,
    );
  const [home, away, keeper] = await Promise.all(
    KITS.map((name) => print(name, identity.kits[name])),
  );
  return { home: home!, away: away!, keeper: keeper! };
}

export function KitsLab() {
  const t = useTranslations('lab.kits');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<KitViewerHandle | null>(null);
  const render3dRef = useRef<typeof Render3D | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [info, setInfo] = useState<KitViewerInfo | null>(null);
  const [clubId, setClubId] = useState(CLUBS[0]?.id ?? '');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [clip, setClip] = useState('player_idle');
  const [prints, setPrints] = useState<Record<KitName, HTMLCanvasElement> | null>(null);
  const [panel, setPanel] = useState(false);
  const [defaults, setDefaults] = useState<KitShape | null>(null);
  const [shape, setShape] = useState<KitShape | null>(null);

  const club = CLUBS.find((c) => c.id === clubId) ?? CLUBS[0]!;
  const squad = useMemo(
    () => [...generateSquad(club).players].sort((a, b) => a.number - b.number),
    [club],
  );
  const { outfield, player, keeper } = useMemo(() => {
    const field = squad.filter((p) => p.positions[0] !== 'GK');
    const chosen: Player = field.find((p) => p.id === playerId) ?? field[0] ?? squad[0]!;
    const gk: Player = squad.find((p) => p.positions[0] === 'GK') ?? chosen;
    return { outfield: field, player: chosen, keeper: gk };
  }, [squad, playerId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let handle: KitViewerHandle | null = null;
    import('@legendes/render3d')
      .then((render3d) => {
        if (cancelled) return;
        render3dRef.current = render3d;
        const initial = loadShape({ ...render3d.DEFAULT_KIT_SHAPE });
        setDefaults({ ...render3d.DEFAULT_KIT_SHAPE });
        setShape(initial);
        const query = new URLSearchParams(window.location.search);
        const asked = query.get('club');
        if (asked && CLUBS.some((c) => c.id === asked)) setClubId(asked);
        handle = render3d.mountKitViewer(canvas, {
          quality: render3d.qualityFromQuery(window.location.search) ?? 'auto',
          characterAssetsUrl:
            publicEnv.NEXT_PUBLIC_CHARACTER_ASSETS_URL ?? '/api/assets/characters/',
          mannequin: query.has('mannequin'),
        });
        handle.setShape(initial);
        handle.onReady((ready) => {
          if (!cancelled) setInfo(ready);
        });
        handleRef.current = handle;
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
  }, []);

  // Prints are drawn once per club.
  useEffect(() => {
    const render3d = render3dRef.current;
    if (state !== 'ready' || !render3d) return;
    let cancelled = false;
    setPrints(null);
    buildPrints(render3d, club)
      .then((built) => {
        if (!cancelled) setPrints(built);
      })
      .catch((error: unknown) => console.error(error));
    return () => {
      cancelled = true;
    };
  }, [club, state]);

  const looks = useMemo((): CharacterLook[] => {
    const kits = identityOf(club).kits;
    const look = (who: Player, name: KitName): CharacterLook => ({
      ...playerLook(who, kits[name], name === 'keeper'),
      prints: prints?.[name] ?? null,
    });
    return [look(player, 'home'), look(player, 'away'), look(keeper, 'keeper')];
  }, [club, player, keeper, prints]);

  useEffect(() => {
    if (state === 'ready') handleRef.current?.setLooks(looks);
  }, [looks, state]);

  const updateShape = (next: KitShape): void => {
    setShape(next);
    handleRef.current?.setShape(next);
    storeShape(next);
  };

  return (
    <div className="relative min-h-0 flex-1 select-none" data-state={state}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label={t('title')} />
      {state !== 'ready' && (
        <p
          className="absolute inset-0 grid place-items-center text-sm text-chalk-muted"
          role="status"
        >
          {state === 'failed' ? t('failed') : t('loading')}
        </p>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto flex max-w-full flex-wrap gap-2">
          <select
            aria-label={t('club')}
            value={club.id}
            onChange={(e) => {
              setClubId(e.target.value);
              setPlayerId(null);
            }}
            className="max-w-[16rem] rounded-md border border-chalk/20 bg-pitch-900/85 px-2 py-1.5 text-sm text-chalk backdrop-blur"
          >
            {DIVISIONS.map((d) => {
              const clubs = CLUBS.filter((c) => c.divisionId === d.id);
              return clubs.length === 0 ? null : (
                <optgroup key={d.id} label={d.name}>
                  {clubs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <select
            aria-label={t('player')}
            value={player.id}
            onChange={(e) => setPlayerId(e.target.value)}
            className="max-w-[14rem] rounded-md border border-chalk/20 bg-pitch-900/85 px-2 py-1.5 text-sm text-chalk backdrop-blur"
          >
            {outfield.map((p) => (
              <option key={p.id} value={p.id}>
                {p.number} · {p.displayName}
              </option>
            ))}
          </select>
          {info && info.clips.length > 1 && (
            <select
              aria-label={t('clip')}
              value={clip}
              onChange={(e) => {
                setClip(e.target.value);
                handleRef.current?.setClip(e.target.value);
              }}
              className="max-w-[12rem] rounded-md border border-chalk/20 bg-pitch-900/85 px-2 py-1.5 text-sm text-chalk backdrop-blur"
            >
              {info.clips.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button
            type="button"
            onClick={() => handleRef.current?.turnTo(0)}
            className="rounded-md bg-chalk/15 px-3 py-1.5 text-sm font-semibold text-chalk backdrop-blur hover:bg-chalk/25"
          >
            {t('front')}
          </button>
          <button
            type="button"
            onClick={() => handleRef.current?.turnTo(Math.PI)}
            className="rounded-md bg-chalk/15 px-3 py-1.5 text-sm font-semibold text-chalk backdrop-blur hover:bg-chalk/25"
          >
            {t('back')}
          </button>
          <button
            type="button"
            aria-expanded={panel}
            onClick={() => setPanel(!panel)}
            className="rounded-md bg-chalk/15 px-3 py-1.5 text-sm font-semibold text-chalk backdrop-blur hover:bg-chalk/25"
          >
            {t('tuningToggle')}
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-6 p-4 text-center text-xs text-chalk-muted sm:text-sm">
        {KITS.map((name) => (
          <span key={name} className="w-24">
            {t(`kitNames.${name}`)}
          </span>
        ))}
      </div>
      {info && !info.real && (
        <p
          className="absolute bottom-12 left-1/2 w-max max-w-[90%] -translate-x-1/2 rounded-md bg-pitch-900/80 px-3 py-1 text-center text-xs text-floodlight-300"
          role="note"
        >
          {t('mannequin')}
        </p>
      )}

      {panel && shape && defaults && (
        <div className="absolute top-14 right-3 bottom-3 w-72 overflow-y-auto rounded-lg border border-chalk/15 bg-pitch-950/90 p-3 text-xs text-chalk backdrop-blur">
          {SLIDERS.map(([key, min, max, step]) => (
            <label key={key} className="mb-2 block">
              <span className="flex justify-between">
                <span>{t(`tuning.${key}`)}</span>
                <span className="text-chalk-muted tabular-nums">{shape[key]}</span>
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={shape[key]}
                onChange={(e) => updateShape({ ...shape, [key]: Number(e.target.value) })}
                className="w-full accent-floodlight-400"
              />
            </label>
          ))}
          <button
            type="button"
            onClick={() => {
              updateShape(defaults);
              storeShape(null);
            }}
            className="mt-2 w-full rounded-md bg-chalk/15 px-3 py-1.5 font-semibold hover:bg-chalk/25"
          >
            {t('tuning.reset')}
          </button>
        </div>
      )}
    </div>
  );
}
