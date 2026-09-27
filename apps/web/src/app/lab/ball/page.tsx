import { getTranslations } from 'next-intl/server';
import { BallSandbox } from '@/components/lab/ball-sandbox';

export default async function BallLabPage() {
  const t = await getTranslations('lab.ball');
  return (
    <main className="flex h-dvh flex-col">
      <h1 className="sr-only">{t('title')}</h1>
      <BallSandbox />
    </main>
  );
}
