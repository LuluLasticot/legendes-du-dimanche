'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { startAsGuest } from '@/app/jouer/actions';
import { browserClient } from '@/lib/supabase/browser';
import type { GameErrorCode } from '@/server/game/errors';

/** "Commencer": an anonymous account made by the browser, then the welcome credits. */
export function StartButton() {
  const t = useTranslations('game');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<GameErrorCode | null>(null);

  const start = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const db = browserClient();
      const { data } = await db.auth.getSession();
      if (!data.session) {
        const signIn = await db.auth.signInAnonymously();
        if (signIn.error) throw signIn.error;
      }
      const result = await startAsGuest();
      setError(result.error);
    } catch (e) {
      console.error(e);
      setError('unexpected');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 md:items-start">
      <button
        type="button"
        onClick={() => void start()}
        disabled={pending}
        className="rounded-md bg-floodlight-400 px-6 py-3 font-display text-2xl leading-none font-extrabold tracking-wide text-pitch-950 uppercase shadow-floodlight hover:bg-floodlight-300 disabled:opacity-60"
      >
        {t('welcome.start')}
      </button>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {t(`errors.${error}`)}
        </p>
      )}
    </div>
  );
}
