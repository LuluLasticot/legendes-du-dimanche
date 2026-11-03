import { PACK_TYPES, PACKS, packOdds } from '@legendes/data';
import { getTranslations } from 'next-intl/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PackArt } from '@/components/shell/pack-art';
import { GAME_ERROR_CODES } from '@/server/game/errors';
import { buyMyPack } from '../../game-actions';
import { requireStage } from '../../current';

const query = z.object({ erreur: z.enum(GAME_ERROR_CODES).optional().catch(undefined) });
const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** The shop: packs for credits, odds always shown (rule 5), no real money anywhere. */
export default async function StorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const player = await requireStage('playing');
  const { erreur } = query.parse(await searchParams);
  const t = await getTranslations('game.store');
  const tp = await getTranslations('packs');
  const te = await getTranslations('game.errors');

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl leading-none font-extrabold text-chalk uppercase">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-chalk-muted">{t('intro')}</p>
        </div>
        {erreur && (
          <p
            className="rounded-md bg-danger/15 px-3 py-2 text-sm text-chalk ring-1 ring-danger/50"
            role="alert"
          >
            {te(erreur)}
          </p>
        )}
      </header>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PACK_TYPES.map((type) => {
          const { price } = PACKS[type];
          const affordable = player.credits >= price;
          return (
            <li
              key={type}
              className="flex flex-col gap-3 rounded-lg bg-pitch-900/85 p-4 shadow-card ring-1 ring-chalk/10"
            >
              <PackArt type={type} uid={`shop-${type}`} className="mx-auto h-44 w-auto" />
              <div>
                <h2 className="font-display text-2xl font-extrabold text-chalk uppercase">
                  {tp(`types.${type}.name`)}
                </h2>
                <p className="text-sm text-chalk-muted">{tp(`types.${type}.contents`)}</p>
              </div>
              <table className="w-full text-left text-xs">
                <caption className="mb-1 text-left font-bold tracking-[0.18em] text-floodlight-400 uppercase">
                  {tp('odds.title')}
                </caption>
                <thead className="text-chalk-faint">
                  <tr>
                    <th className="py-0.5 font-normal">{tp('odds.class')}</th>
                    <th className="py-0.5 text-right font-normal">{tp('odds.expected')}</th>
                    <th className="py-0.5 text-right font-normal">{tp('odds.atLeastOne')}</th>
                  </tr>
                </thead>
                <tbody className="text-chalk tabular-nums">
                  {packOdds(type).map((o) => (
                    <tr key={o.cardClass} className="border-t border-chalk/5">
                      <td className="py-0.5">{tp(`classes.${o.cardClass}`)}</td>
                      <td className="py-0.5 text-right">{decimal.format(o.expected)}</td>
                      <td className="py-0.5 text-right">{percent.format(o.atLeastOne)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <form action={buyMyPack} className="mt-auto">
                <input type="hidden" name="type" value={type} />
                {/* One request per page view: a double click debits once. */}
                <input type="hidden" name="request" value={randomUUID()} />
                <button
                  type="submit"
                  disabled={!affordable}
                  className="w-full rounded-md bg-floodlight-400 px-4 py-2 font-display text-lg font-extrabold tracking-wide text-pitch-950 uppercase hover:bg-floodlight-300 disabled:cursor-not-allowed disabled:bg-chalk/10 disabled:text-chalk-faint"
                >
                  {t('buy', { price })}
                </button>
              </form>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-chalk-faint">{t('legal')}</p>
    </div>
  );
}
