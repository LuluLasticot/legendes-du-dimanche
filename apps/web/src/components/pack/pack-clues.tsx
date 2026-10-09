'use client';

import { getDivision, type PackCard } from '@legendes/data';
import type { PackStep } from '@legendes/render3d';
import { useTranslations } from 'next-intl';

/** The clues of the best card's walkout, over the scene: championship, club, then position. */
export function PackClues({ step, best }: { step: PackStep; best: PackCard | undefined }) {
  const tPos = useTranslations('positions');
  const player = best?.card.player;
  const division = best ? getDivision(best.club.divisionId) : undefined;
  return (
    <div
      className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center"
      aria-live="polite"
    >
      {step === 'league' && division && (
        <p
          key="league"
          className="font-display ld-slam text-5xl tracking-wide text-chalk drop-shadow-[0_4px_24px_rgb(0_0_0/0.8)] sm:text-7xl"
        >
          {division.name}
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
      {step === 'position' && player && (
        <p
          key="position"
          className="font-display ld-slam text-5xl text-floodlight-300 drop-shadow-[0_4px_24px_rgb(0_0_0/0.8)] sm:text-7xl"
        >
          {tPos(`${player.positions[0] ?? 'CM'}.long`)}
        </p>
      )}
    </div>
  );
}

/** Under the best card once it has landed: its promo, its player, his rating, post and club. */
export function PackHeroCaption({ best, next }: { best: PackCard; next: string }) {
  const tPos = useTranslations('positions');
  const tCards = useTranslations('cards');
  const player = best.card.player;
  return (
    <div className="ld-rise">
      {best.card.variant !== 'base' && (
        <p className="text-xs font-bold tracking-[0.2em] text-floodlight-400 uppercase">
          {tCards(`variants.${best.card.variant}`)}
        </p>
      )}
      <p className="font-display text-3xl text-chalk">{player.displayName}</p>
      <p className="text-sm text-chalk-muted">
        {player.rating} · {tPos(`${player.positions[0] ?? 'CM'}.long`)} · {best.club.name}
      </p>
      <p className="mt-2 text-xs text-chalk-faint">{next}</p>
    </div>
  );
}
