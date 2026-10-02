import { cardVariantsOf, divisionLabel, findCard, getDivision } from '@legendes/data';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CardShowcase } from '@/components/card/card-showcase';
import { Crest } from '@/components/club/crest';
import { PublicHeader } from '@/components/share/public-header';
import { ShareButtons } from '@/components/share/share-buttons';
import { cardShare } from '@/lib/share/labels';

type Props = { params: Promise<{ id: string }> };

// Every card can be drawn from its id: pages are rendered on the first visit, then cached.
export function generateStaticParams(): { id: string }[] {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = findCard((await params).id);
  if (!found) return {};
  const { title, description } = await cardShare(found.card, found.club);
  return {
    title,
    description,
    openGraph: { title, description, type: 'website', locale: 'fr_FR' },
    twitter: { card: 'summary_large_image', title, description },
    // Public, but not indexed before the launch (the pilot's data are still being checked).
    robots: { index: false, follow: true },
  };
}

export default async function CardPage({ params }: Props) {
  const { id } = await params;
  const found = findCard(id);
  if (!found) notFound();
  const { card, club } = found;
  const { player } = card;
  const t = await getTranslations('cardPage');
  const tPos = await getTranslations('positions');
  const tTraits = await getTranslations('traits');
  const tCards = await getTranslations('cards');
  const tShare = await getTranslations('share');
  const share = await cardShare(card, club);
  const division = getDivision(club.divisionId);
  const base = id.split('~')[0] ?? id;
  // The versions of the card, from the player as he is (without a promo's boost).
  const variants = cardVariantsOf(findCard(base)?.card.player ?? player);

  return (
    <>
      <PublicHeader />
      <main className="mx-auto grid max-w-5xl items-start gap-10 px-5 py-8 sm:px-8 md:grid-cols-[minmax(0,22rem)_1fr] md:py-12">
        <CardShowcase card={card} club={club} />

        <section className="flex flex-col gap-6">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-floodlight-400 uppercase">
              {share.labels.eyebrow}
            </p>
            <h1 className="font-display mt-2 text-6xl leading-none text-chalk sm:text-7xl">
              {player.firstName} {player.lastName}
            </h1>
            <p className="mt-3 text-lg font-semibold text-chalk">{share.labels.line}</p>
          </div>

          <Link
            href={`/club/${club.id}`}
            className="flex w-fit items-center gap-3 rounded-lg border border-chalk/10 bg-pitch-900/70 p-3 pr-5 transition hover:border-floodlight-400/60"
          >
            <Crest club={club} className="h-14 w-12" />
            <span>
              <span className="block font-semibold text-chalk">{club.name}</span>
              <span className="block text-sm text-chalk-muted">
                {division ? divisionLabel(division) : ''} · {club.city}
              </span>
            </span>
          </Link>

          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <dt className="sr-only">{t('facts')}</dt>
            <dd className="text-chalk">{tPos(`${player.positions[0] ?? 'CM'}.long`)}</dd>
            <dd className="text-chalk">{t('age', { age: player.age })}</dd>
            <dd className="text-chalk">{t('height', { height: player.heightCm })}</dd>
            <dd className="w-full text-chalk-muted">
              {t('foot', { stars: player.weakFoot, skills: player.skillMoves })}
            </dd>
          </dl>

          {player.traits.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-chalk-muted">{t('traits')}</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {player.traits.map((trait) => (
                  <li
                    key={trait}
                    className="rounded-pill border border-chalk/15 px-3 py-1 text-sm text-chalk"
                    title={tTraits(`${trait}.description`)}
                  >
                    {tTraits(`${trait}.name`)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {variants.length > 1 && (
            <nav aria-label={t('variants')}>
              <h2 className="text-sm font-bold text-chalk-muted">{t('variants')}</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {variants.map((variant) => {
                  const target = variant === 'base' ? base : `${base}~${variant}`;
                  const current = target === id;
                  return (
                    <li key={variant}>
                      <Link
                        href={`/carte/${target}`}
                        aria-current={current ? 'page' : undefined}
                        className={`block rounded-md px-3 py-1.5 text-sm font-semibold ${
                          current
                            ? 'bg-floodlight-400 text-pitch-950'
                            : 'border border-chalk/20 text-chalk hover:border-floodlight-400'
                        }`}
                      >
                        {tCards(`variants.${variant}`)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}

          <ShareButtons
            title={share.title}
            text={tShare('shareText', { name: player.displayName })}
            storyUrl={`/carte/${id}/story`}
            storyName={`${id}.png`}
          />

          <p className="max-w-prose text-xs leading-relaxed text-chalk-faint">{t('fictional')}</p>
        </section>
      </main>
    </>
  );
}
