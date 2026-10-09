'use client';

import { useTranslations } from 'next-intl';

/** Something failed while drawing a game page: a plain message and a way to try again. */
export default function GameError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('game.errors');
  return (
    <main className="grid min-h-dvh place-items-center bg-pitch-950 p-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <p className="text-chalk">{t('unexpected')}</p>
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-floodlight-400 px-5 py-2 font-display text-lg font-extrabold text-pitch-950 uppercase hover:bg-floodlight-300"
        >
          {t('retry')}
        </button>
      </div>
    </main>
  );
}
