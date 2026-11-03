'use client';

import { findCard, type PackCard } from '@legendes/data';
import { useTranslations } from 'next-intl';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PackArtType } from '@legendes/ui/card';
import type { StarterResult } from '@/app/jouer/actions';
import { PackOpening } from './pack-opening';
import type { GameErrorCode } from '@/server/game/errors';

/**
 * Asks the server to open a pack (its id is the request id: asking again gives the same cards),
 * then plays the opening in the 3D scene.
 */
export function PackReveal({
  type,
  open,
  next,
}: {
  type: PackArtType;
  /** A Server Action, bound to the pack. */
  open: () => Promise<StarterResult>;
  next: Route;
}) {
  const t = useTranslations('game');
  const router = useRouter();
  const [cards, setCards] = useState<readonly PackCard[] | null>(null);
  const [error, setError] = useState<GameErrorCode | null>(null);
  const asked = useRef(false);

  const ask = useCallback(async (): Promise<void> => {
    setError(null);
    const result = await open();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const found = result.cardIds.flatMap((id) => {
      const card = findCard(id);
      if (!card) console.error(`Unknown card ${id}`);
      return card ? [card] : [];
    });
    setCards(found);
  }, [open]);

  useEffect(() => {
    // Once per visit (strict mode mounts twice); asking again is harmless but useless.
    if (asked.current) return;
    asked.current = true;
    void ask();
  }, [ask]);

  if (error) {
    return (
      <div className="grid flex-1 place-items-center p-6 text-center" role="alert">
        <div className="flex flex-col items-center gap-4">
          <p className="text-chalk">{t(`errors.${error}`)}</p>
          <button
            type="button"
            onClick={() => void ask()}
            className="rounded-md bg-floodlight-400 px-5 py-2 font-display text-lg font-extrabold text-pitch-950 uppercase hover:bg-floodlight-300"
          >
            {t('errors.retry')}
          </button>
        </div>
      </div>
    );
  }
  if (!cards) return <div className="flex-1" aria-busy />;
  return (
    <div className="relative flex min-h-[70dvh] flex-1 flex-col">
      <PackOpening type={type} cards={cards} onDone={() => router.push(next)} />
    </div>
  );
}
