'use client';

import { useTranslations } from 'next-intl';
import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import { startAsGuest } from '@/app/jouer/actions';
import { publicEnv } from '@/env';
import { browserClient } from '@/lib/supabase/browser';
import type { GameErrorCode } from '@/server/game/errors';

const SITE_KEY = publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

interface Turnstile {
  render(el: HTMLElement, options: { sitekey: string; callback: (token: string) => void }): string;
  reset(id?: string): void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

/**
 * "Commencer": an anonymous account made by the browser (Supabase sees the visitor's address),
 * behind a Cloudflare Turnstile captcha when its site key is set, then the welcome credits.
 */
export function StartButton() {
  const t = useTranslations('game');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<GameErrorCode | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY || !scriptReady || !box.current || !window.turnstile || widget.current) return;
    widget.current = window.turnstile.render(box.current, {
      sitekey: SITE_KEY,
      callback: setToken,
    });
  }, [scriptReady]);

  const start = useCallback(async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const db = browserClient();
      const { data } = await db.auth.getSession();
      if (!data.session) {
        const signIn = await db.auth.signInAnonymously({
          options: token ? { captchaToken: token } : undefined,
        });
        if (signIn.error) throw signIn.error;
      }
      const result = await startAsGuest();
      setError(result.error);
    } catch (e) {
      console.error(e);
      setError('unexpected');
      // A captcha token is good once: ask for a new one.
      window.turnstile?.reset(widget.current ?? undefined);
      setToken(null);
    } finally {
      setPending(false);
    }
  }, [token]);

  const waiting = Boolean(SITE_KEY) && !token;
  return (
    <div className="flex flex-col items-center gap-2 md:items-start">
      {SITE_KEY && (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            onReady={() => setScriptReady(true)}
          />
          <div ref={box} />
        </>
      )}
      <button
        type="button"
        onClick={() => void start()}
        disabled={pending || waiting}
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
