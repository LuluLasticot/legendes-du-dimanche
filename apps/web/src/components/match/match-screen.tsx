'use client';

import { commentary, sim } from '@legendes/engine';
import type { MatchAudio } from '@legendes/render3d/audio';
import type { Phase, Pitch2DHandle, Stoppage, TeamLook, Timeline } from '@legendes/render2d';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildSetup, DEFAULT_CONFIG, SIDE, type MatchConfig } from './match-config';
import { MatchSounds } from './match-sound';
import { MomentPlayer } from './moment-player';
import { FullTime, HalfTime, PreMatch } from './panels';

type Stage = 'prematch' | 'playing' | 'moment' | 'halftime' | 'fulltime';

const SPEEDS = [1, 2, 3, 6] as const;
/** Fastest playback the URL may ask for (QA and end-to-end tests). */
const MAX_SPEED = 60;

/** Monotonic key over both halves (the clock of the second half restarts at 45:00). */
const key = (half: 1 | 2, t: number): number => (half === 1 ? t : 1e5 + t);

/** Everything a running match needs, kept out of React state (it changes every frame). */
interface Runtime {
  readonly setup: sim.MatchSetup;
  readonly match: sim.MatchSim;
  readonly timeline: Timeline;
  teams: [TeamLook, TeamLook];
  /** Display seconds played so far. */
  display: number;
  pushed: number;
  eventIndex: number;
  comments: commentary.CommentLine[];
}

interface Hud {
  half: 1 | 2;
  t: number;
  phase: Phase;
  possession: sim.Side;
  stoppage: Stoppage;
  stoppageProgress: number;
  score: [number, number];
  spoken: commentary.CommentLine[];
}

const INITIAL_HUD: Hud = {
  half: 1,
  t: 0,
  phase: 'kickoff',
  possession: 0,
  stoppage: null,
  stoppageProgress: 0,
  score: [0, 0],
  spoken: [],
};

const look = (team: sim.MatchTeam): TeamLook => ({
  formation: team.formation,
  tactic: team.tactic,
  colours: team.colours,
  ids: [...team.lineup],
  numbers: team.lineup.map((id) => sim.playerById(team, id).number),
});

/**
 * The match (Phase 2): pre-match, the 2D match at a watchable speed, key moments played in 3D,
 * half-time changes, full time. The simulation is the source of truth; this component drives
 * it phase by phase, feeds the display timeline and hands the 3D outcomes back.
 */
export function MatchScreen() {
  const t = useTranslations('match');
  const speaker = useTranslations('commentary');
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [config, setConfig] = useState<MatchConfig>(DEFAULT_CONFIG);
  const [stage, setStageState] = useState<Stage>('prematch');
  const stageRef = useRef<Stage>('prematch');
  const [runId, setRunId] = useState(0);
  const [speed, setSpeed] = useState<number>(2);
  const speedRef = useRef(speed);
  const [request, setRequest] = useState<sim.MomentRequest | null>(null);
  const [hud, setHud] = useState<Hud>(INITIAL_HUD);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // Sounds: the audio context needs a gesture to start, so it is created on the first tap.
  const audioRef = useRef<MatchAudio | null>(null);
  const [sound, setSound] = useState(true);
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);
  // Loaded up front so that unlocking is synchronous inside the tap (iOS needs that).
  useEffect(() => {
    let cancelled = false;
    void import('@legendes/render3d/audio').then(({ MatchAudio: Audio }) => {
      if (!cancelled) audioRef.current = new Audio();
    });
    return () => {
      cancelled = true;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);
  const unlockAudio = useCallback((): void => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.setEnabled(soundRef.current);
    audio.unlock();
    if (stageRef.current === 'playing' && soundRef.current) audio.startMurmur();
  }, []);

  // The stand murmurs while the 2D match plays; the 3D moment has its own sounds.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.setEnabled(sound);
    if (stage === 'playing' && sound) audio.startMurmur();
    else audio.stopMurmur();
  }, [stage, sound]);

  const go = useCallback((next: Stage) => {
    stageRef.current = next;
    setStageState(next);
  }, []);

  /** Plays the simulation on until it needs the player (or is over) and lays the new actions out. */
  const advance = useCallback((rt: Runtime): void => {
    const m = rt.match;
    while (m.step()) {
      if (m.waiting) break;
    }
    const result = m.result();
    rt.timeline.push(result.actions.slice(rt.pushed));
    rt.pushed = result.actions.length;
    if (m.over) rt.timeline.finish();
    rt.comments = commentary.commentate(rt.setup, result);
  }, []);

  const start = useCallback(
    async (cfg: MatchConfig): Promise<void> => {
      unlockAudio();
      const { Timeline: TimelineImpl } = await import('@legendes/render2d');
      const setup = buildSetup(cfg);
      const match = new sim.MatchSim(setup, {
        userSide: cfg.play ? SIDE : null,
        pauseAtHalfTime: true,
      });
      const rt: Runtime = {
        setup,
        match,
        timeline: new TimelineImpl(),
        teams: [look(setup.home), look(setup.away)],
        display: 0,
        pushed: 0,
        eventIndex: 0,
        comments: [],
      };
      advance(rt);
      runtimeRef.current = rt;
      setRuntime(rt);
      setHud(INITIAL_HUD);
      setRunId((n) => n + 1);
      go('playing');
    },
    [advance, go, unlockAudio],
  );

  // Lab controls in the URL: ?seed=N, ?speed=K, ?auto=1 (straight to kick-off, moments by the coach).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const seed = Number(q.get('seed')) || DEFAULT_CONFIG.seed;
    const speedParam = Number(q.get('speed'));
    const auto = q.has('auto');
    const id = requestAnimationFrame(() => {
      const next = { ...DEFAULT_CONFIG, seed, play: !auto };
      setConfig(next);
      if (speedParam >= 1 && speedParam <= MAX_SPEED) setSpeed(speedParam);
      if (auto) void start(next);
    });
    return () => cancelAnimationFrame(id);
  }, [start]);

  // The 2D pitch and its loop live as long as a match does.
  useEffect(() => {
    const rt = runtimeRef.current;
    const host = hostRef.current;
    if (!rt || !host || runId === 0) return;
    let handle: Pitch2DHandle | null = null;
    let raf = 0;
    let cancelled = false;

    void import('@legendes/render2d').then(async ({ mountPitch2D }) => {
      if (cancelled) return;
      handle = await mountPitch2D(host, rt.teams);
      if (cancelled) {
        handle.dispose();
        return;
      }
      let last = performance.now();
      let uiTimer = 0;
      const sounds = audioRef.current
        ? new MatchSounds(audioRef.current, rt.setup.conditions.surface, SIDE)
        : null;
      const loop = (now: number): void => {
        raf = requestAnimationFrame(loop);
        const dtReal = Math.min(0.1, Math.max(0, (now - last) / 1000));
        last = now;
        if (stageRef.current !== 'playing' || !handle) return;
        const dt = dtReal * speedRef.current;
        rt.display = Math.min(rt.timeline.duration, rt.display + dt);
        const cursor = rt.timeline.locate(rt.display);
        if (!cursor) return;
        const clock = rt.timeline.clock(cursor);
        const nowKey = key(clock.half, clock.t);
        // Substitutions and red cards change who is on the pitch, when they happen.
        const events = rt.match.result().events;
        while (rt.eventIndex < events.length) {
          const e = events[rt.eventIndex] as sim.MatchEvent;
          if (key(e.half, e.t) > nowKey) break;
          rt.eventIndex++;
          sounds?.event(e, speedRef.current);
          if (e.kind !== 'sub' && e.kind !== 'red') continue;
          const team = e.team === 0 ? rt.setup.home : rt.setup.away;
          rt.teams = rt.teams.map((tl, side) => {
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
          handle.setTeams(rt.teams);
        }
        sounds?.update(cursor, speedRef.current);
        const frame = handle.render(dt, cursor, clock);
        uiTimer += dtReal;
        if (uiTimer > 0.1) {
          uiTimer = 0;
          let a = 0;
          let b = 0;
          for (const e of events) {
            if (e.kind !== 'goal' || key(e.half, e.t) > nowKey) continue;
            if (e.team === 0) a++;
            else b++;
          }
          setHud({
            half: clock.half,
            t: clock.t,
            phase: frame.phase,
            possession: frame.possession,
            stoppage: frame.stoppage,
            stoppageProgress: frame.stoppageProgress,
            score: [a, b],
            spoken: rt.comments
              .filter((c) => key(c.half, c.t) <= nowKey)
              .slice(-4)
              .reverse(),
          });
        }
        // Played everything the simulation has produced so far: what does it wait for?
        if (rt.display >= rt.timeline.duration - 1e-6) {
          if (rt.match.over) go('fulltime');
          else if (rt.match.waiting === 'moment') {
            setRequest(rt.match.pendingMoment);
            go('moment');
          } else if (rt.match.waiting === 'half-time') go('halftime');
        }
      };
      raf = requestAnimationFrame(loop);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      handle?.dispose();
    };
  }, [runId, go]);

  const rt = runtime;

  /** The 3D moment (or the coach) has an outcome: back to the simulation. */
  const resolve = useCallback(
    (outcome: sim.ShotOutcome): void => {
      const current = runtimeRef.current;
      if (!current || stageRef.current !== 'moment') return;
      current.match.resolveMoment(outcome);
      advance(current);
      setRequest(null);
      go('playing');
    },
    [advance, go],
  );

  const resumeSecondHalf = (): void => {
    const current = runtimeRef.current;
    if (!current) return;
    current.match.resumeSecondHalf();
    advance(current);
    go('playing');
  };

  const minute = Math.floor(hud.t / 60) + 1;
  const setup = rt?.setup;
  const showBanner =
    hud.stoppage !== null &&
    hud.stoppage !== 'kickoff' &&
    hud.stoppageProgress > 0.04 &&
    hud.stoppageProgress < 0.9;
  const teamName = (side: sim.Side): string =>
    setup ? (side === 0 ? setup.home.name : setup.away.name) : '';

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden" onPointerDownCapture={unlockAudio}>
      <div ref={hostRef} className="absolute inset-0" />

      {stage !== 'prematch' && setup && (
        <>
          <div className="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
            <div className="flex items-center gap-3 rounded-md bg-pitch-950/80 px-4 py-2 font-semibold text-chalk backdrop-blur-sm">
              <span className="text-sm">{setup.home.name}</span>
              <span className="font-mono text-lg text-floodlight-300" data-testid="score">
                {hud.score[0]} – {hud.score[1]}
              </span>
              <span className="text-sm">{setup.away.name}</span>
              <span className="font-mono text-xs text-chalk-muted" data-testid="minute">
                {minute}&apos;
              </span>
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
            {hud.spoken.map((line, i) => (
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
            <button
              type="button"
              onClick={() => setSound((on) => !on)}
              aria-pressed={sound}
              aria-label={t(sound ? 'sound.on' : 'sound.off')}
              title={t(sound ? 'sound.on' : 'sound.off')}
              className="rounded-pill px-2.5 py-1 text-xs text-chalk"
            >
              {sound ? '🔊' : '🔇'}
            </button>
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                aria-pressed={speed === s}
                className={`rounded-pill px-3 py-1 text-xs font-semibold ${
                  speed === s ? 'bg-floodlight-400 text-pitch-950' : 'text-chalk'
                }`}
              >
                ×{s}
              </button>
            ))}
          </div>
        </>
      )}

      {stage === 'prematch' && (
        <PreMatch config={config} onChange={setConfig} onStart={() => void start(config)} />
      )}
      {stage === 'moment' && request && rt && (
        <MomentPlayer
          request={request}
          conditions={rt.setup.conditions}
          onDone={resolve}
          onAuto={() => resolve(sim.autoResolveMoment(request, rt.setup.conditions))}
        />
      )}
      {stage === 'halftime' && rt && (
        <HalfTime matchSim={rt.match} setup={rt.setup} onResume={resumeSecondHalf} />
      )}
      {stage === 'fulltime' && rt && (
        <FullTime
          matchSim={rt.match}
          setup={rt.setup}
          config={config}
          onAgain={() => {
            runtimeRef.current = null;
            setRuntime(null);
            setConfig((c) => ({ ...c, seed: c.seed + 1 }));
            go('prematch');
            setRunId(0);
          }}
        />
      )}
    </div>
  );
}
