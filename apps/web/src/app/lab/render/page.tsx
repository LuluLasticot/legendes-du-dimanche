import { getTranslations } from 'next-intl/server';
import { RenderPreview } from '@/components/lab/render-preview';

export default async function RenderLabPage() {
  const t = await getTranslations('lab.render');
  return (
    <main className="flex h-dvh flex-col">
      <header className="px-4 py-3 sm:px-6">
        <h1 className="font-display text-2xl text-chalk">{t('title')}</h1>
        <p className="text-xs text-chalk-muted">{t('intro')}</p>
      </header>
      <RenderPreview />
    </main>
  );
}
