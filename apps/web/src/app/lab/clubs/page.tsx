import { getTranslations } from 'next-intl/server';
import { ClubsLab } from '@/components/lab/clubs-lab';

export default async function ClubsLabPage() {
  const t = await getTranslations('lab.clubs');
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <h1 className="font-display text-4xl text-chalk sm:text-5xl">{t('title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-chalk-muted">{t('intro')}</p>
      <ClubsLab />
    </main>
  );
}
