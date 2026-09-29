'use client';

import { sim } from '@legendes/engine';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { PLAY_STYLES, SIDE, type MatchConfig } from './match-config';
import { teamCode } from './team-code';

const SURFACES = ['grass', 'artificial', 'muddy', 'dirt'] as const;

const pct = (a: number, b: number): number => (a + b === 0 ? 50 : Math.round((100 * a) / (a + b)));

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    // Flex + m-auto rather than grid centring: a panel taller than the screen scrolls from its
    // top instead of being cut off above it.
    <div className="absolute inset-0 z-20 flex overflow-x-hidden overflow-y-auto overscroll-contain bg-pitch-950/90 p-3 backdrop-blur-sm sm:p-4">
      <div className="m-auto w-full max-w-xl min-w-0 space-y-4 rounded-lg border border-chalk/10 bg-pitch-900/90 p-4 text-chalk shadow-xl sm:p-5">
        <h2 className="text-center text-lg font-semibold text-floodlight-300">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
  format,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  format: (v: T) => string;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="shrink-0 text-chalk-muted">{label}</span>
      <select
        value={String(value)}
        onChange={(e) => onChange(options.find((o) => String(o) === e.target.value) ?? value)}
        className="max-w-[60%] min-w-0 rounded-md border border-chalk/20 bg-pitch-950 px-2 py-1 text-chalk"
      >
        {options.map((o) => (
          <option key={String(o)} value={String(o)}>
            {format(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Button({
  children,
  onClick,
  primary,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-pill px-5 py-2 text-sm font-semibold disabled:opacity-40 ${
        primary
          ? 'bg-floodlight-400 text-pitch-950 hover:bg-floodlight-300'
          : 'border border-chalk/20 text-chalk hover:bg-pitch-800'
      }`}
    >
      {children}
    </button>
  );
}

/** Kick-off screen: the two teams, the conditions, the tactic, and how to play. */
export function PreMatch({
  config,
  onChange,
  onStart,
}: {
  config: MatchConfig;
  onChange: (config: MatchConfig) => void;
  onStart: () => void;
}) {
  const t = useTranslations('match');
  const setup = sim.demoTeam(config.seed, {
    id: 'fca',
    name: '',
    rating: 58,
    formation: config.formation,
  });
  const away = sim.demoTeam(config.seed + 1, {
    id: 'uss',
    name: '',
    rating: 56,
    formation: '4-3-3',
  });
  return (
    <Panel title={t('prematch.title')}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
        <div>
          <p className="font-semibold">FC Avesnes-le-Sec</p>
          <p className="font-mono text-xs text-chalk-muted">
            {t('prematch.rating', { rating: sim.teamRating(setup) })} · {config.formation}
          </p>
        </div>
        <span className="text-chalk-muted">–</span>
        <div>
          <p className="font-semibold">US Saint-Amand</p>
          <p className="font-mono text-xs text-chalk-muted">
            {t('prematch.rating', { rating: sim.teamRating(away) })} · 4-3-3
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <Choice
          label={t('prematch.formation')}
          value={config.formation}
          options={sim.FORMATIONS}
          format={(f) => f}
          onChange={(formation) => onChange({ ...config, formation })}
        />
        <Choice
          label={t('prematch.style')}
          value={config.style}
          options={PLAY_STYLES}
          format={(s) => t(`style.${s}`)}
          onChange={(style) => onChange({ ...config, style })}
        />
        <Choice
          label={t('prematch.mentality')}
          value={config.mentality}
          options={[-2, -1, 0, 1, 2] as const}
          format={(m) => t(`mentality.${m}`)}
          onChange={(mentality) => onChange({ ...config, mentality })}
        />
        <Choice
          label={t('prematch.surface')}
          value={config.surface}
          options={SURFACES}
          format={(s) => t(`surface.${s}`)}
          onChange={(surface) => onChange({ ...config, surface })}
        />
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-chalk-muted">{t('prematch.rain')}</span>
          <input
            type="checkbox"
            checked={config.rain}
            onChange={(e) => onChange({ ...config, rain: e.target.checked })}
            className="size-4 accent-[var(--ld-color-floodlight-400)]"
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-chalk-muted">{t('prematch.play')}</span>
          <input
            type="checkbox"
            checked={config.play}
            onChange={(e) => onChange({ ...config, play: e.target.checked })}
            className="size-4 accent-[var(--ld-color-floodlight-400)]"
          />
        </label>
        <p className="text-xs text-chalk-muted">
          {config.play ? t('prematch.playHint') : t('prematch.autoHint')}
        </p>
      </div>
      <div className="flex justify-center">
        <Button primary onClick={onStart}>
          {t('prematch.start')}
        </Button>
      </div>
    </Panel>
  );
}

/** Statistics of both teams (possession, shots, expected goals, discipline). */
export function StatsTable({
  result,
  names,
}: {
  result: sim.MatchResult;
  names: readonly [string, string];
}) {
  const t = useTranslations('match');
  const [a, b] = result.stats;
  const rows: [string, string | number, string | number][] = [
    [
      t('stats.possession'),
      `${pct(a.possession, b.possession)} %`,
      `${pct(b.possession, a.possession)} %`,
    ],
    [t('stats.shots'), a.shots, b.shots],
    [t('stats.onTarget'), a.onTarget, b.onTarget],
    [t('stats.xg'), a.xg.toFixed(1), b.xg.toFixed(1)],
    [
      t('stats.passes'),
      `${pct(a.passesCompleted, a.passes - a.passesCompleted)} %`,
      `${pct(b.passesCompleted, b.passes - b.passesCompleted)} %`,
    ],
    [t('stats.corners'), a.corners, b.corners],
    [t('stats.fouls'), a.fouls, b.fouls],
    [t('stats.cards'), `${a.yellows} / ${a.reds}`, `${b.yellows} / ${b.reds}`],
  ];
  return (
    <table className="w-full table-fixed text-sm" aria-label={t('stats.title')}>
      <thead>
        <tr className="text-xs text-chalk-muted">
          <th className="w-1/4 truncate text-left font-medium" title={names[0]}>
            <span className="sm:hidden">{teamCode(names[0])}</span>
            <span className="hidden sm:inline">{names[0]}</span>
          </th>
          <th />
          <th className="w-1/4 truncate text-right font-medium" title={names[1]}>
            <span className="sm:hidden">{teamCode(names[1])}</span>
            <span className="hidden sm:inline">{names[1]}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, x, y]) => (
          <tr key={label} className="border-t border-chalk/10">
            <td className="py-1 font-mono">{x}</td>
            <td className="py-1 text-center text-xs text-chalk-muted">{label}</td>
            <td className="py-1 text-right font-mono">{y}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Half-time: stats, tactic, substitutions. Changes are recorded as inputs of the match. */
export function HalfTime({
  matchSim,
  setup,
  onResume,
}: {
  matchSim: sim.MatchSim;
  setup: sim.MatchSetup;
  onResume: () => void;
}) {
  const t = useTranslations('match');
  const [, refresh] = useState(0);
  const tactic = matchSim.tacticOf(SIDE);
  const lineup = matchSim.lineup(SIDE).filter((_, i) => !matchSim.sentOffSlots(SIDE)[i]);
  const bench = matchSim.benchOf(SIDE);
  const [out, setOut] = useState(lineup[lineup.length - 1]?.id ?? '');
  const [into, setInto] = useState(bench[0]?.id ?? '');
  const result = matchSim.result();
  const apply = (next: Partial<sim.Tactic>): void => {
    matchSim.setTactic(SIDE, { ...tactic, ...next });
    refresh((n) => n + 1);
  };
  return (
    <Panel title={t('halftime.title')}>
      <p className="text-center font-mono text-2xl text-floodlight-300">
        {result.score[0]} – {result.score[1]}
      </p>
      <StatsTable result={result} names={[setup.home.name, setup.away.name]} />
      <div className="space-y-2">
        <Choice
          label={t('prematch.style')}
          value={tactic.style}
          options={PLAY_STYLES}
          format={(s) => t(`style.${s}`)}
          onChange={(style) => apply({ style })}
        />
        <Choice
          label={t('prematch.mentality')}
          value={tactic.mentality}
          options={[-2, -1, 0, 1, 2] as const}
          format={(m) => t(`mentality.${m}`)}
          onChange={(mentality) => apply({ mentality })}
        />
        <Choice
          label={t('halftime.pressing')}
          value={tactic.pressing}
          options={[1, 2, 3, 4, 5] as const}
          format={(n) => String(n)}
          onChange={(pressing) => apply({ pressing })}
        />
        <Choice
          label={t('halftime.line')}
          value={tactic.lineHeight}
          options={[1, 2, 3, 4, 5] as const}
          format={(n) => String(n)}
          onChange={(lineHeight) => apply({ lineHeight })}
        />
      </div>
      <div className="space-y-2 rounded-md border border-chalk/10 p-3">
        <p className="text-xs text-chalk-muted">
          {t('halftime.subs', { left: matchSim.subsLeft(SIDE) })}
        </p>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-sm">
          <select
            aria-label={t('halftime.out')}
            value={out}
            onChange={(e) => setOut(e.target.value)}
            className="w-full min-w-0 truncate rounded-md border border-chalk/20 bg-pitch-950 px-2 py-1"
          >
            {lineup.map((p) => (
              <option key={p.id} value={p.id}>
                {p.number} · {p.name} ({p.positions[0]})
              </option>
            ))}
          </select>
          <span aria-hidden>→</span>
          <select
            aria-label={t('halftime.in')}
            value={into}
            onChange={(e) => setInto(e.target.value)}
            className="w-full min-w-0 truncate rounded-md border border-chalk/20 bg-pitch-950 px-2 py-1"
          >
            {bench.map((p) => (
              <option key={p.id} value={p.id}>
                {p.number} · {p.name} ({p.positions[0]})
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-center">
          <Button
            disabled={!out || !into || matchSim.subsLeft(SIDE) === 0}
            onClick={() => {
              if (matchSim.substitute(SIDE, out, into)) {
                const nextBench = matchSim.benchOf(SIDE);
                setInto(nextBench[0]?.id ?? '');
                setOut(matchSim.lineup(SIDE)[10]?.id ?? '');
                refresh((n) => n + 1);
              }
            }}
          >
            {t('halftime.substitute')}
          </Button>
        </div>
      </div>
      <div className="flex justify-center">
        <Button primary onClick={onResume}>
          {t('halftime.resume')}
        </Button>
      </div>
    </Panel>
  );
}

/** Full time: score, stats, ratings, man of the match, and the replay check. */
export function FullTime({
  matchSim,
  setup,
  config,
  onAgain,
}: {
  matchSim: sim.MatchSim;
  setup: sim.MatchSetup;
  config: MatchConfig;
  onAgain: () => void;
}) {
  const t = useTranslations('match');
  const result = matchSim.result();
  const ratings = sim.matchRatings(setup, result);
  const [replayed, setReplayed] = useState<readonly [number, number] | null>(null);
  const top = (side: 0 | 1) =>
    ratings.players
      .filter((p) => p.side === side && p.minutes > 0)
      .sort((x, y) => y.rating - x.rating)
      .slice(0, 3);
  const motm = ratings.manOfTheMatch;
  const won =
    result.score[0] > result.score[1] ? 'win' : result.score[0] < result.score[1] ? 'loss' : 'draw';
  return (
    <Panel title={t(`fulltime.${won}`)}>
      <p className="text-center font-mono text-3xl text-floodlight-300">
        {result.score[0]} – {result.score[1]}
      </p>
      <StatsTable result={result} names={[setup.home.name, setup.away.name]} />
      {motm && (
        <p className="rounded-md bg-floodlight-400/15 px-3 py-2 text-center text-sm">
          {t('fulltime.motm', { player: motm.name, rating: motm.rating.toFixed(1) })}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 text-xs">
        {([0, 1] as const).map((side) => (
          <ol key={side} className="space-y-0.5">
            {top(side).map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span className="truncate">
                  {p.number} · {p.name}
                  {p.goals > 0 ? ` ⚽${p.goals > 1 ? `×${p.goals}` : ''}` : ''}
                </span>
                <span className="font-mono text-floodlight-300">{p.rating.toFixed(1)}</span>
              </li>
            ))}
          </ol>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          onClick={() => {
            const again = sim.replayMatch(
              setup,
              { userSide: config.play ? SIDE : null, pauseAtHalfTime: true },
              matchSim.inputs,
            );
            setReplayed(again.score);
          }}
        >
          {t('fulltime.replay')}
        </Button>
        <Button primary onClick={onAgain}>
          {t('fulltime.again')}
        </Button>
      </div>
      {replayed && (
        <p className="text-center text-xs text-chalk-muted" role="status">
          {replayed[0] === result.score[0] && replayed[1] === result.score[1]
            ? t('fulltime.replayOk', { score: `${replayed[0]}–${replayed[1]}` })
            : t('fulltime.replayKo')}
        </p>
      )}
    </Panel>
  );
}
