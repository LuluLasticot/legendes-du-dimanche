import type { OutfieldAttributes, PlayerCard } from '@legendes/shared';
import { getTranslations } from 'next-intl/server';

type OutfieldCard = Extract<PlayerCard, { kind: 'outfield' }>;

const ATTRIBUTE_ORDER: readonly (keyof OutfieldAttributes)[] = [
  'pace',
  'dribbling',
  'shooting',
  'defending',
  'passing',
  'physical',
];

/**
 * Provisional 2D card, silver-rare tier. The real card designs (bronze/silver/gold, promos,
 * holographic 3D) come in Phase 3; this only exercises tokens, i18n and shared types.
 */
export async function CardPreview({
  card,
  clubColors,
}: {
  card: OutfieldCard;
  clubColors: readonly [string, string];
}) {
  const t = await getTranslations();
  const [primary, secondary] = clubColors;

  return (
    <figure className="relative w-[248px] select-none">
      <div
        className="relative aspect-[5/7] overflow-hidden rounded-card p-[3px] shadow-card"
        style={{
          background:
            'linear-gradient(145deg, var(--ld-color-silver-light), var(--ld-color-silver) 40%, var(--ld-color-silver-dark) 70%, var(--ld-color-silver-light))',
        }}
      >
        <div className="relative flex h-full flex-col rounded-[11px] bg-[linear-gradient(170deg,#26302d_0%,#121a17_55%,#0b1210_100%)] px-4 pt-4 pb-3">
          {/* Sheen of a rare card */}
          <div
            className="pointer-events-none absolute inset-0 rounded-[11px] opacity-40 mix-blend-screen"
            style={{
              background:
                'linear-gradient(115deg, transparent 30%, rgb(238 242 245 / 0.35) 45%, transparent 55%), radial-gradient(circle at 80% 10%, rgb(255 209 102 / 0.25), transparent 45%)',
            }}
            aria-hidden
          />

          <div className="relative flex items-start justify-between">
            <div className="leading-none">
              <div className="font-display text-5xl text-silver-light">{card.rating}</div>
              <div className="font-display mt-1 text-lg text-silver">
                {t(`positions.${card.position}.short`)}
              </div>
            </div>
            {/* Generated crest (never a real logo) */}
            <svg viewBox="0 0 40 46" className="h-11 w-10 drop-shadow" aria-hidden>
              <path d="M20 1 L38 7 V22 C38 34 30 41 20 45 C10 41 2 34 2 22 V7 Z" fill={secondary} />
              <path d="M20 5 L34 10 V22 C34 32 28 37 20 41 C12 37 6 32 6 22 V10 Z" fill={primary} />
              <path
                d="M13 10 H18 V39 C16 38 14.5 37 13 35.5 Z M22 10 H27 V35.5 C25.5 37 24 38 22 39 Z"
                fill={secondary}
              />
            </svg>
          </div>

          {/* Stylised avatar placeholder */}
          <svg viewBox="0 0 120 90" className="relative mx-auto -mt-2 h-24 w-32" aria-hidden>
            <defs>
              <linearGradient id="avatar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--ld-color-silver-light)" stopOpacity="0.9" />
                <stop offset="1" stopColor="var(--ld-color-silver-dark)" stopOpacity="0.5" />
              </linearGradient>
            </defs>
            <circle cx="60" cy="32" r="20" fill="url(#avatar)" />
            <path d="M18 90 C22 64 40 56 60 56 C80 56 98 64 102 90 Z" fill={primary} />
            <path d="M52 56 L60 68 L68 56 Z" fill={secondary} />
          </svg>

          <figcaption className="relative mt-1 border-y border-silver/25 py-1.5 text-center">
            <span className="font-display text-2xl tracking-wide text-chalk">
              {card.displayName}
            </span>
          </figcaption>

          <dl className="relative mt-2 grid grid-cols-2 gap-x-5 gap-y-0.5 px-1 text-sm">
            {ATTRIBUTE_ORDER.map((key) => (
              <div key={key} className="flex items-baseline gap-2">
                <dd className="font-display w-7 text-right text-lg text-chalk">
                  {card.attributes[key]}
                </dd>
                <dt className="text-xs font-semibold tracking-wider text-silver">
                  {t(`attributes.${key}`)}
                </dt>
              </div>
            ))}
          </dl>

          <p className="relative mt-auto text-center text-[10px] font-semibold tracking-wider text-silver-dark uppercase">
            {card.traits.map((trait) => t(`traits.${trait}.name`)).join(' · ')}
          </p>
        </div>
      </div>
    </figure>
  );
}
