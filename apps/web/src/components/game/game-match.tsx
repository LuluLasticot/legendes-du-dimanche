'use client';

import type { sim } from '@legendes/engine';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { finishMyMatch, startMyMatch } from '@/app/jouer/game-actions';
import { MatchScreen, type PlayedMatch } from '@/components/match/match-screen';
import { TileButton } from '@/components/shell/tile';
import type { GameErrorCode } from '@/server/game/errors';
import type { MatchVerdict } from '@/server/game/matches';

type Started = { matchId: string; setup: sim.MatchSetup };

/** Asks the server for the match, plays it, hands the inputs back and shows the verdict. */
export function GameMatch() {
  const t = useTranslations('game');
  const [match, setMatch] = useState<Started | null>(null);
  const [verdict, setVerdict] = useState<MatchVerdict | null>(null);
  const [error, setError] = useState<GameErrorCode | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void startMyMatch().then((r) => (r.ok ? setMatch(r) : setError(r.error)));
  }, []);

  const onFullTime = (played: PlayedMatch): void => {
    if (!match) return;
    void finishMyMatch(match.matchId, played).then((r) =>
      r.ok ? setVerdict(r.verdict) : setError(r.error),
    );
  };

  const back = (
    <Link href="/jouer">
      <TileButton>{t('match.back')}</TileButton>
    </Link>
  );

  if (error && !match) {
    return (
      <div className="grid flex-1 place-items-center gap-4 p-6 text-center" role="alert">
        <p className="text-chalk">{t(`errors.${error}`)}</p>
        {back}
      </div>
    );
  }
  if (!match) return <div className="flex-1" aria-busy />;

  const fullTime = (
    <section
      className="flex w-full max-w-sm flex-col items-center gap-4 rounded-lg bg-pitch-900/95 p-6 text-center shadow-card ring-1 ring-floodlight-400/40"
      role="status"
    >
      {error ? (
        <p className="text-chalk">{t(`errors.${error}`)}</p>
      ) : !verdict ? (
        <p className="text-chalk-muted">{t('match.checking')}</p>
      ) : verdict.status === 'validated' ? (
        <>
          <p className="text-xs font-bold tracking-[0.18em] text-floodlight-400 uppercase">
            {t('match.validated')}
          </p>
          <p className="font-display text-5xl leading-none font-black text-chalk">
            {verdict.score?.[0]} – {verdict.score?.[1]}
          </p>
          <p className="font-display text-3xl font-extrabold text-floodlight-300">
            {t('match.reward', { value: verdict.reward })}
          </p>
        </>
      ) : (
        <p className="text-chalk">{t('errors.match_rejected')}</p>
      )}
      {(verdict || error) && back}
    </section>
  );

  return (
    <MatchScreen
      game={{
        setup: match.setup,
        onFullTime,
        fullTime,
        kickOffLabel: t('match.kickOff'),
      }}
    />
  );
}
