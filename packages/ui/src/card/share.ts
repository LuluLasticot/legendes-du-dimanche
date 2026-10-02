// Share images (Phase 3, step 7; GDD §11): a card or a club as social networks and messaging
// apps show it (Open Graph, 1200 × 630) and a card as a story (1080 × 1920). Drawn as SVG trees,
// like the card itself: the card on the image is the card of the game (D-034), nested whole.
// Texts come translated; the server turns the tree into a PNG.

import {
  crestContent,
  el,
  shirtNode,
  type CrestSpec,
  type KitSpec,
  type SvgElement,
  type SvgNode,
} from '@legendes/data';
import { cardNode, type CardFace } from './face.ts';
import {
  CARD_FINISHES,
  CARD_FONTS,
  CARD_HEIGHT,
  CARD_WIDTH,
  DEFAULT_CARD_TUNING,
} from './layout.ts';

export const SHARE_SIZE = { width: 1200, height: 630 } as const;
export const STORY_SIZE = { width: 1080, height: 1920 } as const;

export interface CardShareLabels {
  /** Above the name: the promo, or the card's tier ("Or rare"). */
  readonly eyebrow: string;
  /** "83 · Milieu central · N° 10". */
  readonly line: string;
  readonly club: string;
  /** "National 1 · Feignies". */
  readonly clubLine: string;
  /** The game's name. */
  readonly brand: string;
  /** "Joueur fictif · football amateur des Hauts-de-France". */
  readonly footnote: string;
}

export interface ClubShareLabels {
  readonly eyebrow: string;
  readonly name: string;
  /** "Feignies · Stade …". */
  readonly line: string;
  readonly brand: string;
  readonly footnote: string;
}

const display = { 'font-family': CARD_FONTS.display.family, class: CARD_FONTS.display.className };
const sans = { 'font-family': CARD_FONTS.sans.family, class: CARD_FONTS.sans.className };

/** Font size for a line of `text` to fit `width` (condensed display font: ~0.47 em a glyph). */
function fit(text: string, width: number, max: number, em = 0.47): number {
  return Math.min(max, Math.floor(width / Math.max(1, text.length * em)));
}

/** Night pitch under floodlights, with a halo of `glow` around (cx, cy). */
function backdrop(
  uid: string,
  width: number,
  height: number,
  glow: string,
  cx: number,
  cy: number,
  base: readonly [string, string] = ['#0b2a1f', '#03100a'],
): SvgNode[] {
  const id = (name: string): string => `${uid}-${name}`;
  const beam = (x: number, spread: number): SvgElement =>
    el('path', {
      d: `M${x} -40 L${x - spread} ${height} L${x + spread} ${height} Z`,
      fill: `url(#${id('beam')})`,
    });
  return [
    el(
      'defs',
      {},
      el(
        'linearGradient',
        { id: id('sky'), x1: 0, y1: 0, x2: 0, y2: 1 },
        el('stop', { offset: 0, 'stop-color': base[0] }),
        el('stop', { offset: 1, 'stop-color': base[1] }),
      ),
      el(
        'radialGradient',
        { id: id('halo'), cx: cx / width, cy: cy / height, r: 0.55 },
        el('stop', { offset: 0, 'stop-color': glow, 'stop-opacity': 0.55 }),
        el('stop', { offset: 0.45, 'stop-color': glow, 'stop-opacity': 0.12 }),
        el('stop', { offset: 1, 'stop-color': glow, 'stop-opacity': 0 }),
      ),
      el(
        'linearGradient',
        { id: id('beam'), x1: 0, y1: 0, x2: 0, y2: 1 },
        el('stop', { offset: 0, 'stop-color': '#fff6d8', 'stop-opacity': 0.16 }),
        el('stop', { offset: 1, 'stop-color': '#fff6d8', 'stop-opacity': 0 }),
      ),
    ),
    el('rect', { width, height, fill: `url(#${id('sky')})` }),
    beam(width * 0.18, width * 0.12),
    beam(width * 0.82, width * 0.12),
    el('rect', { width, height, fill: `url(#${id('halo')})` }),
    // Pitch markings, faint: halfway line and centre circle.
    el('circle', {
      cx: width / 2,
      cy: height * 1.05,
      r: height * 0.42,
      fill: 'none',
      stroke: '#ffffff',
      'stroke-opacity': 0.05,
      'stroke-width': 4,
    }),
  ];
}

/** The card of the game, nested at (x, y), `width` wide, on a soft shadow. */
function nestedCard(face: CardFace, x: number, y: number, width: number): SvgNode[] {
  const height = (width * CARD_HEIGHT) / CARD_WIDTH;
  const card = cardNode(face, { ...DEFAULT_CARD_TUNING, grain: 0 });
  return [
    el('ellipse', {
      cx: x + width / 2,
      cy: y + height + width * 0.05,
      rx: width * 0.42,
      ry: width * 0.06,
      fill: '#000000',
      'fill-opacity': 0.45,
    }),
    el('svg', { ...card.attrs, x, y, width, height }, ...card.children),
  ];
}

function crestAt(crest: CrestSpec, uid: string, x: number, y: number, height: number): SvgElement {
  // A crest is drawn in a 100 × 120 box.
  return el(
    'g',
    { transform: `translate(${x} ${y}) scale(${height / 120})` },
    ...crestContent(crest, uid),
  );
}

function brandRow(brand: string, footnote: string, x: number, y: number, size: number): SvgNode[] {
  return [
    el(
      'text',
      {
        x,
        y,
        ...display,
        'font-weight': 800,
        'font-size': size,
        fill: '#ffd166',
        'letter-spacing': 1,
      },
      brand.toUpperCase(),
    ),
    el(
      'text',
      {
        x,
        y: y + size * 0.95,
        ...sans,
        'font-weight': 700,
        'font-size': size * 0.5,
        fill: '#9fb8ad',
      },
      footnote,
    ),
  ];
}

/** A card as a link preview: the card on the left, who he is on the right. */
export function cardShareNode(face: CardFace, labels: CardShareLabels): SvgElement {
  const { width, height } = SHARE_SIZE;
  const uid = `share-${face.uid}`;
  const glow = CARD_FINISHES[face.look].glow;
  const textX = 548;
  const textWidth = width - textX - 70;
  const nameSize = fit(face.name, textWidth, 112);
  return el(
    'svg',
    { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${width} ${height}`, width, height },
    ...backdrop(uid, width, height, glow, 280, 300),
    ...nestedCard(face, 104, 52, 360),
    el(
      'text',
      {
        x: textX,
        y: 150,
        ...sans,
        'font-weight': 800,
        'font-size': 26,
        fill: glow,
        'letter-spacing': 3,
      },
      labels.eyebrow.toUpperCase(),
    ),
    el(
      'text',
      {
        x: textX,
        y: 150 + nameSize * 0.98,
        ...display,
        'font-weight': 900,
        'font-size': nameSize,
        fill: '#f4f1e8',
      },
      face.name,
    ),
    el(
      'text',
      {
        x: textX,
        y: 196 + nameSize,
        ...sans,
        'font-weight': 700,
        'font-size': 32,
        fill: '#f4f1e8',
      },
      labels.line,
    ),
    crestAt(face.crest, `${uid}-crest`, textX, 300 + nameSize * 0.4, 96),
    el(
      'text',
      {
        x: textX + 100,
        y: 340 + nameSize * 0.4,
        ...sans,
        'font-weight': 800,
        'font-size': fit(labels.club, textWidth - 100, 34, 0.58),
        fill: '#f4f1e8',
      },
      labels.club,
    ),
    el(
      'text',
      {
        x: textX + 100,
        y: 378 + nameSize * 0.4,
        ...sans,
        'font-weight': 700,
        'font-size': 24,
        fill: '#9fb8ad',
      },
      labels.clubLine,
    ),
    ...brandRow(labels.brand, labels.footnote, textX, 548, 34),
  );
}

/** A card as a story (Instagram, TikTok, WhatsApp): the card large, the name under it. */
export function cardStoryNode(face: CardFace, labels: CardShareLabels): SvgElement {
  const { width, height } = STORY_SIZE;
  const uid = `story-${face.uid}`;
  const glow = CARD_FINISHES[face.look].glow;
  const cardWidth = 700;
  const cardTop = 330;
  const cardBottom = cardTop + (cardWidth * CARD_HEIGHT) / CARD_WIDTH;
  const nameSize = fit(face.name, width - 140, 150);
  const centre = { 'text-anchor': 'middle', x: width / 2 };
  return el(
    'svg',
    { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${width} ${height}`, width, height },
    ...backdrop(uid, width, height, glow, width / 2, cardTop + 480),
    el(
      'text',
      {
        ...centre,
        y: 190,
        ...display,
        'font-weight': 800,
        'font-size': 64,
        fill: '#ffd166',
        'letter-spacing': 2,
      },
      labels.brand.toUpperCase(),
    ),
    el(
      'text',
      {
        ...centre,
        y: 262,
        ...sans,
        'font-weight': 800,
        'font-size': 34,
        fill: glow,
        'letter-spacing': 4,
      },
      labels.eyebrow.toUpperCase(),
    ),
    ...nestedCard(face, (width - cardWidth) / 2, cardTop, cardWidth),
    el(
      'text',
      {
        ...centre,
        y: cardBottom + 90 + nameSize * 0.8,
        ...display,
        'font-weight': 900,
        'font-size': nameSize,
        fill: '#f4f1e8',
      },
      face.name,
    ),
    el(
      'text',
      {
        ...centre,
        y: cardBottom + 160 + nameSize * 0.8,
        ...sans,
        'font-weight': 700,
        'font-size': 42,
        fill: '#f4f1e8',
      },
      labels.line,
    ),
    el(
      'text',
      {
        ...centre,
        y: cardBottom + 230 + nameSize * 0.8,
        ...sans,
        'font-weight': 800,
        'font-size': fit(labels.club, width - 160, 44, 0.58),
        fill: '#f4f1e8',
      },
      labels.club,
    ),
    el(
      'text',
      {
        ...centre,
        y: cardBottom + 284 + nameSize * 0.8,
        ...sans,
        'font-weight': 700,
        'font-size': 32,
        fill: '#9fb8ad',
      },
      labels.clubLine,
    ),
    el(
      'text',
      { ...centre, y: height - 60, ...sans, 'font-weight': 700, 'font-size': 28, fill: '#9fb8ad' },
      labels.footnote,
    ),
  );
}

/** A club as a link preview: its crest, its name, and its three kits. */
export function clubShareNode(
  club: { readonly id: string; readonly crest: CrestSpec; readonly colour: string },
  kits: readonly KitSpec[],
  labels: ClubShareLabels,
): SvgElement {
  const { width, height } = SHARE_SIZE;
  const uid = `share-club-${club.id}`;
  const textX = 470;
  const textWidth = width - textX - 70;
  const nameSize = fit(labels.name, textWidth, 96, 0.5);
  const lines = nameSize < 60 ? 2 : 1;
  // A long name goes on two lines, split at the space nearest the middle.
  const words = labels.name.split(' ');
  const split = (): [string, string] => {
    let best = 1;
    let gap = Infinity;
    for (let i = 1; i < words.length; i++) {
      const left = words.slice(0, i).join(' ').length;
      const d = Math.abs(left - labels.name.length / 2);
      if (d < gap) {
        gap = d;
        best = i;
      }
    }
    return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  };
  const nameLines = lines === 2 && words.length > 1 ? split() : [labels.name];
  const size = Math.min(96, ...nameLines.map((l) => fit(l, textWidth, 96, 0.5)));
  return el(
    'svg',
    { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${width} ${height}`, width, height },
    ...backdrop(uid, width, height, club.colour, 240, 300),
    crestAt(club.crest, `${uid}-crest`, 90, 105, 380),
    el(
      'text',
      {
        x: textX,
        y: 140,
        ...sans,
        'font-weight': 800,
        'font-size': 26,
        fill: '#ffd166',
        'letter-spacing': 3,
      },
      labels.eyebrow.toUpperCase(),
    ),
    ...nameLines.map((line, i) =>
      el(
        'text',
        {
          x: textX,
          y: 140 + size * (0.98 + i * 0.95),
          ...display,
          'font-weight': 900,
          'font-size': size,
          fill: '#f4f1e8',
        },
        line,
      ),
    ),
    el(
      'text',
      {
        x: textX,
        y: 190 + size * (0.98 + (nameLines.length - 1) * 0.95),
        ...sans,
        'font-weight': 700,
        'font-size': 28,
        fill: '#9fb8ad',
      },
      labels.line,
    ),
    ...kits.slice(0, 3).map((kit, i) => {
      const shirt = shirtNode(kit, { uid: `${uid}-kit-${i}` });
      return el(
        'svg',
        { ...shirt.attrs, x: textX + i * 150, y: 350, width: 132, height: 110 },
        ...shirt.children,
      );
    }),
    ...brandRow(labels.brand, labels.footnote, textX, 548, 34),
  );
}
