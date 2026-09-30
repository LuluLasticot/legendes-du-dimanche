import { getTranslations } from 'next-intl/server';
import { PackLab } from '@/components/lab/pack-lab';

export default async function PackLabPage() {
  const t = await getTranslations('lab.pack');
  return (
    <main className="flex h-dvh flex-col">
      <h1 className="sr-only">{t('title')}</h1>
      <PackLab />
    </main>
  );
}
