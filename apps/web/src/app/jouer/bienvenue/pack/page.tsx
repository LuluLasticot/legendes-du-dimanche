import { STARTER_COMPOSITION } from '@legendes/data';
import { getTranslations } from 'next-intl/server';
import { StarterOpening } from '@/components/welcome/starter-opening';
import { requireStage } from '../../current';

export default async function PackPage() {
  // "playing" too: once the pack is open, a reload replays the same cards.
  await requireStage('pack', 'playing');
  const t = await getTranslations('game.welcome');
  const tp = await getTranslations('packs');

  return (
    <main className="flex flex-1 flex-col">
      <header className="px-4 pt-5 text-center sm:pt-8">
        <h1 className="font-display text-3xl leading-none font-extrabold text-chalk uppercase sm:text-4xl">
          {t('packTitle')}
        </h1>
        {/* Rule 5: what every starter pack holds, shown before it is opened. */}
        <p className="mt-2 text-sm text-chalk-muted">
          {tp('starterMix', {
            club: STARTER_COMPOSITION.club,
            others: STARTER_COMPOSITION.others,
            goalkeepers: STARTER_COMPOSITION.lines.goalkeeper,
            defenders: STARTER_COMPOSITION.lines.defence,
            midfielders: STARTER_COMPOSITION.lines.midfield,
            forwards: STARTER_COMPOSITION.lines.attack,
          })}
        </p>
      </header>
      <StarterOpening />
    </main>
  );
}
