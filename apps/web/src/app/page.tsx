import { cardOf, generateSquad, WORLD } from '@legendes/data';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PlayerCard } from '@/components/card/player-card';
import { DeterminismBadge } from '@/components/determinism-badge';

/** The best player of the pilot, as a team-of-the-weekend card: generated, fictional, the same on every build. */
function showcaseCard() {
  const best = WORLD.clubs
    .filter((club) => club.divisionId.startsWith('n1-'))
    .flatMap((club) => generateSquad(club).players.map((player) => ({ player, club })))
    .sort((a, b) => b.player.rating - a.player.rating || a.player.id.localeCompare(b.player.id))[0];
  if (!best) throw new Error('The pilot has no National 1 club');
  return { card: cardOf(best.player, 'weekend'), club: best.club };
}

const FEATURES = ['packs', 'collectives', 'moments'] as const;

export default async function HomePage() {
  const t = await getTranslations();
  const showcase = showcaseCard();

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden">
      {/* Floodlight glow + pitch markings */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_50%_at_75%_-5%,rgb(255_209_102/0.16),transparent_70%),linear-gradient(to_bottom,var(--ld-color-pitch-800),var(--ld-color-pitch-950)_75%)]"
        aria-hidden
      />
      <div className="pitch-lines pointer-events-none absolute inset-0 -z-10" aria-hidden />

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-14 px-5 py-16 sm:px-8 md:grid-cols-[1.25fr_1fr] md:py-24">
        <section>
          <p className="text-xs font-bold tracking-[0.2em] text-floodlight-400 uppercase">
            {t('home.eyebrow')}
          </p>
          <h1 className="font-display mt-4 leading-[0.85] text-chalk" aria-label={t('home.title')}>
            <span className="block text-7xl sm:text-8xl lg:text-9xl">{t('home.titleMain')}</span>
            <span className="mt-1 block text-5xl text-floodlight-400 sm:text-6xl lg:text-7xl">
              {t('home.titleSub')}
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-2xl font-semibold text-chalk text-balance">
            {t('home.tagline')}
          </p>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-chalk-muted text-pretty">
            {t('home.pitch')}
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <p className="inline-flex w-fit items-center gap-2 rounded-pill border border-floodlight-400/30 bg-floodlight-400/10 px-3.5 py-1.5 text-sm font-semibold text-floodlight-300">
              {t('home.status')}
            </p>
            <DeterminismBadge />
          </div>
        </section>

        <section className="flex flex-col items-center gap-3 md:items-end">
          <Link
            href={`/carte/${showcase.card.id}`}
            className="block rotate-[-4deg] transition-transform duration-500 hover:rotate-0"
          >
            <PlayerCard
              card={showcase.card}
              club={showcase.club}
              className="w-[260px] drop-shadow-[0_24px_30px_rgb(0_0_0/0.6)]"
            />
          </Link>
          <p className="max-w-[260px] text-center text-xs text-chalk-faint">
            {t('home.cardPreview')}
          </p>
        </section>
      </main>

      <section className="mx-auto grid w-full max-w-6xl gap-4 px-5 pb-16 sm:px-8 md:grid-cols-3">
        {FEATURES.map((key) => (
          <article
            key={key}
            className="rounded-lg border border-chalk/10 bg-pitch-900/60 p-5 backdrop-blur-sm"
          >
            <h2 className="font-display text-2xl text-chalk">{t(`home.features.${key}.title`)}</h2>
            <p className="mt-2 text-sm leading-relaxed text-chalk-muted">
              {t(`home.features.${key}.body`)}
            </p>
          </article>
        ))}
      </section>

      <footer className="border-t border-chalk/10 px-5 py-6 text-center text-xs text-chalk-faint sm:px-8">
        {t('legal.unofficial')}
      </footer>
    </div>
  );
}
