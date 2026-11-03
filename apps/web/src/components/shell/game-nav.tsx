'use client';

import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from './icons';

export type GameTab = 'home' | 'solo' | 'online' | 'squads' | 'transfers' | 'store' | 'club';

export const GAME_TABS: readonly { id: GameTab; href: Route; icon: IconName }[] = [
  { id: 'home', href: '/jouer', icon: 'home' },
  { id: 'solo', href: '/jouer/solo', icon: 'solo' },
  { id: 'online', href: '/jouer/en-ligne', icon: 'online' },
  { id: 'squads', href: '/jouer/equipes', icon: 'squads' },
  { id: 'transfers', href: '/jouer/transferts', icon: 'transfers' },
  { id: 'store', href: '/jouer/boutique', icon: 'store' },
  { id: 'club', href: '/jouer/mon-club', icon: 'club' },
];
/** On a phone: five tabs in the bottom bar, the others behind "Plus". */
const MOBILE_TABS: readonly GameTab[] = ['home', 'solo', 'squads', 'store', 'club'];

const isActive = (pathname: string, href: string): boolean =>
  href === '/jouer' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

/** The seven tabs across the top, on a computer. */
export function DesktopTabs() {
  const t = useTranslations('game');
  const pathname = usePathname();
  return (
    <nav className="mx-auto hidden max-w-7xl px-6 md:block" aria-label={t('nav')}>
      <ul className="flex gap-1">
        {GAME_TABS.map(({ id, href }) => {
          const current = isActive(pathname, href);
          return (
            <li key={id}>
              <Link
                href={href}
                aria-current={current ? 'page' : undefined}
                className={`relative block px-4 pt-2 pb-3 font-display text-lg font-extrabold tracking-wider uppercase transition-colors ${
                  current ? 'text-chalk' : 'text-chalk-faint hover:text-chalk-muted'
                }`}
              >
                {t(`tabs.${id}`)}
                {current && (
                  <span className="absolute inset-x-3 bottom-0 h-1 rounded-t-sm bg-floodlight-400 shadow-floodlight" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The bottom bar on a phone: five tabs, and "Plus" for the two others. */
export function MobileTabs() {
  const t = useTranslations('game');
  const pathname = usePathname();
  const tabs = GAME_TABS.filter((tab) => MOBILE_TABS.includes(tab.id));
  const more = GAME_TABS.filter((tab) => !MOBILE_TABS.includes(tab.id));
  const moreActive = more.some((tab) => isActive(pathname, tab.href));
  const item = (current: boolean): string =>
    `flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold tracking-wide uppercase ${
      current ? 'text-floodlight-400' : 'text-chalk-faint'
    }`;
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-chalk/10 bg-pitch-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label={t('nav')}
    >
      <ul className="grid grid-cols-6">
        {tabs.map(({ id, href, icon }) => {
          const current = isActive(pathname, href);
          return (
            <li key={id}>
              <Link
                href={href}
                aria-current={current ? 'page' : undefined}
                className={item(current)}
              >
                <Icon name={icon} className="size-6" />
                {t(`tabs.${id}`)}
              </Link>
            </li>
          );
        })}
        <li>
          <details className="group relative" key={pathname}>
            <summary className={`${item(moreActive)} cursor-pointer list-none`}>
              <Icon name="more" className="size-6" />
              {t('tabs.more')}
            </summary>
            <ul className="absolute right-2 bottom-full mb-2 w-44 overflow-hidden rounded-md bg-pitch-900 shadow-card ring-1 ring-chalk/15">
              {more.map(({ id, href, icon }) => (
                <li key={id}>
                  <Link
                    href={href}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-chalk uppercase hover:bg-chalk/5"
                  >
                    <Icon name={icon} className="size-5 text-chalk-muted" />
                    {t(`tabs.${id}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </li>
      </ul>
    </nav>
  );
}
