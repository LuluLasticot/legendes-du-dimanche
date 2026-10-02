import { sim } from '@legendes/engine';
import { describe, expect, it } from 'vitest';
import { Choreographer, type TeamLook } from '../src/choreo.ts';
import { Timeline, clockKey } from '../src/timeline.ts';

const setup: sim.MatchSetup = {
  seed: 4,
  home: sim.demoTeam(4, { id: 'home', name: 'Home', rating: 60 }),
  away: sim.demoTeam(5, { id: 'away', name: 'Away', rating: 60, formation: '4-3-3' }),
  conditions: { surface: 'grass', rain: false, windSpeed: 0, windDirection: 0 },
};
const result = sim.simulateMatch(setup);
const look = (team: sim.MatchTeam): TeamLook => ({
  formation: team.formation,
  tactic: team.tactic,
  colours: team.colours,
  ids: [...team.lineup],
  numbers: team.lineup.map((id) => sim.playerById(team, id).number),
});
const looks = [look(setup.home), look(setup.away)] as const;

describe('timeline', () => {
  const timeline = new Timeline(result.actions, { final: true });

  it('lays out every action, with a celebration per goal and the half-time', () => {
    expect(timeline.length).toBe(result.actions.length);
    const goals = timeline.segments.filter((s) => s.kind === 'celebration').length;
    expect(goals).toBe(result.score[0] + result.score[1]);
    expect(timeline.segments.filter((s) => s.kind === 'half-time')).toHaveLength(1);
    expect(timeline.segments.at(-1)?.kind).toBe('full-time');
  });

  it('is watchable: minutes, not hours, at ×1', () => {
    expect(timeline.duration).toBeGreaterThan(5 * 60);
    expect(timeline.duration).toBeLessThan(25 * 60);
  });

  it('locates a display time and gives a monotonic match clock', () => {
    let last = -1;
    for (let t = 0; t < timeline.duration; t += 3) {
      const cursor = timeline.locate(t);
      expect(cursor).not.toBeNull();
      if (!cursor) continue;
      const clock = timeline.clock(cursor);
      const key = clockKey(clock.half, clock.t);
      expect(key).toBeGreaterThanOrEqual(last - 1e-6);
      last = key;
    }
  });

  it('labels the game phases: set pieces, transitions, build-up and attack', () => {
    const phases = new Set(timeline.segments.map((s) => s.phase));
    for (const p of ['buildup', 'attack', 'set-piece', 'kickoff', 'transition'])
      expect(phases.has(p as never)).toBe(true);
    const stops = new Set(timeline.segments.map((s) => s.stoppage));
    for (const s of ['throw-in', 'corner', 'goal-kick', 'free-kick'])
      expect(stops.has(s as never)).toBe(true);
  });
});

describe('choreography', () => {
  const timeline = new Timeline(result.actions, { final: true });
  const run = (
    seconds: number,
    on: (f: ReturnType<Choreographer['update']>, dt: number) => void,
  ): void => {
    const c = new Choreographer(looks);
    const dt = 1 / 30;
    for (let t = 0; t < seconds; t += dt) {
      const cursor = timeline.locate(t);
      if (!cursor) break;
      on(c.update(dt, cursor, timeline.clock(cursor)), dt);
    }
  };

  it('tokens run at human speeds and stay on the pitch', () => {
    let maxSpeed = 0;
    // Extremes over the whole run, checked once (an expect per token per frame took seconds).
    const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    const prev = new Map<string, { x: number; y: number }>();
    run(90, (f, dt) => {
      for (const t of f.tokens) {
        bounds.minX = Math.min(bounds.minX, t.x);
        bounds.maxX = Math.max(bounds.maxX, t.x);
        bounds.minY = Math.min(bounds.minY, t.y);
        bounds.maxY = Math.max(bounds.maxY, t.y);
        const p = prev.get(t.id);
        if (p) maxSpeed = Math.max(maxSpeed, Math.hypot((t.x - p.x) * 68, (t.y - p.y) * 105) / dt);
        prev.set(t.id, { x: t.x, y: t.y });
      }
    });
    expect(bounds.minX).toBeGreaterThan(-0.05);
    expect(bounds.maxX).toBeLessThan(1.05);
    expect(bounds.minY).toBeGreaterThan(-0.05);
    expect(bounds.maxY).toBeLessThan(1.05);
    // A fast-forward: sprints are quick, but nobody teleports.
    expect(maxSpeed).toBeLessThan(50);
  });

  it('the ball stays in the feet of the carrier', () => {
    let held = 0;
    let far = 0;
    run(90, (f) => {
      const carrier = f.tokens.find((t) => t.hasBall);
      if (!carrier) return;
      held++;
      if (Math.hypot((carrier.x - f.ball.x) * 68, (carrier.y - f.ball.y) * 105) > 2.5) far++;
    });
    expect(held).toBeGreaterThan(200);
    expect(far / held).toBeLessThan(0.02);
  });

  it('the shape is not frozen: full-backs push on when their side attacks', () => {
    // Compare a full-back's depth when his team builds up vs attacks (team frame).
    const tactic = setup.home.tactic;
    const slots = sim.FORMATION_SLOTS['4-4-2'];
    const rb = slots.findIndex((s) => s.position === 'RB');
    const deep = sim.teamShape('4-4-2', tactic, { x: 0.8, y: 0.25 }, true)[rb];
    const high = sim.teamShape('4-4-2', tactic, { x: 0.8, y: 0.8 }, true)[rb];
    expect(high?.y).toBeGreaterThan((deep?.y ?? 1) + 0.2);
    expect(high?.x).toBeGreaterThan(0.85); // wide, overlapping
    // A striker drops to link when the ball is deep, and runs in behind when it is high.
    const st = slots.findIndex((s) => s.position === 'ST');
    const drop = sim.teamShape('4-4-2', tactic, { x: 0.4, y: 0.3 }, true)[st];
    const behind = sim.teamShape('4-4-2', tactic, { x: 0.4, y: 0.8 }, true)[st];
    expect(behind?.y).toBeGreaterThan((drop?.y ?? 1) + 0.15);
  });
});
