import {
  divisionLabel,
  generateSquad,
  getClub,
  getDivision,
  identityOf,
  SEASON,
  WORLD,
  type Player,
} from '@legendes/data';
import { POSITION_LINE, type PositionLine } from '@legendes/engine/sim/positions';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Crest } from '@/components/club/crest';
import { Kit } from '@/components/club/kit';
import { PublicHeader } from '@/components/share/public-header';
import { ShareButtons } from '@/components/share/share-buttons';
import { clubShare } from '@/lib/share/labels';

type Props = { params: Promise<{ id: string }> };

const LINES: readonly PositionLine[] = ['goalkeeper', 'defence', 'midfield', 'attack'];
const KITS = ['home', 'away', 'keeper'] as const;
const TIER_CHIP = {
  bronze: 'bg-bronze-dark/50 text-bronze-light ring-bronze/50',
  silver: 'bg-silver-dark/40 text-silver-light ring-silver/50',
  gold: 'bg-gold-dark/50 text-gold-light ring-gold/60',
  special: 'bg-floodlight-600/40 text-floodlight-300 ring-floodlight-400/60',
} as const;

// The pilot's clubs are known at build time.
export function generateStaticParams(): { id: string }[] {
  return WORLD.clubs.map((club) => ({ id: club.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const club = getClub((await params).id);
  if (!club) return {};
  const { title, description } = await clubShare(club);
  return {
    title,
    description,
    openGraph: { title, description, type: 'website', locale: 'fr_FR' },
    twitter: { card: 'summary_large_image', title, description },
    robots: { index: false, follow: true },
  };
}

export default async function ClubPage({ params }: Props) {
  const club = getClub((await params).id);
  if (!club) notFound();
  const t = await getTranslations('clubPage');
  const tShare = await getTranslations('share');
  const tPos = await getTranslations('positions');
  const tKits = await getTranslations('lab.kits.kitNames');
  const tSurfaces = await getTranslations('surfaces');
  const share = await clubShare(club);
  const division = getDivision(club.divisionId);
  const identity = identityOf(club);
  const players = [...generateSquad(club).players].sort((a, b) => b.rating - a.rating);
  const byLine = (line: PositionLine): Player[] =>
    players.filter((p) => POSITION_LINE[p.positions[0] ?? 'CM'] === line);
  const surface = { grass: 'grass', artificial: 'artificial', stabilized: 'dirt' } as const;

  return (
    <>
      <PublicHeader />
      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-5 py-8 sm:px-8 md:py-12">
        <header className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <Crest
            club={club}
            className="h-40 w-32 shrink-0 drop-shadow-[0_10px_18px_rgb(0_0_0/0.6)]"
          />
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold tracking-[0.2em] text-floodlight-400 uppercase">
              {division ? divisionLabel(division) : ''}
            </p>
            <h1 className="font-display text-5xl leading-none text-chalk sm:text-6xl">
              {club.name}
            </h1>
            <p className="text-chalk-muted">
              {club.city} · {club.stadium.name} · {tSurfaces(surface[club.stadium.surface])}
            </p>
            <ShareButtons title={share.title} text={share.title} />
          </div>
        </header>

        <section>
          <h2 className="font-display text-2xl text-chalk">{t('kits')}</h2>
          <ul className="mt-4 flex flex-wrap gap-4 sm:gap-6">
            {KITS.map((name) => (
              <li key={name} className="flex flex-col items-center gap-2">
                <Kit
                  kit={identity.kits[name]}
                  uid={`${club.id}-page-${name}`}
                  crest={identity.crest}
                  sponsor={name === 'keeper' ? undefined : identity.sponsors[0]?.label}
                  full
                  className="h-32 w-24 sm:h-44 sm:w-32"
                />
                <span className="text-sm text-chalk-muted">{tKits(name)}</span>
              </li>
            ))}
          </ul>
          {identity.sponsors[0] && (
            <p className="mt-3 text-sm text-chalk-muted">
              {t('sponsor')} : {identity.sponsors[0].name}
            </p>
          )}
        </section>

        <section>
          <h2 className="font-display text-2xl text-chalk">
            {t('squad', { season: SEASON.replace('-', '–') })}
          </h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            {LINES.map((line) => (
              <div key={line}>
                <h3 className="text-sm font-bold text-chalk-muted">{t(`lines.${line}`)}</h3>
                <ul className="mt-2 divide-y divide-chalk/5">
                  {byLine(line).map((player) => (
                    <li key={player.id}>
                      <Link
                        href={`/carte/${player.id}`}
                        className="flex items-center gap-3 py-2 text-sm hover:bg-chalk/5"
                      >
                        <span
                          className={`grid w-9 shrink-0 place-items-center rounded-md py-1 font-mono font-bold ring-1 ${TIER_CHIP[player.tier]}`}
                        >
                          {player.rating}
                        </span>
                        <span className="w-8 shrink-0 text-chalk-faint tabular-nums">
                          {player.number}
                        </span>
                        <span className="flex-1 font-semibold text-chalk">
                          {player.firstName} {player.lastName}
                        </span>
                        <span className="text-chalk-muted">
                          {tPos(`${player.positions[0] ?? 'CM'}.short`)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <p className="max-w-prose text-xs leading-relaxed text-chalk-faint">
          {t('check')} {tShare('fictional')}.
        </p>
      </main>
    </>
  );
}
