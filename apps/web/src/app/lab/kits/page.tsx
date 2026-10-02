import { getTranslations } from 'next-intl/server';
import { KitsLab } from '@/components/lab/kits-lab';

export default async function KitsLabPage() {
  const t = await getTranslations('lab.kits');
  return (
    <main className="flex h-dvh flex-col">
      <h1 className="sr-only">{t('title')}</h1>
      <KitsLab />
    </main>
  );
}
