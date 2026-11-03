import { divisionLabel, getDivision, WORLD } from '@legendes/data';
import { COMPETITION_LEVELS } from '@legendes/shared';
import { getTranslations } from 'next-intl/server';
import { ClubPicker, type ClubChoice } from '@/components/welcome/club-picker';
import { requireStage } from '../../current';

export default async function ClubPage() {
  await requireStage('club');
  const t = await getTranslations('game.welcome');
  // From National 2 down to District 5, then by name.
  const clubs: ClubChoice[] = WORLD.clubs
    .map((club) => {
      const division = getDivision(club.divisionId);
      return {
        id: club.id,
        name: club.name,
        city: club.city,
        division: division ? divisionLabel(division) : '',
        order: division
          ? COMPETITION_LEVELS.indexOf(division.level) * 100 + division.rank
          : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'fr'));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 md:py-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-4xl leading-none font-extrabold text-chalk uppercase sm:text-5xl">
          {t('clubTitle')}
        </h1>
        <p className="max-w-2xl text-chalk-muted">{t('clubIntro')}</p>
      </header>
      <ClubPicker clubs={clubs} />
    </main>
  );
}
