import { getTranslations } from 'next-intl/server';
import { MatchScreen } from '@/components/match/match-screen';

export default async function MatchLabPage() {
  const t = await getTranslations('lab.match');
  return (
    <main className="flex h-dvh flex-col">
      <h1 className="sr-only">{t('title')}</h1>
      <MatchScreen />
    </main>
  );
}
