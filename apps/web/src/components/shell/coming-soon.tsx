import { getTranslations } from 'next-intl/server';
import { Tile } from './tile';

/** A tab whose mode is not open yet: shown anyway, the whole menu is part of the feel. */
export async function ComingSoon({ tab }: { tab: 'solo' | 'online' | 'transfers' | 'store' }) {
  const t = await getTranslations('game');
  return (
    <div className="mx-auto max-w-2xl">
      <Tile tone="muted" kicker={t('soon.badge')} title={t(`tabs.${tab}`)}>
        <p className="px-4 pt-2 pb-5 text-chalk-muted sm:px-5">{t(`soon.${tab}`)}</p>
      </Tile>
    </div>
  );
}
