import type { TeamSheet } from '@legendes/data';
import { getTranslations } from 'next-intl/server';
import { PlayerCard } from '@/components/card/player-card';

/** The eleven on a mown pitch, attack at the top, each card with its collective points. */
export async function PitchView({ sheet }: { sheet: TeamSheet }) {
  const t = await getTranslations('game.squads');
  const tPos = await getTranslations('positions');
  return (
    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-pitch-700 ring-1 ring-chalk/10 sm:aspect-[4/5] lg:aspect-[6/5]">
      {/* Stripes and lines of the pitch. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[repeating-linear-gradient(180deg,rgb(255_255_255/0.035)_0_10%,transparent_10%_20%)]"
      />
      <svg
        aria-hidden
        viewBox="0 0 100 125"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full text-chalk/25"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.4"
        vectorEffect="non-scaling-stroke"
      >
        <rect x="4" y="4" width="92" height="117" />
        <line x1="4" y1="62.5" x2="96" y2="62.5" />
        <circle cx="50" cy="62.5" r="10" />
        <rect x="25" y="4" width="50" height="17" />
        <rect x="25" y="104" width="50" height="17" />
      </svg>

      {sheet.slots.map((slot, i) => (
        <div
          key={`${slot.position}-${i}`}
          className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
          style={{ left: `${6 + slot.x * 88}%`, top: `${8 + (0.84 - slot.y) * 100}%` }}
        >
          {slot.card ? (
            <>
              <PlayerCard
                card={slot.card.card}
                club={slot.card.club}
                className={`w-12 drop-shadow-[0_8px_10px_rgb(0_0_0/0.55)] sm:w-20 md:w-24 ${
                  slot.inPosition ? '' : 'opacity-60 grayscale'
                }`}
              />
              {slot.inPosition ? (
                <span
                  className="flex gap-0.5"
                  aria-label={t('points', { points: slot.collective })}
                >
                  {[0, 1, 2].map((n) => (
                    <span
                      key={n}
                      className={`size-1.5 rounded-full sm:size-2 ${
                        n < slot.collective ? 'bg-floodlight-400' : 'bg-pitch-950/60'
                      }`}
                    />
                  ))}
                </span>
              ) : (
                <span className="rounded-pill bg-danger/80 px-1.5 text-[9px] font-bold text-chalk uppercase">
                  {t('offPosition')}
                </span>
              )}
            </>
          ) : (
            <span className="grid h-16 w-12 place-items-center rounded-md border border-dashed border-chalk/40 text-xs font-bold text-chalk-muted sm:h-28 sm:w-20 md:h-32 md:w-24">
              {tPos(`${slot.position}.short`)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
