'use client';

import {
  CREST_CHARGES,
  CREST_PARTITIONS,
  CREST_SHAPES,
  CREST_STYLES,
  DIVISIONS,
  divisionLabel,
  foldText,
  generateSquad,
  getDivision,
  identityOf,
  toMatchTeam,
  WORLD,
  type Club,
  type CrestSpec,
  type Player,
} from '@legendes/data';
import { teamRating } from '@legendes/engine/sim';
import { POSITION_LINE, type PositionLine } from '@legendes/engine/sim/positions';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Crest } from '@/components/club/crest';
import { Kit } from '@/components/club/kit';

const SURFACE_KEY = { grass: 'grass', artificial: 'artificial', stabilized: 'dirt' } as const;
const LINES: readonly PositionLine[] = ['goalkeeper', 'defence', 'midfield', 'attack'];

const TIER_CHIP = {
  bronze: 'bg-bronze-dark/50 text-bronze-light ring-bronze/50',
  silver: 'bg-silver-dark/40 text-silver-light ring-silver/50',
  gold: 'bg-gold-dark/50 text-gold-light ring-gold/60',
  special: 'bg-floodlight-600/40 text-floodlight-300 ring-floodlight-400/60',
} as const;

const divisionOrder = (id: string): number => DIVISIONS.findIndex((d) => d.id === id);
const CLUBS: readonly Club[] = [...WORLD.clubs].sort(
  (a, b) =>
    divisionOrder(a.divisionId) - divisionOrder(b.divisionId) || a.name.localeCompare(b.name, 'fr'),
);

export function ClubsLab() {
  const t = useTranslations('lab.clubs');
  const [query, setQuery] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = foldText(query);
    return CLUBS.filter(
      (c) =>
        (divisionId === '' || c.divisionId === divisionId) &&
        (q === '' || foldText(`${c.name} ${c.city}`).includes(q)),
    );
  }, [query, divisionId]);

  const selected = selectedId === null ? undefined : CLUBS.find((c) => c.id === selectedId);
  if (selected) return <ClubSheet club={selected} onBack={() => setSelectedId(null)} />;

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search')}
          aria-label={t('search')}
          className="min-w-0 flex-1 rounded-md border border-chalk/15 bg-pitch-900 px-3 py-2 text-sm text-chalk placeholder:text-chalk-faint focus:border-floodlight-400 focus:outline-none"
        />
        <select
          value={divisionId}
          onChange={(e) => setDivisionId(e.target.value)}
          aria-label={t('division')}
          className="rounded-md border border-chalk/15 bg-pitch-900 px-3 py-2 text-sm text-chalk"
        >
          <option value="">{t('allDivisions')}</option>
          {DIVISIONS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <p className="text-sm text-chalk-muted" role="status">
          {t('count', { count: shown.length })}
        </p>
      </div>

      {shown.length === 0 ? (
        <p className="mt-10 text-center text-chalk-muted">{t('noResult')}</p>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((club) => (
            <li key={club.id}>
              <button
                type="button"
                onClick={() => setSelectedId(club.id)}
                className="group flex h-full w-full flex-col items-center gap-2 rounded-lg border border-chalk/10 bg-pitch-900/70 p-3 text-center transition hover:-translate-y-0.5 hover:border-floodlight-400/60 hover:bg-pitch-800"
              >
                <Crest
                  club={club}
                  className="h-24 w-20 drop-shadow-[0_6px_10px_rgb(0_0_0/0.55)] transition group-hover:scale-105"
                />
                <span className="text-sm leading-tight font-semibold text-chalk">
                  {club.shortName}
                </span>
                <span className="text-xs text-chalk-faint">
                  {divisionLabel(getDivision(club.divisionId)!)} · {club.city}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ClubSheet({ club, onBack }: { club: Club; onBack: () => void }) {
  const t = useTranslations('lab.clubs');
  const tSurface = useTranslations('surfaces');
  const [override, setOverride] = useState<Partial<CrestSpec>>({});
  const identity = useMemo(() => identityOf(club), [club]);
  const crest: CrestSpec = { ...identity.crest, ...override };
  const squad = useMemo(() => generateSquad(club), [club]);
  const team = useMemo(() => toMatchTeam(club, squad), [club, squad]);
  const division = getDivision(club.divisionId);
  const changed = Object.keys(override).length > 0;
  const starters = new Set(team.lineup);

  const kitNames = ['home', 'away', 'keeper'] as const;
  const sponsorSlots = ['shirt', 'shorts', 'board'] as const;

  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={onBack}
        className="text-sm font-semibold text-floodlight-400 hover:text-floodlight-300"
      >
        ← {t('back')}
      </button>

      <div
        className="relative mt-4 overflow-hidden rounded-xl border border-chalk/10 p-5 sm:p-8"
        style={{
          background: `radial-gradient(ellipse 60% 90% at 18% 40%, ${club.colours.primary}55, transparent 70%), linear-gradient(to bottom, var(--ld-color-pitch-800), var(--ld-color-pitch-900))`,
        }}
      >
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <Crest
            club={club}
            spec={crest}
            title={club.name}
            className="h-48 w-40 shrink-0 drop-shadow-[0_14px_18px_rgb(0_0_0/0.6)]"
          />
          <div className="min-w-0 text-center sm:text-left">
            <h2 className="font-display text-4xl leading-none text-chalk sm:text-5xl">
              {club.name}
            </h2>
            <p className="mt-2 text-chalk-muted">
              {division?.name} · {club.city}
            </p>
            <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-chalk-faint">{t('stadium')}</dt>
                <dd className="text-chalk">
                  {club.stadium.name} · {tSurface(SURFACE_KEY[club.stadium.surface])}
                </dd>
              </div>
              <div>
                <dt className="text-chalk-faint">{t('colours')}</dt>
                <dd className="mt-0.5 flex items-center gap-2 text-chalk">
                  {[club.colours.primary, club.colours.secondary, club.colours.tertiary]
                    .filter((c): c is string => c !== null)
                    .map((c) => (
                      <span
                        key={c}
                        className="inline-block h-4 w-4 rounded-full ring-1 ring-chalk/40"
                        style={{ background: c }}
                      />
                    ))}
                  <span className="text-xs text-chalk-faint">
                    {t(`coloursSource.${club.coloursSource}`)}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-chalk-faint">{t('foundation')}</dt>
                <dd className="text-chalk">
                  {club.founded === null ? t('foundedUnknown') : club.founded}
                </dd>
              </div>
            </dl>
            {!club.verified && (
              <p className="mt-4 inline-block rounded-md bg-floodlight-400/10 px-3 py-1.5 text-xs text-floodlight-300">
                {t('unverified')} — {t('unverifiedHelp')}
                {!club.divisionKnown && ` ${t('divisionProvisional')}.`}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section className="rounded-xl border border-chalk/10 bg-pitch-900/60 p-5">
          <h3 className="font-display text-2xl text-chalk">{t('workshop.title')}</h3>
          <p className="mt-1 text-xs text-chalk-muted">{t('workshop.help')}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Choice
              label={t('workshop.shape')}
              value={crest.shape}
              options={CREST_SHAPES.map((v) => [v, t(`workshop.shapes.${v}`)] as const)}
              onChange={(shape) => setOverride({ ...override, shape })}
            />
            <Choice
              label={t('workshop.partition')}
              value={crest.partition}
              options={CREST_PARTITIONS.map((v) => [v, t(`workshop.partitions.${v}`)] as const)}
              onChange={(partition) => setOverride({ ...override, partition })}
            />
            <Choice
              label={t('workshop.charge')}
              value={crest.charge}
              options={CREST_CHARGES.map((v) => [v, t(`workshop.charges.${v}`)] as const)}
              onChange={(charge) => setOverride({ ...override, charge })}
            />
            <Choice
              label={t('workshop.style')}
              value={crest.style}
              options={CREST_STYLES.map((v) => [v, t(`workshop.styles.${v}`)] as const)}
              onChange={(style) => setOverride({ ...override, style })}
            />
          </div>
          <button
            type="button"
            disabled={!changed}
            onClick={() => setOverride({})}
            className="mt-4 rounded-md border border-chalk/20 px-3 py-1.5 text-sm text-chalk-muted enabled:hover:border-floodlight-400 enabled:hover:text-floodlight-300 disabled:opacity-40"
          >
            {t('workshop.reset')}
          </button>
          {/* The chest badge follows the workshop crest so a change shows on the shirts too. */}
        </section>

        <section className="rounded-xl border border-chalk/10 bg-pitch-900/60 p-5">
          <h3 className="font-display text-2xl text-chalk">{t('kits.title')}</h3>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {kitNames.map((name) => (
              <figure key={name} className="text-center">
                <Kit
                  kit={identity.kits[name]}
                  uid={`${club.id}-${name}`}
                  crest={name === 'keeper' ? undefined : crest}
                  sponsor={name === 'keeper' ? undefined : identity.sponsors[0]?.label}
                  full
                  className="mx-auto h-44 w-full drop-shadow-[0_8px_10px_rgb(0_0_0/0.5)]"
                />
                <figcaption className="mt-1 text-xs text-chalk-muted">
                  {t(`kits.${name}`)}
                </figcaption>
              </figure>
            ))}
          </div>
          <h3 className="font-display mt-5 text-xl text-chalk">{t('sponsors.title')}</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {identity.sponsors.map((s, i) => (
              <li key={s.name} className="flex justify-between gap-3">
                <span className="text-chalk">{s.name}</span>
                <span className="text-chalk-faint">
                  {t(`sponsors.${sponsorSlots[i] ?? 'board'}`)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-chalk/10 bg-pitch-900/60 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-2xl text-chalk">{t('squad.title')}</h3>
          <p className="text-sm text-chalk-muted">
            {t('squad.rating')} <strong className="text-floodlight-400">{teamRating(team)}</strong>{' '}
            · {t('squad.formation')} {team.formation} · {t('squad.style')}{' '}
            {t(`playStyles.${team.tactic.style}`)}
          </p>
        </div>
        {LINES.map((line) => (
          <SquadLine
            key={line}
            title={t(`squad.lines.${line}`)}
            players={squad.players
              .filter((p) => POSITION_LINE[p.positions[0] ?? 'CM'] === line)
              .sort((a, b) => b.rating - a.rating)}
            starters={starters}
          />
        ))}
      </section>
    </section>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-chalk-faint">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded-md border border-chalk/15 bg-pitch-800 px-2 py-1.5 text-chalk"
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function SquadLine({
  title,
  players,
  starters,
}: {
  title: string;
  players: readonly Player[];
  starters: ReadonlySet<string>;
}) {
  const t = useTranslations('lab.clubs');
  const tPos = useTranslations('positions');
  const tTraits = useTranslations('traits');
  return (
    <div className="mt-5">
      <h4 className="text-xs font-bold tracking-[0.15em] text-chalk-faint uppercase">{title}</h4>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="sr-only">
            <tr>
              {(
                ['number', 'name', 'position', 'age', 'archetype', 'traits', 'rating'] as const
              ).map((c) => (
                <th key={c}>{t(`squad.columns.${c}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-chalk/5">
            {players.map((p) => (
              <tr key={p.id} className={starters.has(p.id) ? 'bg-chalk/[0.04]' : undefined}>
                <td className="w-8 py-1.5 text-chalk-faint tabular-nums">{p.number}</td>
                <td className="py-1.5 font-semibold text-chalk">
                  {p.displayName}
                  {starters.has(p.id) && (
                    <span className="ml-2 text-[10px] font-bold tracking-wider text-floodlight-400 uppercase">
                      {t('squad.starter')}
                    </span>
                  )}
                </td>
                <td className="w-16 text-chalk-muted">{tPos(`${p.positions[0] ?? 'CM'}.short`)}</td>
                <td className="w-10 text-chalk-muted tabular-nums">{p.age}</td>
                <td className="text-chalk-muted">{t(`archetypes.${p.archetype}`)}</td>
                <td className="text-xs text-chalk-faint">
                  {p.traits.map((tr) => tTraits(`${tr}.name`)).join(', ')}
                </td>
                <td className="w-14 text-right">
                  <span
                    className={`font-display inline-block min-w-9 rounded px-1.5 py-0.5 text-center text-lg ring-1 ${TIER_CHIP[p.tier]}`}
                  >
                    {p.rating}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
