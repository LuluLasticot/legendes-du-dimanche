import {
  clubsOf,
  crestOf,
  divisionLabel,
  getDivision,
  matchKits,
  openStarterPack,
} from '@legendes/data';
import { getTranslations } from 'next-intl/server';
import { PlayerCard } from '@/components/card/player-card';
import { Crest } from '@/components/club/crest';
import { Kit } from '@/components/club/kit';
import { GameShell, type ShellPlayer } from '@/components/shell/game-shell';
import { Icon } from '@/components/shell/icons';
import { PackArt } from '@/components/shell/pack-art';
import { Tile, TileButton } from '@/components/shell/tile';

// A mockup of the home page of the game (spec §4), on made-up data: the day after the first
// session, once the starter pack is open. Nothing here reads or writes the database.

const FOUNDATIONS = [
  { id: 'club', done: true, reward: null },
  { id: 'pack', done: true, reward: null },
  { id: 'match', done: false, reward: { pack: 'bronze' } },
  { id: 'squad', done: false, reward: { credits: 300 } },
  { id: 'open', done: false, reward: { pack: 'bronze' } },
] as const;

const DAILY = [
  { id: 'goals', progress: 1, goal: 3, credits: 150 },
  { id: 'moment', progress: 0, goal: 2, credits: 150 },
  { id: 'win', progress: 0, goal: 1, credits: 250 },
] as const;

/** Collective points (0 to 3) of a player when `count` players of the eleven share a group. */
const tierOf = (count: number, steps: readonly [number, number, number]): number =>
  steps.filter((step) => count >= step).length;

export default async function HomeMockupPage() {
  const t = await getTranslations('game.home');
  const starters = clubsOf({ divisionId: 'escaut-d5' });
  const club = starters.find((c) => c.founded !== null) ?? starters[0];
  const opponent = starters.find((c) => c.id !== club?.id);
  if (!club || !opponent) throw new Error('The pilot has no District 5 clubs');

  const pack = openStarterPack(club, 'maquette');
  const eleven = pack.cards.slice(-11);
  const elevenRating = Math.round(
    eleven.reduce((sum, { card }) => sum + card.player.rating, 0) / eleven.length,
  );
  // Collectives (GDD §6.2): the best of club and district counts (league left out of the mockup).
  const fromClub = eleven.filter((c) => c.club.id === club.id).length;
  const fromDistrict = eleven.filter((c) => c.club.districtId === club.districtId).length;
  const collective = [
    { id: 'club', count: fromClub, points: tierOf(fromClub, [2, 4, 7]) },
    { id: 'district', count: fromDistrict, points: tierOf(fromDistrict, [3, 5, 8]) },
  ] as const;
  const collectivePoints = eleven.length * Math.max(...collective.map((c) => c.points));
  // The best three, the best in the middle.
  const [third, second, best] = pack.cards.slice(-3);
  const fan = [second, best, third].filter((c) => c !== undefined);

  const division = getDivision(club.divisionId);
  const kits = matchKits(club, opponent);
  const done = FOUNDATIONS.filter((step) => step.done).length;

  const player: ShellPlayer = {
    club,
    credits: 1000,
    record: { wins: 0, draws: 0, losses: 0 },
    level: 1,
    xp: 120,
    nextLevelXp: 500,
    packsWaiting: 1,
  };

  return (
    <GameShell player={player}>
      <p className="mb-4 rounded-md bg-floodlight-400/10 px-3 py-2 text-xs text-floodlight-300 ring-1 ring-floodlight-400/25">
        {t('mockup')}
      </p>

      <div className="grid gap-4 md:grid-cols-4 md:grid-rows-[repeat(2,minmax(15rem,auto))_minmax(17rem,auto)]">
        {/* Hero: the next match. */}
        <Tile
          tone="hero"
          kicker={t('next.kicker')}
          title={t('next.title')}
          className="min-h-[24rem] md:col-span-2 md:row-span-2"
          action={
            <div className="flex flex-wrap items-center gap-3">
              <TileButton>
                <Icon name="play" className="size-4 fill-current" />
                {t('next.play')}
              </TileButton>
              <span className="text-sm font-semibold text-chalk-muted">{t('next.reward')}</span>
            </div>
          }
        >
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_115%,rgb(42_122_88/0.45),transparent_60%)]"
          />
          <div className="relative flex flex-1 flex-col justify-center px-4 py-4 sm:px-5">
            <p className="text-sm font-semibold text-chalk-muted">
              {t('next.matchday', { division: division ? divisionLabel(division) : '' })}
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
                      next
                        ? 'bg-floodlight-400/12 ring-1 ring-floodlight-400/50'
                        : 'bg-pitch-800/60'
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
          action={<TileButton>{t('packs.open')}</TileButton>}
        >
          <div className="relative flex flex-1 items-center justify-center py-2">
            <div
              aria-hidden
              className="absolute size-40 rounded-full bg-bronze/25 blur-2xl transition group-hover:bg-bronze/40"
            />
            <PackArt
              type="bronze"
              uid="une-pack"
              className="relative h-36 w-auto -rotate-6 drop-shadow-[0_14px_20px_rgb(0_0_0/0.7)] transition duration-300 group-hover:rotate-0"
            />
            <span className="absolute top-2 right-4 grid size-8 place-items-center rounded-full bg-floodlight-400 font-display text-lg font-black text-pitch-950">
              1
            </span>
          </div>
          <p className="px-4 pb-2 text-xs text-chalk-muted sm:px-5">{t('packs.from')}</p>
        </Tile>

        {/* Daily objectives. */}
        <Tile kicker={t('daily.kicker')} title={t('daily.title')}>
          <div className="flex flex-1 flex-col gap-2 px-4 pt-2 pb-4 sm:px-5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-chalk-faint">
              <Icon name="clock" className="size-3.5" />
              {t('daily.expires', { hours: 14, minutes: 32 })}
            </p>
            <ul className="flex flex-col gap-2">
              {DAILY.map((item) => (
                <li key={item.id} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-semibold text-chalk">{t(`daily.items.${item.id}`)}</span>
                    <span className="text-xs font-bold text-floodlight-300">
                      {t('daily.reward', { value: item.credits })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-pitch-700">
                      <span
                        className="block h-full rounded-pill bg-floodlight-400"
                        style={{ width: `${(item.progress / item.goal) * 100}%` }}
                      />
                    </span>
                    <span className="text-[11px] font-bold text-chalk-faint tabular-nums">
                      {item.progress}/{item.goal}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Tile>

        {/* The squad: the best cards of the club. */}
        <Tile
          kicker={t('squad.kicker')}
          title={t('squad.title')}
          className="md:col-span-2"
          action={
            <div className="flex items-center justify-between gap-3">
              <TileButton>{t('squad.edit')}</TileButton>
              <span className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-chalk-muted">{t('squad.rating')}</span>
                <span className="font-display text-4xl leading-none font-black text-chalk">
                  {elevenRating}
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
              {t('collective.total', { points: collectivePoints })}
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
    </GameShell>
  );
}
