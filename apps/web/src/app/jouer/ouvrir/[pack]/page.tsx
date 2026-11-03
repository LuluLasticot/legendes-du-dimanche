import { PACK_TYPES } from '@legendes/data';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { NightBackdrop } from '@/components/shell/night-backdrop';
import { PackReveal } from '@/components/pack/pack-reveal';
import { sessionClient } from '@/lib/supabase/session';
import { openMyPack } from '../../game-actions';
import { requireStage } from '../../current';

/** Opening a pack of the inventory, full screen like the starter pack. */
export default async function OpenPackPage({ params }: { params: Promise<{ pack: string }> }) {
  const player = await requireStage('playing');
  const { pack } = await params;
  const db = await sessionClient();
  const { data } = await db
    .from('user_packs')
    .select('type')
    .eq('id', pack)
    .eq('user_id', player.userId)
    .maybeSingle();
  const type = PACK_TYPES.find((t) => t === data?.type);
  if (!type) notFound();
  const tp = await getTranslations('packs');
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-pitch-950">
      <NightBackdrop />
      <header className="relative z-10 px-4 pt-5 text-center sm:pt-8">
        <h1 className="font-display text-3xl leading-none font-extrabold text-chalk uppercase sm:text-4xl">
          {tp(`types.${type}.name`)}
        </h1>
      </header>
      <div className="relative z-10 flex flex-1 flex-col">
        <PackReveal type={type} open={openMyPack.bind(null, pack)} next="/jouer" />
      </div>
    </main>
  );
}
