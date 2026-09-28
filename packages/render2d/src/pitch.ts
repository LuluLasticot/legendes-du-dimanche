// Top-down match view (GDD §7.1): pitch with the IFAB markings, 22 tokens in the kit colours
// with their numbers, the ball and the pass in flight. The engine gives targets (team shapes,
// ball); the view eases the tokens towards them. Portrait on phones (home attacks up in the
// first half), landscape on wide screens. Imperative API: mount → render(frame) → dispose.

import { sim } from '@legendes/engine';
import { Application, Container, Graphics, Text } from 'pixi.js';
import type { PlaybackFrame } from './playback.ts';

type Point = sim.Point;

export interface TeamLook {
  readonly formation: sim.Formation;
  readonly tactic: sim.Tactic;
  readonly colours: { readonly shirt: string; readonly shorts: string; readonly number: string };
  /** Player ids on the pitch, by formation slot (update after substitutions). */
  readonly ids: readonly string[];
  readonly numbers: readonly number[];
  /** Slots of sent-off players (their token leaves the pitch). */
  readonly sentOff?: readonly boolean[];
}

export interface Pitch2DHandle {
  setTeams(teams: readonly [TeamLook, TeamLook]): void;
  /** Target state to show (called every frame by the match screen). */
  render(frame: PlaybackFrame): void;
  readonly stats: { fps: number };
  dispose(): void;
}

const LENGTH = 105;
const WIDTH = 68;
const GRASS = 0x1f5a2c;
const STRIPE = 0x236433;
const LINE = 0xf4f1e8;

interface Token {
  readonly view: Container;
  readonly disc: Graphics;
  readonly label: Text;
  x: number;
  y: number;
}

export async function mountPitch2D(
  host: HTMLElement,
  initial: readonly [TeamLook, TeamLook],
): Promise<Pitch2DHandle> {
  const app = new Application();
  await app.init({
    resizeTo: host,
    antialias: true,
    background: '#0b1a12',
    autoDensity: true,
    resolution: Math.min(2, globalThis.devicePixelRatio || 1),
  });
  host.appendChild(app.canvas);

  const pitch = new Graphics();
  const arrow = new Graphics();
  const tokensLayer = new Container();
  const ballView = new Graphics();
  const highlight = new Graphics();
  app.stage.addChild(pitch, arrow, highlight, tokensLayer, ballView);

  let teams = initial;
  let frame: PlaybackFrame | null = null;
  // Screen mapping, recomputed on resize.
  let layout = { left: 0, top: 0, w: 1, h: 1, portrait: true, unit: 1 };

  const toScreen = (p: Point): { x: number; y: number } =>
    layout.portrait
      ? { x: layout.left + p.x * layout.w, y: layout.top + (1 - p.y) * layout.h }
      : { x: layout.left + p.y * layout.w, y: layout.top + p.x * layout.h };

  const drawPitch = (): void => {
    const W = app.screen.width;
    const H = app.screen.height;
    const portrait = H >= W;
    const along = portrait ? H : W;
    const across = portrait ? W : H;
    // Fit 105 × 68 with a margin.
    const unit = Math.min((along * 0.94) / LENGTH, (across * 0.9) / WIDTH);
    const w = (portrait ? WIDTH : LENGTH) * unit;
    const h = (portrait ? LENGTH : WIDTH) * unit;
    layout = { left: (W - w) / 2, top: (H - h) / 2, w, h, portrait, unit };

    pitch.clear();
    pitch.rect(layout.left, layout.top, w, h).fill(GRASS);
    for (let i = 0; i < 12; i += 2) {
      // Mowing stripes across the pitch.
      const a = toScreen({ x: 0, y: i / 12 });
      const b = toScreen({ x: 1, y: (i + 1) / 12 });
      pitch
        .rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
        .fill(STRIPE);
    }
    const line = { width: Math.max(1, unit * 0.12), color: LINE, alpha: 0.9 };
    const m = (x: number, y: number): { x: number; y: number } =>
      toScreen({ x: x / WIDTH, y: y / LENGTH });
    const rect = (x0: number, y0: number, x1: number, y1: number): void => {
      const a = m(x0, y0);
      const b = m(x1, y1);
      pitch.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    };
    rect(0, 0, WIDTH, LENGTH);
    const half = [m(0, LENGTH / 2), m(WIDTH, LENGTH / 2)] as const;
    pitch.moveTo(half[0].x, half[0].y).lineTo(half[1].x, half[1].y);
    const centre = m(WIDTH / 2, LENGTH / 2);
    pitch.circle(centre.x, centre.y, 9.15 * unit);
    for (const end of [0, LENGTH]) {
      const dir = end === 0 ? 1 : -1;
      rect(WIDTH / 2 - 20.16, end, WIDTH / 2 + 20.16, end + dir * 16.5);
      rect(WIDTH / 2 - 9.16, end, WIDTH / 2 + 9.16, end + dir * 5.5);
      rect(WIDTH / 2 - 3.66, end, WIDTH / 2 + 3.66, end - dir * 1.5);
    }
    pitch.stroke(line);
    for (const end of [11, LENGTH - 11]) {
      const s = m(WIDTH / 2, end);
      pitch.circle(s.x, s.y, unit * 0.3).fill(LINE);
    }
    pitch.circle(centre.x, centre.y, unit * 0.3).fill(LINE);
  };

  const tokens: Token[][] = [[], []];
  const buildTokens = (): void => {
    tokensLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    teams.forEach((team, side) => {
      tokens[side] = team.numbers.map((n) => {
        const view = new Container();
        const disc = new Graphics();
        const label = new Text({
          text: String(n),
          style: {
            fontFamily: 'system-ui, sans-serif',
            fontWeight: '700',
            fontSize: 12,
            fill: team.colours.number,
          },
        });
        label.anchor.set(0.5);
        view.addChild(disc, label);
        tokensLayer.addChild(view);
        return { view, disc, label, x: 0.5, y: side === 0 ? 0.3 : 0.7 };
      });
    });
    styleTokens();
  };

  const styleTokens = (): void => {
    const r = Math.max(6, layout.unit * 1.25);
    teams.forEach((team, side) => {
      (tokens[side] ?? []).forEach((t, i) => {
        t.disc.clear();
        t.disc
          .circle(0, 0, r)
          .fill(team.colours.shirt)
          .stroke({ width: Math.max(1, r * 0.12), color: team.colours.shorts });
        t.label.text = String(team.numbers[i] ?? '');
        t.label.style.fontSize = Math.round(r * 1.05);
        t.view.visible = !team.sentOff?.[i];
      });
    });
  };

  const onResize = (): void => {
    drawPitch();
    styleTokens();
  };
  app.renderer.on('resize', onResize);
  drawPitch();
  buildTokens();

  const stats = { fps: 0 };
  app.ticker.add((ticker) => {
    stats.fps = ticker.FPS;
    if (!frame) return;
    const f = frame;
    const dt = Math.min(0.1, ticker.deltaMS / 1000);
    const k = 1 - Math.exp(-dt * 5);
    const second = f.half === 2;
    highlight.clear();
    teams.forEach((team, index) => {
      const side = index as sim.Side;
      const home = side === 0;
      const inPossession = f.possession === side;
      const ball = sim.toTeamFrame(f.ball, home, second);
      const shape = sim.teamShape(team.formation, team.tactic, ball, inPossession);
      (tokens[side] ?? []).forEach((t, i) => {
        const target =
          team.ids[i] === f.carrier ? f.ball : sim.toAbsolute(shape[i] as Point, home, second);
        t.x += (target.x - t.x) * k;
        t.y += (target.y - t.y) * k;
        const s = toScreen(t);
        t.view.position.set(s.x, s.y);
        if (team.ids[i] === f.carrier) {
          highlight
            .circle(s.x, s.y, Math.max(8, layout.unit * 1.9))
            .stroke({ width: 2, color: 0xffd166, alpha: 0.9 });
        }
      });
    });
    const b = toScreen(f.ball);
    ballView.clear();
    ballView
      .circle(b.x + 1.5, b.y + 1.5, Math.max(3, layout.unit * 0.55))
      .fill({ color: 0, alpha: 0.35 });
    ballView.circle(b.x, b.y, Math.max(3, layout.unit * 0.55)).fill(0xffffff);
    arrow.clear();
    if (f.pass) {
      const a = toScreen(f.pass.from);
      const c = toScreen(f.pass.to);
      arrow
        .moveTo(a.x, a.y)
        .lineTo(c.x, c.y)
        .stroke({
          width: Math.max(1.5, layout.unit * 0.25),
          color: 0xffd166,
          alpha: 0.55 * (1 - f.pass.progress * 0.6),
        });
    }
  });

  return {
    stats,
    setTeams(next) {
      const rebuild = next.some((t, i) => t.numbers.length !== teams[i]?.numbers.length);
      teams = next;
      if (rebuild) buildTokens();
      else styleTokens();
    },
    render(next) {
      frame = next;
    },
    dispose() {
      app.renderer.off('resize', onResize);
      app.destroy({ removeView: true }, { children: true });
    },
  };
}
