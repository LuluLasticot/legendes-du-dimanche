'use client';

import { commentary, sim } from '@legendes/engine';
import type { Phase, Pitch2DHandle, Stoppage, TeamLook } from '@legendes/render2d';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

const SPEEDS = [1, 2, 3, 6] as const;

interface Hud {
  half: 1 | 2;
  t: number;
  phase: Phase;
  possession: sim.Side;
  stoppage: Stoppage;
  stoppageProgress: number;
}

const key = (half: 1 | 2, t: number): number => (half === 1 ? t : 1e5 + t);

/** Demo match (Phase 2 lab): the engine's timeline choreographed on the 2D pitch. */
export function MatchView() {
  const t = useTranslations('lab.match');
  const speaker = useTranslations('commentary');
  const hostRef = useRef<HTMLDivElement>(null);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const speedRef = useRef(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  const [hud, setHud] = useState<Hud>({
    half: 1,
    t: 0,
    phase: 'kickoff',
    possession: 0,
    stoppage: null,
    stoppageProgress: 0,
  });

  // Lab controls in the URL: ?seed=N (another match), ?at=S (start S display seconds in),
  // ?speed=K (playback speed).
  const [params, setParams] = useState({ seed: 1, at: 0 });
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const speedParam = Number(q.get('speed'));
    const id = requestAnimationFrame(() => {
      if ((SPEEDS as readonly number[]).includes(speedParam))
        setSpeed(speedParam as (typeof SPEEDS)[number]);
      setParams({ seed: Number(q.get('seed')) || 1, at: Number(q.get('at')) || 0 });
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const match = useMemo(() => {
    const setup: sim.MatchSetup = {
      seed: params.seed,
      home: sim.demoTeam(params.seed, {
        id: 'fca',
        name: 'FC Avesnes-le-Sec',
        rating: 58,
        colours: { shirt: '#f4f1e8', shorts: '#0f5132', number: '#0f5132' },
      }),
      away: sim.demoTeam(params.seed + 1, {
        id: 'uss',
        name: 'US Saint-Amand',
        rating: 56,
        formation: '4-3-3',
        colours: { shirt: '#c4302b', shorts: '#f2f2ee', number: '#f2f2ee' },
      }),
      conditions: { surface: 'grass', rain: false, windSpeed: 0, windDirection: 0 },
    };
    return { setup, result: sim.simulateMatch(setup) };
  }, [params.seed]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let handle: Pitch2DHandle | null = null;
    let raf = 0;
    let cancelled = false;
    const { setup, result } = match;
    const look = (team: sim.MatchTeam): TeamLook => ({
      formation: team.formation,
      tactic: team.tactic,
      colours: team.colours,
      ids: [...team.lineup],
      numbers: team.lineup.map((id) => sim.playerById(team, id).number),
    });
    let teams: [TeamLook, TeamLook] = [look(setup.home), look(setup.away)];
    const changes = result.events.filter((e) => e.kind === 'sub' || e.kind === 'red');
    let applied = 0;

    void import('@legendes/render2d').then(async ({ mountPitch2D, Timeline }) => {
      if (cancelled) return;
      handle = await mountPitch2D(host, teams);
      if (cancelled) {
        handle.dispose();
        return;
      }
      const timeline = new Timeline(result.actions, { final: true });
      let display = params.at;
      let last = performance.now();
      let uiTimer = 0;
      const loop = (now: number): void => {
        const dtReal = Math.min(0.1, Math.max(0, (now - last) / 1000));
        last = now;
        const dt = dtReal * speedRef.current;
        display = Math.min(timeline.duration, display + dt);
        const cursor = timeline.locate(display);
        if (cursor && handle) {
          const clock = timeline.clock(cursor);
          const now2 = key(clock.half, clock.t);
          // Substitutions and red cards change who is on the pitch.
          while (
            applied < changes.length &&
            key(changes[applied]?.half ?? 1, changes[applied]?.t ?? 0) <= now2
          ) {
            const e = changes[applied++] as sim.MatchEvent;
            const team = e.team === 0 ? setup.home : setup.away;
            teams = teams.map((tl, side) => {
              if (side !== e.team) return tl;
              const slot = tl.ids.indexOf(e.kind === 'sub' ? (e.other ?? '') : (e.player ?? ''));
              if (slot < 0) return tl;
              if (e.kind === 'red') {
                const sentOff = [...(tl.sentOff ?? tl.ids.map(() => false))];
                sentOff[slot] = true;
                return { ...tl, sentOff };
              }
              const ids = [...tl.ids];
              const numbers = [...tl.numbers];
              ids[slot] = e.player ?? '';
              numbers[slot] = sim.playerById(team, e.player ?? '').number;
              return { ...tl, ids, numbers };
            }) as [TeamLook, TeamLook];
            handle.setTeams(teams);
          }
          const frame = handle.render(dt, cursor, clock);
          uiTimer += dtReal;
          if (uiTimer > 0.1) {
            uiTimer = 0;
            setHud({
              half: clock.half,
              t: clock.t,
              phase: frame.phase,
              possession: frame.possession,
              stoppage: frame.stoppage,
              stoppageProgress: frame.stoppageProgress,
            });
          }
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      handle?.dispose();
    };
  }, [match, params.at]);

  const { setup, result } = match;
  const seen = result.events.filter((e) => key(e.half, e.t) <= key(hud.half, hud.t));
  const score = seen.reduce<[number, number]>(
    (s, e) => (e.kind === 'goal' ? (e.team === 0 ? [s[0] + 1, s[1]] : [s[0], s[1] + 1]) : s),
    [0, 0],
  );
  const minute = Math.floor(hud.t / 60) + 1;
  // The speaker's lines up to now, latest first.
  const comments = useMemo(() => commentary.commentate(match.setup, match.result), [match]);
  const spoken = comments
    .filter((c) => key(c.half, c.t) <= key(hud.half, hud.t))
    .slice(-4)
    .reverse();
  const teamName = (side: sim.Side): string => (side === 0 ? setup.home.name : setup.away.name);
  const showBanner =
    hud.stoppage !== null &&
    hud.stoppage !== 'kickoff' &&
    hud.stoppageProgress > 0.04 &&
    hud.stoppageProgress < 0.9;

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={hostRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
        <div className="flex items-center gap-3 rounded-md bg-pitch-950/80 px-4 py-2 font-semibold text-chalk backdrop-blur-sm">
          <span className="text-sm">{setup.home.name}</span>
          <span className="font-mono text-lg text-floodlight-300">
            {score[0]} – {score[1]}
          </span>
          <span className="text-sm">{setup.away.name}</span>
          <span className="font-mono text-xs text-chalk-muted">{minute}&apos;</span>
        </div>
        <p className="rounded-pill bg-pitch-950/70 px-3 py-0.5 text-[11px] text-chalk-muted backdrop-blur-sm">
          {teamName(hud.possession)} · {t(`phase.${hud.phase}`)}
        </p>
        {showBanner && hud.stoppage && (
          <p
            className={`rounded-md px-4 py-1.5 text-center font-semibold backdrop-blur-sm ${
              hud.stoppage === 'goal'
                ? 'bg-floodlight-400 text-lg text-pitch-950'
                : 'bg-pitch-950/85 text-sm text-floodlight-300'
            }`}
          >
            {t(`stoppage.${hud.stoppage}`)}
          </p>
        )}
      </div>
      <ol className="pointer-events-none absolute bottom-16 left-3 w-[min(24rem,calc(100%-1.5rem))] space-y-1 text-xs text-chalk">
        {spoken.map((line, i) => (
          <li
            key={`${line.half}-${line.t}-${line.key}`}
            className={`rounded px-2 py-1 backdrop-blur-sm ${
              i === 0 ? 'bg-pitch-950/85 text-[13px]' : 'bg-pitch-950/60 opacity-80'
            } ${line.category.startsWith('goal') && line.category !== 'goal-kick' ? 'text-floodlight-300' : ''}`}
          >
            <span className="mr-2 font-mono text-chalk-muted">
              {Math.floor(line.t / 60) + 1}&apos;
            </span>
            {speaker(
              line.key as Parameters<typeof speaker>[0],
              line.params as Record<string, string | number>,
            )}
          </li>
        ))}
      </ol>
      <div className="absolute right-3 bottom-4 flex gap-1 rounded-pill bg-pitch-950/70 p-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            aria-pressed={speed === s}
            className={`rounded-pill px-3 py-1 text-xs font-semibold ${speed === s ? 'bg-floodlight-400 text-pitch-950' : 'text-chalk'}`}
          >
            ×{s}
          </button>
        ))}
      </div>
    </div>
  );
}
