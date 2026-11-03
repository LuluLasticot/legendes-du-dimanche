'use client';

import { getClub, identityOf } from '@legendes/data';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { pickClub } from '@/app/jouer/actions';
import { Crest } from '@/components/club/crest';
import { Kit } from '@/components/club/kit';

export interface ClubChoice {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  /** "N2", "R1", "D5"… */
  readonly division: string;
  readonly order: number;
}

/** "Saint-Amand" and "saint amand" match: case, accents and dashes ignored. */
const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[-'’]/g, ' ')
    .toLowerCase();

function ConfirmButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-floodlight-400 px-5 py-3 font-display text-xl leading-none font-extrabold tracking-wide text-pitch-950 uppercase shadow-floodlight hover:bg-floodlight-300 disabled:opacity-60"
    >
      {label}
    </button>
  );
}

export function ClubPicker({ clubs }: { clubs: readonly ClubChoice[] }) {
  const t = useTranslations('game.welcome');
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);

  const groups = useMemo(() => {
    const q = fold(query.trim());
    const out = new Map<string, ClubChoice[]>();
    for (const c of clubs) {
      if (q && !fold(`${c.name} ${c.city}`).includes(q)) continue;
      out.set(c.division, [...(out.get(c.division) ?? []), c]);
    }
    return [...out.entries()];
  }, [clubs, query]);

  const club = chosen ? getClub(chosen) : undefined;
  const identity = club ? identityOf(club) : undefined;

  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search')}
          aria-label={t('search')}
          className="w-full rounded-md border border-chalk/15 bg-pitch-900/80 px-4 py-3 text-chalk placeholder:text-chalk-faint focus:border-floodlight-400 focus:outline-none"
        />
        {groups.length === 0 && <p className="text-sm text-chalk-muted">{t('noMatch')}</p>}
        {groups.map(([division, list]) => (
          <section key={division} aria-label={division}>
            <h2 className="mb-2 text-xs font-bold tracking-[0.18em] text-floodlight-400 uppercase">
              {division}
            </h2>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((c) => {
                const full = getClub(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setChosen(c.id)}
                      aria-pressed={chosen === c.id}
                      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left ring-1 transition ${
                        chosen === c.id
                          ? 'bg-floodlight-400/12 ring-floodlight-400'
                          : 'bg-pitch-900/80 ring-chalk/10 hover:ring-floodlight-400/60'
                      }`}
                    >
                      {full && <Crest club={full} className="h-10 w-8 shrink-0" />}
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-chalk">{c.name}</span>
                        <span className="block truncate text-xs text-chalk-faint">{c.city}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {club && identity && (
        <aside className="fixed inset-x-0 bottom-0 z-20 rounded-t-lg border-t border-floodlight-400/30 bg-pitch-900/95 p-4 shadow-card backdrop-blur md:sticky md:top-6 md:w-80 md:rounded-lg md:border md:p-5">
          <div className="flex items-center gap-4 md:flex-col md:text-center">
            <div className="relative h-24 w-20 shrink-0 md:h-48 md:w-40">
              <Kit
                kit={identity.kits.home}
                uid={`pick-${club.id}`}
                crest={identity.crest}
                sponsor={identity.sponsors[0]?.label}
                full
                className="absolute inset-0 m-auto h-full opacity-40"
              />
              <Crest
                club={club}
                className="absolute inset-x-0 bottom-0 mx-auto h-16 w-14 drop-shadow-[0_8px_14px_rgb(0_0_0/0.7)] md:h-24 md:w-20"
              />
            </div>
            <div className="min-w-0">
              <p className="font-display text-2xl leading-tight font-extrabold text-chalk uppercase">
                {club.name}
              </p>
              <p className="text-sm text-chalk-muted">
                {club.city} · {club.stadium.name}
              </p>
            </div>
          </div>
          <form action={pickClub} className="mt-4 flex flex-col gap-2">
            <input type="hidden" name="clubId" value={club.id} />
            <ConfirmButton label={t('confirm', { club: club.shortName })} />
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold tracking-widest text-chalk-faint uppercase">
                {t('final')}
              </span>
              <button
                type="button"
                onClick={() => setChosen(null)}
                className="text-chalk-muted underline-offset-2 hover:underline"
              >
                {t('cancel')}
              </button>
            </div>
          </form>
        </aside>
      )}
    </div>
  );
}
