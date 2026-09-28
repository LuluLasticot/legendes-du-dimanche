// Top-down match view (GDD §7.1): pitch with the IFAB markings, 22 tokens in the kit colours
// with their numbers and the direction they face, the ball (with its height on long balls and
// shots) and the pass in flight. Everything that moves comes from the Choreographer; this file
// only draws it. Portrait on phones (home attacks up in the first half), landscape on wide
// screens. Imperative API: mount → render(dt, cursor, clock) → dispose.

import { Application, Container, Graphics, Text } from 'pixi.js';
import { Choreographer, type ChoreoFrame, type TeamLook } from './choreo.ts';
import type { Cursor } from './timeline.ts';

export type { TeamLook } from './choreo.ts';

export interface Pitch2DHandle {
  setTeams(teams: readonly [TeamLook, TeamLook]): void;
  /** Advances by `dt` display seconds and draws; returns what is on screen (for the HUD). */
  render(dt: number, cursor: Cursor, clock: { half: 1 | 2; t: number }): ChoreoFrame;
  readonly stats: { fps: number };
  dispose(): void;
}

const LENGTH = 105;
const WIDTH = 68;
const GRASS = 0x1f5a2c;
const STRIPE = 0x236433;
const LINE = 0xf4f1e8;

interface TokenView {
  readonly view: Container;
  readonly disc: Graphics;
  readonly wedge: Graphics;
  readonly label: Text;
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
  const ballLayer = new Graphics();
  const highlight = new Graphics();
  app.stage.addChild(pitch, arrow, highlight, tokensLayer, ballLayer);

  let teams = initial;
  const choreo = new Choreographer(initial);
  let layout = { left: 0, top: 0, w: 1, h: 1, portrait: true, unit: 1 };

  /** Normalised absolute point (x across, y along) → pixels. */
  const toScreen = (x: number, y: number): { x: number; y: number } =>
    layout.portrait
      ? { x: layout.left + x * layout.w, y: layout.top + (1 - y) * layout.h }
      : { x: layout.left + y * layout.w, y: layout.top + x * layout.h };

  const drawPitch = (): void => {
    const W = app.screen.width;
    const H = app.screen.height;
    const portrait = H >= W;
    const along = portrait ? H : W;
    const across = portrait ? W : H;
    const unit = Math.min((along * 0.94) / LENGTH, (across * 0.9) / WIDTH);
    const w = (portrait ? WIDTH : LENGTH) * unit;
    const h = (portrait ? LENGTH : WIDTH) * unit;
    layout = { left: (W - w) / 2, top: (H - h) / 2, w, h, portrait, unit };

    pitch.clear();
    pitch.rect(layout.left, layout.top, w, h).fill(GRASS);
    for (let i = 0; i < 12; i += 2) {
      const a = toScreen(0, i / 12);
      const b = toScreen(1, (i + 1) / 12);
      pitch
        .rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
        .fill(STRIPE);
    }
    const line = { width: Math.max(1, unit * 0.12), color: LINE, alpha: 0.9 };
    const m = (x: number, y: number): { x: number; y: number } => toScreen(x / WIDTH, y / LENGTH);
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

  const views: TokenView[][] = [[], []];
  const buildTokens = (): void => {
    tokensLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    teams.forEach((team, side) => {
      views[side] = team.numbers.map((n) => {
        const view = new Container();
        const disc = new Graphics();
        const wedge = new Graphics();
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
        view.addChild(wedge, disc, label);
        tokensLayer.addChild(view);
        return { view, disc, wedge, label };
      });
    });
    styleTokens();
  };

  const styleTokens = (): void => {
    const r = Math.max(6, layout.unit * 1.25);
    teams.forEach((team, side) => {
      (views[side] ?? []).forEach((t, i) => {
        t.disc.clear();
        t.disc
          .circle(0, 0, r)
          .fill(team.colours.shirt)
          .stroke({ width: Math.max(1, r * 0.12), color: team.colours.shorts });
        // Facing marker: a small wedge on the rim, pointing where he looks.
        t.wedge.clear();
        t.wedge
          .poly([-r * 0.55, -r * 0.9, r * 0.55, -r * 0.9, 0, -r * 1.7])
          .fill({ color: team.colours.shirt, alpha: 0.85 });
        t.label.text = String(team.numbers[i] ?? '');
        t.label.style.fontSize = Math.round(r * 1.05);
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
  });

  return {
    stats,
    setTeams(next) {
      const rebuild = next.some((t, i) => t.numbers.length !== teams[i]?.numbers.length);
      teams = next;
      choreo.setLooks(next);
      if (rebuild) buildTokens();
      else styleTokens();
    },
    render(dt, cursor, clock) {
      const frame = choreo.update(dt, cursor, clock);
      const r = Math.max(6, layout.unit * 1.25);
      highlight.clear();
      for (const t of frame.tokens) {
        const tv = views[t.side]?.[t.slot];
        if (!tv) continue;
        tv.view.visible = !t.off;
        const s = toScreen(t.x, t.y);
        tv.view.position.set(s.x, s.y);
        tv.wedge.rotation = layout.portrait ? t.face : t.face + Math.PI / 2;
        if (t.hasBall && !t.off) {
          highlight.circle(s.x, s.y, r * 1.5).stroke({ width: 2, color: 0xffd166, alpha: 0.9 });
        }
      }
      const b = toScreen(frame.ball.x, frame.ball.y);
      const br = Math.max(3, layout.unit * 0.5) * (1 + frame.ball.height * 0.7);
      const lift = frame.ball.height * layout.unit * 2.6;
      ballLayer.clear();
      ballLayer
        .circle(b.x + 1.5, b.y + 1.5 + lift * 0.4, Math.max(3, layout.unit * 0.5))
        .fill({ color: 0, alpha: 0.35 });
      ballLayer
        .circle(b.x, b.y - lift, br)
        .fill(0xffffff)
        .stroke({ width: 1, color: 0x222222, alpha: 0.6 });
      arrow.clear();
      if (frame.pass) {
        const a = toScreen(frame.pass.from.x, frame.pass.from.y);
        const c = toScreen(frame.pass.to.x, frame.pass.to.y);
        arrow
          .moveTo(a.x, a.y)
          .lineTo(c.x, c.y)
          .stroke({
            width: Math.max(1.5, layout.unit * 0.22),
            color: 0xffd166,
            alpha: 0.4 * (1 - frame.pass.progress * 0.7),
          });
      }
      return frame;
    },
    dispose() {
      app.renderer.off('resize', onResize);
      app.destroy({ removeView: true }, { children: true });
    },
  };
}
