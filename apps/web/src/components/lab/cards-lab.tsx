'use client';

import {
  cardOf,
  cardVariantsOf,
  DIVISIONS,
  foldText,
  generateSquad,
  WORLD,
  type Card,
  type CardVariant,
  type Club,
} from '@legendes/data';
import {
  CARD_LOOKS,
  DEFAULT_CARD_TUNING,
  lookOf,
  type CardLook,
  type CardTuning,
} from '@legendes/ui/card';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CardViewer3D } from '@/components/card/card-viewer-3d';
import { PlayerCard } from '@/components/card/player-card';

interface Entry {
  readonly card: Card;
  readonly club: Club;
}

const divisionOrder = (id: string): number => DIVISIONS.findIndex((d) => d.id === id);

let pilot: readonly Entry[] | null = null;
/** Every base card of the pilot, top divisions first (generated once, about 20 ms). */
function pilotCards(): readonly Entry[] {
  pilot ??= [...WORLD.clubs]
    .sort(
      (a, b) =>
        divisionOrder(a.divisionId) - divisionOrder(b.divisionId) || a.id.localeCompare(b.id),
    )
    .flatMap((club) =>
      generateSquad(club)
        .players.slice()
        .sort((a, b) => b.rating - a.rating)
        .map((p) => ({ card: cardOf(p), club })),
    );
  return pilot;
}

/** One real card of the pilot for each template: the best player that wears it. */
function showcase(): readonly (Entry & { look: CardLook })[] {
  const cards = pilotCards();
  const special = (variant: CardVariant, from: readonly Entry[]): Entry | undefined => {
    const found = from.find((e) =>
      variant === 'former-pro' ? e.card.player.traits.includes('former-pro') : true,
    );
    return found && { card: cardOf(found.card.player, variant), club: found.club };
  };
  const district = cards.filter((e) => e.club.districtId === 'escaut' && e.card.tier === 'bronze');
  return CARD_LOOKS.flatMap((look) => {
    const entry =
      look === 'weekend'
        ? special('weekend', district)
        : look === 'former-pro'
          ? special('former-pro', cards)
          : cards.find((e) => lookOf(e.card.tier, e.card.rarity, e.card.variant) === look);
    return entry ? [{ ...entry, look }] : [];
  });
}

const SLIDERS: readonly (readonly [keyof CardTuning, number, number, number])[] = [
  ['frame', 4, 14, 0.5],
  ['mesh', 0, 0.3, 0.01],
  ['sheen', 0, 2, 0.05],
  ['clubBand', 0, 0.8, 0.02],
  ['grain', 0, 0.4, 0.01],
];

export function CardsLab() {
  const t = useTranslations('lab.cards');
  const tVariants = useTranslations('cards.variants');
  const [tuning, setTuning] = useState<CardTuning>(DEFAULT_CARD_TUNING);
  const [query, setQuery] = useState('');
  const [variant, setVariant] = useState<CardVariant>('base');
  const templates = useMemo(() => showcase(), []);
  const [open, setOpen] = useState<Entry | null>(null);

  const results = useMemo(() => {
    const q = foldText(query);
    if (q.length < 2) return [];
    return pilotCards()
      .filter((e) =>
        foldText(
          `${e.card.player.firstName} ${e.card.player.lastName} ${e.club.name} ${e.club.city}`,
        ).includes(q),
      )
      .slice(0, 12)
      .map((e) =>
        // A player without the variant (Ancien pro) shows his base card.
        cardVariantsOf(e.card.player).includes(variant)
          ? { ...e, card: cardOf(e.card.player, variant) }
          : e,
      );
  }, [query, variant]);

  const changed = JSON.stringify(tuning) !== JSON.stringify(DEFAULT_CARD_TUNING);

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_16rem]">
      <div>
        <section>
          <h2 className="font-display text-2xl text-chalk">{t('templates')}</h2>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-4">
            {templates.map(({ card, club, look }) => (
              <li key={look} className="flex flex-col items-center gap-2">
                <CardButton entry={{ card, club }} onOpen={setOpen}>
                  <PlayerCard
                    card={card}
                    club={club}
                    tuning={tuning}
                    className="w-full drop-shadow-[0_14px_18px_rgb(0_0_0/0.55)] transition duration-300 group-hover:-translate-y-1 group-hover:scale-[1.03]"
                  />
                </CardButton>
                <p className="text-center text-xs text-chalk-muted">
                  {t(`looks.${look}`)} · {club.shortName}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-2xl text-chalk">{t('search.title')}</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search.placeholder')}
              aria-label={t('search.placeholder')}
              className="min-w-0 flex-1 rounded-md border border-chalk/15 bg-pitch-900 px-3 py-2 text-sm text-chalk placeholder:text-chalk-faint focus:border-floodlight-400 focus:outline-none"
            />
            <select
              value={variant}
              onChange={(e) => setVariant(e.target.value as CardVariant)}
              aria-label={t('search.variant')}
              className="rounded-md border border-chalk/15 bg-pitch-900 px-3 py-2 text-sm text-chalk"
            >
              {(['base', 'weekend', 'former-pro'] as const).map((v) => (
                <option key={v} value={v}>
                  {tVariants(v)}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-2 text-xs text-chalk-faint" role="status">
            {query.length < 2 ? t('search.hint') : t('search.count', { count: results.length })}
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {results.map(({ card, club }) => (
              <li key={card.id}>
                <CardButton entry={{ card, club }} onOpen={setOpen}>
                  <PlayerCard
                    card={card}
                    club={club}
                    tuning={tuning}
                    className="w-full drop-shadow-[0_10px_14px_rgb(0_0_0/0.5)]"
                  />
                </CardButton>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside className="h-fit rounded-xl border border-chalk/10 bg-pitch-900/70 p-4 lg:sticky lg:top-4">
        <h2 className="font-display text-xl text-chalk">{t('tuning.title')}</h2>
        <div className="mt-3 space-y-3">
          {SLIDERS.map(([key, min, max, step]) => (
            <label key={key} className="block text-xs text-chalk-muted">
              <span className="flex justify-between">
                {t(`tuning.${key}`)}
                <span className="text-chalk tabular-nums">{tuning[key]}</span>
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={tuning[key]}
                onChange={(e) => setTuning({ ...tuning, [key]: Number(e.target.value) })}
                className="mt-1 w-full accent-floodlight-400"
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={!changed}
          onClick={() => setTuning(DEFAULT_CARD_TUNING)}
          className="mt-4 rounded-md border border-chalk/20 px-3 py-1.5 text-sm text-chalk-muted enabled:hover:border-floodlight-400 enabled:hover:text-floodlight-300 disabled:opacity-40"
        >
          {t('tuning.reset')}
        </button>
      </aside>
      {open && <ViewerDialog entry={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function CardButton({
  entry,
  onOpen,
  children,
}: {
  entry: Entry;
  onOpen: (entry: Entry) => void;
  children: React.ReactNode;
}) {
  const t = useTranslations('lab.cards.viewer');
  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      aria-label={t('open', {
        label: `${entry.card.player.displayName} ${entry.card.player.rating}`,
      })}
      className="group block w-full max-w-[220px] cursor-zoom-in rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-floodlight-400"
    >
      {children}
    </button>
  );
}

function ViewerDialog({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const t = useTranslations('lab.cards.viewer');
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={t('title')}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-pitch-950/95 p-4 text-chalk backdrop:bg-black/70"
    >
      <div className="mx-auto flex h-full max-w-3xl flex-col">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">{t('title')}</h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="rounded-md border border-chalk/20 px-3 py-1.5 text-sm hover:border-floodlight-400"
          >
            {t('close')}
          </button>
        </div>
        <div className="min-h-0 flex-1 py-3">
          <CardViewer3D card={entry.card} club={entry.club} />
        </div>
      </div>
    </dialog>
  );
}
