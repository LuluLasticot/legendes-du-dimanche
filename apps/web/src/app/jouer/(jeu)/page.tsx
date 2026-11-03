import {
  COLLECTIVE_STEPS,
  PACK_TYPES,
  bestSquad,
  crestOf,
  divisionLabel,
  getClub,
  getDivision,
  matchKits,
} from '@legendes/data';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PlayerCard } from '@/components/card/player-card';
import { Crest } from '@/components/club/crest';
import { Kit } from '@/components/club/kit';
import { Icon } from '@/components/shell/icons';
import { PackArt } from '@/components/shell/pack-art';
import { Tile, TileButton } from '@/components/shell/tile';
import { cardsOf } from '@/server/game/collection';
import { opponentOf } from '@/server/game/matches';
import { listObjectives, type ObjectiveState } from '@/server/game/objectives';
import { STAGE_PATH } from '@/server/game/stage';
import { sessionClient } from '@/lib/supabase/session';
import { requireStage } from '../current';

// La Une (spec §4): the next match, the Foundations, the packs to open, the eleven and its
// collectives. The match, the objectives in the database and the shop come with plan C.

/** The Foundations' steps: the welcome's two, then the objectives in the database. */
const STEP_OF = {
  'foundations-match': 'match',
  'foundations-squad': 'squad',
  'foundations-open': 'open',
} as const;

const tierOf = (count: number, steps: readonly number[]): number =>
  steps.filter((step) => count >= step).length;

export default async function HomePage() {
  const player = await requireStage('playing');
  const club = getClub(player.clubId ?? '');
  if (!club) redirect(STAGE_PATH.club);
  const t = await getTranslations('game.home');

  // The next matchday's opponent, as the server will set the match (`opponentOf`).
  const db = await sessionClient();
  const { count } = await db
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', player.userId)
    .neq('status', 'created');
  const played = count ?? 0;
  const opponent = opponentOf(club, played + 1);
  const division = getDivision(club.divisionId);
  const kits = matchKits(club, opponent);

  const sheet = bestSquad(cardsOf(player.cardIds));
  const playing = sheet.slots.flatMap((s) => (s.card && s.inPosition ? [s.card] : []));
  const fromClub = playing.filter((c) => c.club.id === club.id).length;
  const fromDistrict = playing.filter((c) => c.club.districtId === club.districtId).length;
  const collective = [
    { id: 'club', count: fromClub, points: tierOf(fromClub, COLLECTIVE_STEPS.club) },
    {
      id: 'district',
      count: fromDistrict,
      points: tierOf(fromDistrict, COLLECTIVE_STEPS.district),
    },
  ] as const;
  // The best three, the best in the middle.
  const [third, second, best] = sheet.slots
    .flatMap((s) => (s.card ? [s.card] : []))
    .sort((a, b) => a.card.player.rating - b.card.player.rating)
    .slice(-3);
  const fan = [second, best, third].filter((c) => c !== undefined);
  type Step = 'club' | 'pack' | (typeof STEP_OF)[keyof typeof STEP_OF];
  const FOUNDATIONS: { id: Step; done: boolean; reward: ObjectiveState['reward'] | null }[] = [
    { id: 'club', done: true, reward: null },
    { id: 'pack', done: true, reward: null },
    ...(await listObjectives(db, player.userId)).flatMap((o) => {
      const id = STEP_OF[o.id as keyof typeof STEP_OF];
      return id ? [{ id, done: o.done, reward: o.reward }] : [];
    }),
  ];
  const done = FOUNDATIONS.filter((step) => step.done).length;
  const packs = player.packs.length;
  const first = player.packs[0];
  const firstType = PACK_TYPES.find((type) => type === first?.type);
  const firstPack = first && firstType ? { id: first.id, type: firstType } : null;

  return (
    <div className="grid gap-4 md:grid-cols-4 md:grid-rows-[repeat(2,minmax(15rem,auto))_minmax(17rem,auto)]">
      {/* Hero: the next match. */}
      <Tile
        tone="hero"
        kicker={t('next.kicker')}
        title={played === 0 ? t('next.title') : t('next.titleNext')}
        className="min-h-[24rem] md:col-span-2 md:row-span-2"
        action={
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/jouer/match">
              <TileButton>
                <Icon name="play" className="size-4 fill-current" />
                {t('next.play')}
              </TileButton>
            </Link>
            {played === 0 && (
              <span className="text-sm font-semibold text-chalk-muted">{t('next.reward')}</span>
            )}
          </div>
        }
      >
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_115%,rgb(42_122_88/0.45),transparent_60%)]"
        />
        <div className="relative flex flex-1 flex-col justify-center px-4 py-4 sm:px-5">
          <p className="text-sm font-semibold text-chalk-muted">
            {t('next.matchday', {
              day: played + 1,
              division: division ? divisionLabel(division) : '',
            })}
          </p>
          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-start gap-2">
            {[
              { side: club, kit: kits.home, label: t('next.home') },
              null,
              { side: opponent, kit: kits.away, label: null },
            ].map((entry, i) =>
              entry === null ? (
                <span
                  key="vs"
                  className="self-center pb-10 font-display text-4xl font-black text-floodlight-400 sm:text-5xl"
                >
                  VS
                </span>
              ) : (
                <div key={i} className="flex flex-col items-center gap-2 text-center">
                  <div className="relative h-36 w-32 sm:h-44 sm:w-40">
                    <Kit
                      kit={entry.kit}
                      uid={`une-${entry.side.id}`}
                      crest={crestOf(entry.side)}
                      full
                      className="absolute inset-0 m-auto h-full opacity-35"
                    />
                    <Crest
                      club={entry.side}
                      className="absolute inset-x-0 bottom-0 mx-auto h-24 w-20 drop-shadow-[0_10px_16px_rgb(0_0_0/0.7)] sm:h-28 sm:w-24"
                    />
                  </div>
                  <p className="font-display text-xl leading-tight font-extrabold text-chalk uppercase sm:text-2xl">
                    {entry.side.shortName}
                  </p>
                  {entry.label && (
                    <span className="rounded-pill bg-chalk/10 px-2 py-0.5 text-[10px] font-bold tracking-widest text-chalk-muted uppercase">
                      {entry.label}
                    </span>
                  )}
                </div>
              ),
            )}
          </div>
          <p className="mt-4 text-center text-xs text-chalk-faint">
            {t('next.stadium', { stadium: club.stadium.name, city: club.city })}
          </p>
        </div>
      </Tile>

      {/* The Foundations: the chain of first objectives. */}
      <Tile
        kicker={t('foundations.kicker')}
        title={t('foundations.title')}
        className="md:col-span-2"
      >
        <div className="flex flex-1 flex-col gap-3 px-4 pt-2 pb-4 sm:px-5">
          <div className="flex items-center gap-3">
            <span className="h-2 flex-1 overflow-hidden rounded-pill bg-pitch-700">
              <span
                className="block h-full rounded-pill bg-gradient-to-r from-success to-floodlight-400"
                style={{ width: `${(done / FOUNDATIONS.length) * 100}%` }}
              />
            </span>
            <span className="text-sm font-bold text-chalk tabular-nums">
              {t('foundations.progress', { done, total: FOUNDATIONS.length })}
            </span>
          </div>
          <ol className="grid gap-1.5 sm:grid-cols-2">
            {FOUNDATIONS.map((step, i) => {
              const next = !step.done && FOUNDATIONS.findIndex((s) => !s.done) === i;
              return (
                <li
                  key={step.id}
                  className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm ${
                    next ? 'bg-floodlight-400/12 ring-1 ring-floodlight-400/50' : 'bg-pitch-800/60'
                  }`}
                >
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-black ${
                      step.done
                        ? 'bg-success text-pitch-950'
                        : next
                          ? 'bg-floodlight-400 text-pitch-950'
                          : 'bg-pitch-700 text-chalk-faint'
                    }`}
                  >
                    {step.done ? <Icon name="check" className="size-3.5" /> : i + 1}
                  </span>
                  <span
                    className={`flex-1 font-semibold ${step.done ? 'text-chalk-faint line-through' : 'text-chalk'}`}
                  >
                    {t(`foundations.steps.${step.id}`)}
                  </span>
                  {step.reward && (
                    <span className="text-xs font-bold text-floodlight-300">
                      {'pack' in step.reward
                        ? t('foundations.rewardPack')
                        : t('foundations.rewardCredits', { value: step.reward.credits })}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </Tile>

      {/* Packs waiting in the inventory. */}
      <Tile
        kicker={t('packs.kicker')}
        title={t('packs.title')}
        action={
          firstPack ? (
            <Link href={`/jouer/ouvrir/${firstPack.id}`}>
              <TileButton>{t('packs.open')}</TileButton>
            </Link>
          ) : undefined
        }
      >
        {packs > 0 ? (
          <div className="relative flex flex-1 items-center justify-center py-2">
            <div
              aria-hidden
              className="absolute size-40 rounded-full bg-bronze/25 blur-2xl transition group-hover:bg-bronze/40"
            />
            <PackArt
              type={firstPack?.type ?? 'bronze'}
              uid="une-pack"
              className="relative h-36 w-auto -rotate-6 drop-shadow-[0_14px_20px_rgb(0_0_0/0.7)] transition duration-300 group-hover:rotate-0"
            />
            <span className="absolute top-2 right-4 grid size-8 place-items-center rounded-full bg-floodlight-400 font-display text-lg font-black text-pitch-950">
              {packs}
            </span>
          </div>
        ) : (
          <p className="px-4 pt-2 pb-4 text-sm text-chalk-muted sm:px-5">{t('packs.none')}</p>
        )}
      </Tile>

      {/* Daily objectives: in the database with plan C. */}
      <Tile tone="muted" kicker={t('daily.kicker')} title={t('daily.title')}>
        <div className="flex flex-1 flex-col justify-between gap-3 px-4 pt-2 pb-4 sm:px-5">
          <p className="text-sm text-chalk-muted">{t('daily.soon')}</p>
          <span className="self-start rounded-pill bg-chalk/10 px-3 py-1 text-xs font-bold tracking-widest text-chalk-muted uppercase">
            {t('soon.badge')}
          </span>
        </div>
      </Tile>

      {/* The squad: the best cards of the club. */}
      <Tile
        kicker={t('squad.kicker')}
        title={t('squad.title')}
        className="md:col-span-2"
        action={
          <div className="flex items-center justify-between gap-3">
            <Link href="/jouer/equipes">
              <TileButton>{t('squad.edit')}</TileButton>
            </Link>
            <span className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-chalk-muted">{t('squad.rating')}</span>
              <span className="font-display text-4xl leading-none font-black text-chalk">
                {sheet.rating}
              </span>
            </span>
          </div>
        }
      >
        <div className="flex flex-1 items-end justify-center px-4 pt-3 sm:px-5">
          {fan.map(({ card, club: cardClub }, i) => (
            <PlayerCard
              key={card.id}
              card={card}
              club={cardClub}
              className={`w-28 drop-shadow-[0_14px_18px_rgb(0_0_0/0.65)] transition duration-300 sm:w-32 ${
                i === 1
                  ? 'z-10 -mx-3 mb-1 w-32 sm:w-36'
                  : i === 0
                    ? 'translate-y-2 -rotate-6 group-hover:-rotate-9'
                    : 'translate-y-2 rotate-6 group-hover:rotate-9'
              }`}
            />
          ))}
        </div>
      </Tile>

      {/* Collectives, explained on the first day. */}
      <Tile kicker={t('collective.kicker')} title={t('collective.title')}>
        <div className="flex flex-1 flex-col gap-3 px-4 pt-2 pb-4 sm:px-5">
          <ul className="flex flex-col gap-2.5">
            {collective.map((group) => (
              <li key={group.id} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold text-chalk">
                    {t(`collective.${group.id}`)} ·{' '}
                    <span className="text-chalk-muted">
                      {t('collective.players', { count: group.count })}
                    </span>
                  </span>
                  <span className="font-display text-lg leading-none font-extrabold text-floodlight-300">
                    {t('collective.bonus', { points: group.points })}
                  </span>
                </div>
                <div className="flex gap-0.5" aria-hidden>
                  {Array.from({ length: 11 }, (_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 flex-1 rounded-sm ${i < group.count ? 'bg-floodlight-400' : 'bg-pitch-700'}`}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-chalk-faint">{t('collective.rule')}</p>
          <p className="mt-auto font-display text-2xl leading-none font-extrabold text-floodlight-300">
            {t('collective.total', { points: sheet.collective })}
          </p>
        </div>
      </Tile>

      {/* A mode not open yet, shown anyway: the whole menu is part of the feel. */}
      <Tile tone="muted" kicker={t('soon.kicker')} title={t('soon.title')}>
        <div className="flex flex-1 flex-col justify-between gap-3 px-4 pt-2 pb-4 sm:px-5">
          <p className="text-sm text-chalk-muted">{t('soon.body')}</p>
          <span className="self-start rounded-pill bg-chalk/10 px-3 py-1 text-xs font-bold tracking-widest text-chalk-muted uppercase">
            {t('soon.badge')}
          </span>
        </div>
      </Tile>
    </div>
  );
}
