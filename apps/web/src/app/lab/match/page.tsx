import { getTranslations } from 'next-intl/server';
import { MatchView } from '@/components/lab/match-view';

export default async function MatchLabPage() {
  const t = await getTranslations('lab.match');
  return (
    <main className="flex h-dvh flex-col">
      <h1 className="sr-only">{t('title')}</h1>
      <MatchView />
    </main>
  );
}
