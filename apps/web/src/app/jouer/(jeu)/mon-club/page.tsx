import { cardClassOf, cardValue, divisionLabel, getClub, getDivision } from '@legendes/data';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { PlayerCard } from '@/components/card/player-card';
import { Crest } from '@/components/club/crest';
import { cardsOf } from '@/server/game/collection';
import { STAGE_PATH } from '@/server/game/stage';
import { requireStage } from '../../current';

/** The filters of the collection, in French in the URL. */
const FILTERS = { bronze: 'bronze', argent: 'silver', or: 'gold' } as const;
const query = z.object({
  classe: z.enum(['bronze', 'argent', 'or']).optional().catch(undefined),
});

export default async function MyClubPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const player = await requireStage('playing');
  const club = getClub(player.clubId ?? '');
  if (!club) redirect(STAGE_PATH.club);
  const { classe } = query.parse(await searchParams);
  const t = await getTranslations('game.collection');
  const division = getDivision(club.divisionId);

  // One tile per card, its copies counted; the most valuable first.
  const copies = new Map<string, { card: ReturnType<typeof cardsOf>[number]; count: number }>();
  for (const c of cardsOf(player.cardIds)) {
    const seen = copies.get(c.card.id);
    copies.set(c.card.id, { card: c, count: (seen?.count ?? 0) + 1 });
  }
  const all = [...copies.values()].sort((a, b) => cardValue(b.card.card) - cardValue(a.card.card));
  const tier = classe ? FILTERS[classe] : null;
  const shown = tier ? all.filter((c) => cardClassOf(c.card.card).startsWith(tier)) : all;

  const tab = (label: string, value: keyof typeof FILTERS | null) => (
    <Link
      key={label}
      href={value ? `/jouer/mon-club?classe=${value}` : '/jouer/mon-club'}
      aria-current={classe === (value ?? undefined) ? 'true' : undefined}
      className={`rounded-md px-3 py-1.5 text-sm font-bold ring-1 ${
        classe === (value ?? undefined)
          ? 'bg-floodlight-400 text-pitch-950 ring-floodlight-400'
          : 'bg-pitch-800 text-chalk-muted ring-chalk/10 hover:text-chalk'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-4">
        <Crest club={club} className="h-20 w-16 shrink-0" />
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-floodlight-400 uppercase">
            {division ? divisionLabel(division) : ''}
          </p>
          <h1 className="font-display text-4xl leading-none font-extrabold text-chalk uppercase">
            {club.name}
          </h1>
          <p className="text-sm text-chalk-muted">{t('count', { count: player.cardIds.length })}</p>
        </div>
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-extrabold text-chalk uppercase">
            {t('title')}
          </h2>
          <nav className="flex flex-wrap gap-1.5">
            {tab(t('all'), null)}
            {tab(t('bronze'), 'bronze')}
            {tab(t('silver'), 'argent')}
            {tab(t('gold'), 'or')}
          </nav>
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-chalk-muted">{t('empty')}</p>
        ) : (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {shown.map(({ card, count }) => (
              <li key={card.card.id} className="relative">
                <PlayerCard card={card.card} club={card.club} className="w-full" />
                {count > 1 && (
                  <span className="absolute top-1 right-1 rounded-pill bg-floodlight-400 px-1.5 text-xs font-black text-pitch-950">
                    {t('copies', { count })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
