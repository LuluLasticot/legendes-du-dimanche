import type { Club } from '@legendes/data';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Crest } from '@/components/club/crest';
import { DesktopTabs, MobileTabs } from './game-nav';
import { Icon } from './icons';
import { NightBackdrop } from './night-backdrop';

export interface ShellPlayer {
  readonly club: Club;
  readonly credits: number;
  readonly record: { readonly wins: number; readonly draws: number; readonly losses: number };
  readonly level: number;
  readonly xp: number;
  readonly nextLevelXp: number;
  readonly packsWaiting: number;
}

const number = new Intl.NumberFormat('fr-FR');

/** The game's frame: the club bar, the tabs (top on a computer, bottom on a phone), the page. */
export async function GameShell({
  player,
  children,
}: {
  player: ShellPlayer;
  children: ReactNode;
}) {
  const t = await getTranslations('game');
  const { club } = player;
  const xpShare = Math.min(1, player.xp / player.nextLevelXp);

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-pitch-950 pb-24 md:pb-10">
      <NightBackdrop />

      <header className="relative z-10 border-b border-chalk/8 bg-pitch-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:gap-5 sm:px-6">
          <Crest club={club} className="h-11 w-9 shrink-0 sm:h-14 sm:w-12" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl leading-tight font-extrabold tracking-wide text-chalk uppercase sm:text-2xl">
              {club.shortName}
            </p>
            {club.founded !== null && (
              <p className="text-xs text-chalk-faint">{t('bar.founded', { year: club.founded })}</p>
            )}
          </div>

          <dl className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 rounded-pill bg-pitch-800/80 px-3 py-1.5 ring-1 ring-floodlight-400/30">
              <dt className="sr-only">{t('bar.credits')}</dt>
              <Icon name="credits" className="size-4 text-floodlight-400" />
              <dd className="font-display text-lg leading-none font-extrabold text-floodlight-300 tabular-nums">
                {t('bar.creditsValue', { value: number.format(player.credits) })}
              </dd>
            </div>
            <div className="hidden items-center gap-1.5 rounded-pill bg-pitch-800/80 px-3 py-1.5 ring-1 ring-chalk/10 sm:flex">
              <dt className="sr-only">{t('bar.record')}</dt>
              <Icon name="record" className="size-4 text-chalk-muted" />
              <dd className="text-sm font-bold text-chalk tabular-nums">
                {t('bar.recordValue', player.record)}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="sr-only">
                {t('bar.xp', { xp: player.xp, next: player.nextLevelXp })}
              </dt>
              <dd className="flex items-center gap-2">
                <span className="font-display text-lg leading-none font-extrabold text-chalk">
                  {t('bar.level', { level: player.level })}
                </span>
                <span className="hidden h-1.5 w-20 overflow-hidden rounded-pill bg-pitch-700 sm:block">
                  <span
                    className="block h-full rounded-pill bg-gradient-to-r from-floodlight-500 to-floodlight-300"
                    style={{ width: `${xpShare * 100}%` }}
                  />
                </span>
              </dd>
            </div>
          </dl>

          <Link
            href="/jouer/boutique"
            className="relative hidden size-10 place-items-center rounded-full bg-pitch-800/80 text-chalk ring-1 ring-chalk/10 hover:ring-floodlight-400/60 md:grid"
            aria-label={`${t('bar.store')} · ${t('bar.packsWaiting', { count: player.packsWaiting })}`}
          >
            <Icon name="store" className="size-5" />
            {player.packsWaiting > 0 && (
              <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-floodlight-400 text-[11px] font-black text-pitch-950">
                {player.packsWaiting}
              </span>
            )}
          </Link>
        </div>

        <DesktopTabs />
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 pt-5 sm:px-6 md:pt-8">{children}</main>

      <MobileTabs />
    </div>
  );
}
