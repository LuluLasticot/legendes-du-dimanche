'use client';

import { sim } from '@legendes/engine';
import type { Pitch2DHandle, TeamLook } from '@legendes/render2d';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

const SPEEDS = [1, 10, 20, 60] as const;
const HALF = 45 * 60;

type Clock = { half: 1 | 2; t: number };
const key = (c: Clock): number => (c.half === 1 ? c.t : 1e5 + c.t);

/** Demo match (Phase 2 lab): the engine's timeline played back on the 2D pitch. */
export function MatchView() {
  const t = useTranslations('lab.match');
  const hostRef = useRef<HTMLDivElement>(null);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(20);
  const speedRef = useRef(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  const [clock, setClock] = useState<Clock>({ half: 1, t: 0 });

  const match = useMemo(() => {
    const setup: sim.MatchSetup = {
      seed: 1,
      home: sim.demoTeam(1, {
        id: 'fca',
        name: 'FC Avesnes-le-Sec',
        rating: 58,
        colours: { shirt: '#f4f1e8', shorts: '#0f5132', number: '#0f5132' },
      }),
      away: sim.demoTeam(2, {
        id: 'uss',
        name: 'US Saint-Amand',
        rating: 56,
        formation: '4-3-3',
        colours: { shirt: '#c4302b', shorts: '#f2f2ee', number: '#f2f2ee' },
      }),
      conditions: { surface: 'grass', rain: false, windSpeed: 0, windDirection: 0 },
    };
    return { setup, result: sim.simulateMatch(setup) };
  }, []);

  const halfTimeAt = useMemo(
    () => match.result.events.find((e) => e.kind === 'half-time')?.t ?? HALF,
    [match],
  );

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
    const subs = result.events.filter((e) => e.kind === 'sub' || e.kind === 'red');
    let applied = 0;
    let current: Clock = { half: 1, t: 0 };

    void import('@legendes/render2d').then(async ({ mountPitch2D, MatchPlayback }) => {
      if (cancelled) return;
      handle = await mountPitch2D(host, teams);
      if (cancelled) {
        handle.dispose();
        return;
      }
      const playback = new MatchPlayback(result.actions);
      let last = performance.now();
      let uiTimer = 0;
      const loop = (now: number): void => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        let next: Clock = { half: current.half, t: current.t + dt * speedRef.current };
        if (next.half === 1 && next.t > halfTimeAt) next = { half: 2, t: HALF };
        const end = playback.end;
        if (end && key(next) > key(end)) next = end;
        current = next;
        // Substitutions and red cards change who is on the pitch.
        while (applied < subs.length && key(subs[applied] as Clock) <= key(current)) {
          const e = subs[applied++] as sim.MatchEvent;
          const team = e.team === 0 ? setup.home : setup.away;
          teams = teams.map((look, side) => {
            if (side !== e.team) return look;
            const slot = look.ids.indexOf(e.kind === 'sub' ? (e.other ?? '') : (e.player ?? ''));
            if (slot < 0) return look;
            if (e.kind === 'red') {
              const sentOff = [...(look.sentOff ?? look.ids.map(() => false))];
              sentOff[slot] = true;
              return { ...look, sentOff };
            }
            const ids = [...look.ids];
            const numbers = [...look.numbers];
            ids[slot] = e.player ?? '';
            numbers[slot] = sim.playerById(team, e.player ?? '').number;
            return { ...look, ids, numbers };
          }) as [TeamLook, TeamLook];
          handle?.setTeams(teams);
        }
        handle?.render(playback.frame(current.half, current.t));
        uiTimer += dt;
        if (uiTimer > 0.25) {
          uiTimer = 0;
          setClock(current);
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
  }, [match, halfTimeAt]);

  const { setup, result } = match;
  const seen = result.events.filter((e) => key(e) <= key(clock));
  const score = seen.reduce<[number, number]>(
    (s, e) => (e.kind === 'goal' ? (e.team === 0 ? [s[0] + 1, s[1]] : [s[0], s[1] + 1]) : s),
    [0, 0],
  );
  const minute = Math.floor(clock.t / 60) + 1;
  const name = (id: string | null): string => {
    if (!id) return '';
    const team = id.startsWith(setup.home.id) ? setup.home : setup.away;
    return sim.playerById(team, id).name;
  };
  const feed = seen
    .filter((e) =>
      [
        'goal',
        'yellow',
        'red',
        'sub',
        'injury',
        'penalty',
        'save',
        'half-time',
        'full-time',
      ].includes(e.kind),
    )
    .slice(-5)
    .reverse();

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={hostRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-md bg-pitch-950/80 px-4 py-2 font-semibold text-chalk backdrop-blur-sm">
        <span className="text-sm">{setup.home.name}</span>
        <span className="font-mono text-lg text-floodlight-300">
          {score[0]} – {score[1]}
        </span>
        <span className="text-sm">{setup.away.name}</span>
        <span className="font-mono text-xs text-chalk-muted">{minute}&apos;</span>
      </div>
      <ol className="pointer-events-none absolute bottom-16 left-3 w-[min(22rem,calc(100%-1.5rem))] space-y-1 text-xs text-chalk">
        {feed.map((e, i) => (
          <li
            key={`${e.half}-${e.t}-${i}`}
            className="rounded bg-pitch-950/70 px-2 py-1 backdrop-blur-sm"
          >
            <span className="mr-2 font-mono text-chalk-muted">
              {Math.floor(e.t / 60) + 1}&apos;
            </span>
            {t(`events.${e.kind}` as Parameters<typeof t>[0], {
              player: name(e.player),
              other: name(e.other),
            })}
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
