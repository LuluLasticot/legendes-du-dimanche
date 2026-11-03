import { autoSquad } from '@legendes/data';
import { FORMATIONS } from '@legendes/engine/sim/formations';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { z } from 'zod';
import { PlayerCard } from '@/components/card/player-card';
import { Tile, TileButton } from '@/components/shell/tile';
import { PitchView } from '@/components/team/pitch-view';
import { sessionClient } from '@/lib/supabase/session';
import { cardsOf } from '@/server/game/collection';
import { savedSheet } from '@/server/game/squads';
import { saveMySquad } from '../../game-actions';
import { requireStage } from '../../current';

const query = z.object({
  formation: z.enum(FORMATIONS).optional().catch(undefined),
  accueil: z.literal('1').optional().catch(undefined),
});

export default async function SquadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const player = await requireStage('playing');
  const { formation, accueil } = query.parse(await searchParams);
  const t = await getTranslations('game.squads');
  const cards = cardsOf(player.cardIds);
  const saved = await savedSheet(await sessionClient(), player);
  const sheet = formation && formation !== saved.formation ? autoSquad(cards, formation) : saved;
  const isSaved = saved.saved && sheet === saved;

  return (
    <div className="flex flex-col gap-5">
      {accueil && (
        <section className="flex flex-col gap-3 rounded-lg bg-floodlight-400/10 p-4 ring-1 ring-floodlight-400/40 sm:flex-row sm:items-center sm:p-5">
          <p className="flex-1 text-sm text-chalk">{t('intro')}</p>
          <Link href="/jouer" className="shrink-0">
            <TileButton>{t('introCta')}</TileButton>
          </Link>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <PitchView sheet={sheet} />

        <div className="flex flex-col gap-4">
          <Tile kicker={t('kicker')} title={t('title')}>
            <div className="flex flex-col gap-4 px-4 pt-2 pb-5 sm:px-5">
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs font-semibold text-chalk-muted">{t('rating')}</dt>
                  <dd className="font-display text-5xl leading-none font-black text-chalk">
                    {sheet.rating}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-chalk-muted">{t('collective')}</dt>
                  <dd className="font-display text-5xl leading-none font-black text-floodlight-300">
                    {t('collectiveValue', { points: sheet.collective })}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-chalk-faint">{t('auto')}</p>
              {isSaved ? (
                <p className="self-start rounded-pill bg-success/20 px-3 py-1 text-xs font-bold tracking-widest text-success uppercase">
                  {t('saved')}
                </p>
              ) : (
                <form action={saveMySquad}>
                  <input type="hidden" name="formation" value={sheet.formation} />
                  <button type="submit">
                    <TileButton>{t('save')}</TileButton>
                  </button>
                </form>
              )}
              <div>
                <p className="mb-2 text-xs font-bold tracking-[0.18em] text-floodlight-400 uppercase">
                  {t('formation')}
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {FORMATIONS.map((f) => (
                    <li key={f}>
                      <Link
                        href={`/jouer/equipes?formation=${f}`}
                        aria-current={f === sheet.formation ? 'true' : undefined}
                        className={`block rounded-md px-2.5 py-1 text-sm font-bold tabular-nums ring-1 ${
                          f === sheet.formation
                            ? 'bg-floodlight-400 text-pitch-950 ring-floodlight-400'
                            : 'bg-pitch-800 text-chalk-muted ring-chalk/10 hover:text-chalk'
                        }`}
                      >
                        {f}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Tile>

          <Tile kicker={t('kicker')} title={t('bench')}>
            <ul className="grid grid-cols-4 gap-2 px-4 pt-2 pb-5 sm:px-5">
              {sheet.bench.map(({ card, club }) => (
                <li key={card.id}>
                  <PlayerCard card={card} club={club} className="w-full" />
                </li>
              ))}
            </ul>
          </Tile>
        </div>
      </div>
    </div>
  );
}
