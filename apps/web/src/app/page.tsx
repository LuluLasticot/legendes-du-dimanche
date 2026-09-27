import { playerCardSchema } from '@legendes/shared';
import { getTranslations } from 'next-intl/server';
import { CardPreview } from '@/components/card-preview';
import { DeterminismBadge } from '@/components/determinism-badge';

// Fictional player (GDD §5.1 example). Parsed with the shared schema like any external data.
const previewCard = playerCardSchema.parse({
  id: '4f0a2b1c-3d4e-4f60-8a7b-9c0d1e2f3a4b',
  identityId: '5f0a2b1c-3d4e-4f60-8a7b-9c0d1e2f3a4b',
  clubId: '6f0a2b1c-3d4e-4f60-8a7b-9c0d1e2f3a4b',
  displayName: 'K. Benali',
  rating: 74,
  tier: 'silver',
  rarity: 'rare',
  kind: 'outfield',
  position: 'LW',
  secondaryPositions: ['LM'],
  preferredFoot: 'right',
  weakFoot: 3,
  skillMoves: 4,
  age: 27,
  heightCm: 176,
  traits: ['workhorse'],
  attributes: { pace: 82, shooting: 64, passing: 69, dribbling: 71, defending: 38, physical: 61 },
});

const FEATURES = ['packs', 'collectives', 'moments'] as const;

export default async function HomePage() {
  const t = await getTranslations();
  if (previewCard.kind !== 'outfield') throw new Error('Preview card must be an outfield player');

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
          <div className="rotate-[-4deg] transition-transform duration-500 hover:rotate-0">
            <CardPreview card={previewCard} clubColors={['#0f5132', '#f4f1e8']} />
          </div>
          <p className="text-xs text-chalk-faint">{t('home.cardPreview')}</p>
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
