// Kits (GDD §4, §12): a home, an away and a goalkeeper kit for every club, from its colours and
// pattern. The kit is data (`KitSpec`): the 2D drawing below and, later, the 3D character shader
// read the same fields, so the shirt on a card and the shirt on the pitch always match.

import { Rng } from '@legendes/engine/rng';
import type { Club, ShirtPattern } from '../schema.ts';
import { colourDistance, contrast, darken, lighten, pickInk, readableOn } from './colour.ts';
import { crestContent, type CrestSpec } from './crest.ts';
import { el, type SvgElement, type SvgNode } from './svg.ts';

// No V neck: hardly worn any more, and on the 3D player it showed a round collar over the V
// (D-039). The draw keeps its old odds, so every polo club keeps its polo.
export const COLLAR_STYLES = ['crew', 'polo'] as const;
export type CollarStyle = (typeof COLLAR_STYLES)[number];

export interface KitSpec {
  readonly pattern: ShirtPattern;
  /** Base colour of the shirt. */
  readonly body: string;
  /** Colour of the stripes, hoops, sash or squares (the second colour of the shirt). */
  readonly stripe: string;
  readonly sleeves: string;
  readonly collar: string;
  readonly collarStyle: CollarStyle;
  readonly shorts: string;
  /** Shorts' side trim. */
  readonly shortsTrim: string;
  readonly socks: string;
  readonly socksCuff: string;
}

export interface ClubKits {
  readonly home: KitSpec;
  readonly away: KitSpec;
  readonly keeper: KitSpec;
}

/** Index of each pattern for the 3D shader (`0` = plain). */
export const KIT_PATTERN_INDEX: Readonly<Record<ShirtPattern, number>> = {
  plain: 0,
  stripes: 1,
  hoops: 2,
  sash: 3,
  checks: 4,
};

const NEUTRAL_DARK = '#15181c';
const KEEPER_COLOURS = [
  '#2fb35a',
  '#f28a1a',
  '#8b3fc0',
  '#e75a9b',
  '#19a5a5',
  '#f2e21c',
  '#20242b',
];

function trim(
  rng: Rng,
  body: string,
  stripe: string,
): Omit<KitSpec, 'pattern' | 'body' | 'stripe'> {
  const collarStyle = COLLAR_STYLES[rng.fork('collar').weightedIndex([0.75, 0.25])] as CollarStyle;
  // Sleeves in the body colour most of the time, sometimes in the second colour.
  const sleeves = rng.fork('sleeves').chance(0.28) ? stripe : body;
  const collar = pickInk([body], [stripe, '#ffffff', NEUTRAL_DARK], 1.6);
  const shortsBase = [stripe, body, NEUTRAL_DARK, '#ffffff'][
    rng.fork('shorts').weightedIndex([0.4, 0.3, 0.2, 0.1])
  ] as string;
  const shorts =
    shortsBase === body && rng.fork('shorts-body').chance(0.5) ? darken(body, 0.1) : shortsBase;
  const trimColour = pickInk([shorts], [body === shorts ? stripe : body, stripe, '#ffffff'], 1.6);
  const socks = [shorts, body, stripe][
    rng.fork('socks').weightedIndex([0.45, 0.4, 0.15])
  ] as string;
  const cuff = pickInk([socks], [stripe, body, '#ffffff', NEUTRAL_DARK], 1.6);
  return {
    sleeves,
    collar,
    collarStyle,
    shorts,
    shortsTrim: trimColour,
    socks,
    socksCuff: cuff,
  };
}

const kitCache = new WeakMap<Club, ClubKits>();

/** Home, away and goalkeeper kits of a club. Deterministic (and computed once per club). */
export function kitsOf(club: Club): ClubKits {
  const cached = kitCache.get(club);
  if (cached) return cached;
  const kits = drawKits(club);
  kitCache.set(club, kits);
  return kits;
}

function drawKits(club: Club): ClubKits {
  const rng = Rng.create(`kit:${club.id}`);
  const { primary, secondary } = club.colours;
  const home: KitSpec = {
    pattern: club.pattern,
    body: primary,
    stripe: secondary,
    ...trim(rng.fork('home'), primary, secondary),
  };

  // Away: the colours swapped when they stand out, else a neutral shirt; never the home look.
  const awayBody =
    contrast(secondary, primary) >= 2.2
      ? secondary
      : contrast(primary, '#ffffff') > 3
        ? '#ffffff'
        : NEUTRAL_DARK;
  const awayStripe = awayBody === primary ? secondary : primary;
  const awayPatterns: readonly ShirtPattern[] = ['plain', 'hoops', 'stripes', 'sash'];
  const awayPattern = awayPatterns[
    rng.fork('away-pattern').weightedIndex([0.5, 0.2, 0.2, 0.1])
  ] as ShirtPattern;
  const away: KitSpec = {
    pattern: awayPattern,
    body: awayBody,
    stripe: awayStripe,
    ...trim(rng.fork('away'), awayBody, awayStripe),
  };

  // Goalkeeper: a colour far from both outfield shirts.
  const options = KEEPER_COLOURS.filter(
    (c) => contrast(c, home.body) >= 1.5 && contrast(c, away.body) >= 1.5,
  );
  const pool = options.length > 0 ? options : KEEPER_COLOURS;
  const keeperBody = pool[rng.fork('keeper').int(0, pool.length - 1)] as string;
  const keeper: KitSpec = {
    pattern: 'plain',
    body: keeperBody,
    stripe: lighten(keeperBody, 0.25),
    sleeves: keeperBody,
    collar: readableOn(keeperBody),
    collarStyle: 'crew',
    shorts: darken(keeperBody, 0.35),
    shortsTrim: keeperBody,
    socks: darken(keeperBody, 0.35),
    socksCuff: keeperBody,
  };
  return { home, away, keeper };
}

/** Two shirts that cannot be told apart on the pitch (main colours too close). */
export function kitsClash(a: KitSpec, b: KitSpec): boolean {
  return colourDistance(a.body, b.body) < 170;
}

/**
 * A plain neutral kit (white or anthracite, whichever stands further from `avoid`) trimmed in
 * the club's colours: what visitors wear when both their kits clash with the home shirt.
 */
function thirdKit(club: Club, avoid: string, collarStyle: CollarStyle): KitSpec {
  const body =
    colourDistance('#ffffff', avoid) >= colourDistance(NEUTRAL_DARK, avoid)
      ? '#ffffff'
      : NEUTRAL_DARK;
  const trim = pickInk(
    [body],
    [club.colours.primary, club.colours.secondary, body === '#ffffff' ? NEUTRAL_DARK : '#ffffff'],
    1.6,
  );
  return {
    pattern: 'plain',
    body,
    stripe: body,
    sleeves: body,
    collar: trim,
    collarStyle,
    shorts: body,
    shortsTrim: trim,
    socks: body,
    socksCuff: trim,
  };
}

/**
 * The kits of a match: each club in its home kit, the visitors in their away kit on a clash,
 * and in a neutral third kit when that one clashes too (57 pairings of the pilot out of 41 820).
 */
export function matchKits(home: Club, away: Club): { home: KitSpec; away: KitSpec } {
  const homeKit = kitsOf(home).home;
  const visitors = kitsOf(away);
  if (!kitsClash(homeKit, visitors.home)) return { home: homeKit, away: visitors.home };
  if (!kitsClash(homeKit, visitors.away)) return { home: homeKit, away: visitors.away };
  return { home: homeKit, away: thirdKit(away, homeKit.body, visitors.away.collarStyle) };
}

// ─── Drawing ──────────────────────────────────────────────────────────────────────────────────

export interface KitDrawOptions {
  /** Makes clip and gradient identifiers unique on the page (club id + kit name). */
  readonly uid: string;
  readonly crest?: CrestSpec;
  /** What is printed across the chest, in capitals ("CHEZ MOMO"). */
  readonly sponsor?: string;
}

const FONT = "'Big Shoulders','Arial Narrow',Impact,sans-serif";

/** A long label goes on two lines, split at the space nearest the middle ("BOULANGERIE" / "DELATTRE"). */
export function sponsorLines(label: string | undefined): string[] {
  if (label === undefined || label === '') return [];
  if (label.length <= 12 || !label.includes(' ')) return [label];
  const spaces = [...label.matchAll(/ /g)].map((m) => m.index);
  const middle = label.length / 2;
  const cut = spaces.reduce((best, at) =>
    Math.abs(at - middle) < Math.abs(best - middle) ? at : best,
  );
  return [label.slice(0, cut), label.slice(cut + 1)];
}

/** The neckline: torso outline and the collar band that follows it. */
function neck(style: CollarStyle): { top: string; collar: string } {
  switch (style) {
    case 'polo':
      return { top: 'Q60 17 84 6', collar: 'M36 6 L45 0 L60 14 L75 0 L84 6 Q60 17 36 6 Z' };
    default:
      return { top: 'Q60 22 84 6', collar: 'M36 6 Q60 22 84 6 L80 3 Q60 15 40 3 Z' };
  }
}

function patternShapes(kit: KitSpec): SvgNode[] {
  const fill = kit.stripe;
  switch (kit.pattern) {
    case 'stripes':
      return [1, 3, 5, 7].map((i) =>
        el('rect', { x: 26 + i * 8.5, y: 0, width: 8.5, height: 100, fill }),
      );
    case 'hoops':
      return [14, 40, 66].map((y) => el('rect', { x: 0, y, width: 120, height: 12, fill }));
    case 'sash':
      return [el('path', { d: 'M20 0 L44 0 L100 78 L100 100 L76 100 L20 22 Z', fill })];
    case 'checks': {
      const cells: SvgNode[] = [];
      for (let row = 0; row < 6; row++)
        for (let col = 0; col < 4; col++)
          if ((row + col) % 2 === 0)
            cells.push(el('rect', { x: 26 + col * 17, y: row * 17, width: 17, height: 17, fill }));
      return cells;
    }
    default:
      return [];
  }
}

/** The shirt as SVG elements in a 120 × 100 box. */
export function shirtContent(kit: KitSpec, options: KitDrawOptions): SvgElement[] {
  const { uid } = options;
  const { top, collar } = neck(kit.collarStyle);
  const torso = `M36 6 ${top} L94 12 V92 Q60 99 26 92 V12 Z`;
  const outline = { stroke: 'rgba(0,0,0,0.38)', 'stroke-width': 1, 'stroke-linejoin': 'round' };
  const clip = `${uid}-shirt`;
  const shade = `${uid}-shade`;
  const inkOnShirt = pickInk([kit.body, kit.stripe], ['#ffffff', '#111111'], 3);
  const halo = inkOnShirt === '#ffffff' ? '#000000' : '#ffffff';

  const sponsor: SvgElement[] = sponsorLines(options.sponsor).map((line, i, lines) =>
    el(
      'text',
      {
        x: 60,
        y: (options.crest === undefined ? 50 : 58) + i * 9.5 - (lines.length - 1) * 2,
        'text-anchor': 'middle',
        class: 'ld-font-display',
        'font-family': FONT,
        'font-weight': 800,
        'font-size': 9,
        fill: inkOnShirt,
        stroke: halo,
        'stroke-opacity': 0.5,
        'stroke-width': 1.6,
        'stroke-linejoin': 'round',
        'paint-order': 'stroke',
        textLength: Math.min(50, 5.6 * line.length),
        lengthAdjust: 'spacingAndGlyphs',
      },
      line,
    ),
  );
  const badge: SvgElement[] =
    options.crest === undefined
      ? []
      : [
          el(
            'g',
            { transform: 'translate(70 19) scale(0.2)' },
            ...crestContent(options.crest, `${uid}-crest`),
          ),
        ];

  return [
    el(
      'defs',
      {},
      el('clipPath', { id: clip }, el('path', { d: torso })),
      el(
        'linearGradient',
        { id: shade, x1: 0, y1: 0, x2: 1, y2: 1 },
        el('stop', { offset: 0, 'stop-color': '#ffffff', 'stop-opacity': 0.2 }),
        el('stop', { offset: 0.5, 'stop-color': '#ffffff', 'stop-opacity': 0 }),
        el('stop', { offset: 1, 'stop-color': '#000000', 'stop-opacity': 0.26 }),
      ),
    ),
    el('path', { d: 'M36 6 L24 12 L2 40 L17 54 L27 43 L27 14 Z', fill: kit.sleeves, ...outline }),
    el('path', {
      d: 'M84 6 L96 12 L118 40 L103 54 L93 43 L93 14 Z',
      fill: kit.sleeves,
      ...outline,
    }),
    // Cuffs.
    el('path', { d: 'M2 40 L17 54 L20.5 50 L6.5 36.5 Z', fill: kit.collar, 'fill-opacity': 0.9 }),
    el('path', {
      d: 'M118 40 L103 54 L99.5 50 L113.5 36.5 Z',
      fill: kit.collar,
      'fill-opacity': 0.9,
    }),
    el('path', { d: torso, fill: kit.body }),
    el('g', { 'clip-path': `url(#${clip})` }, ...patternShapes(kit)),
    el('path', { d: torso, fill: `url(#${shade})`, ...outline }),
    el('path', { d: collar, fill: kit.collar, stroke: 'rgba(0,0,0,0.3)', 'stroke-width': 0.8 }),
    ...badge,
    ...sponsor,
  ];
}

/** Shorts in a 120 × 44 box. */
function shortsContent(kit: KitSpec): SvgElement[] {
  const outline = { stroke: 'rgba(0,0,0,0.38)', 'stroke-width': 1, 'stroke-linejoin': 'round' };
  return [
    el('path', { d: 'M28 0 H92 L100 42 H64 L60 20 L56 42 H20 Z', fill: kit.shorts, ...outline }),
    el('path', { d: 'M28 0 L20 42 H26 L33 0 Z', fill: kit.shortsTrim }),
    el('path', { d: 'M92 0 L100 42 H94 L87 0 Z', fill: kit.shortsTrim }),
    el('path', { d: 'M28 0 H92 V5 H28 Z', fill: kit.shortsTrim, 'fill-opacity': 0.5 }),
  ];
}

/** A pair of socks in a 120 × 32 box. */
function socksContent(kit: KitSpec): SvgElement[] {
  const outline = { stroke: 'rgba(0,0,0,0.38)', 'stroke-width': 1, 'stroke-linejoin': 'round' };
  const sock = (x: number): SvgElement[] => [
    el('path', {
      d: `M${x} 0 H${x + 22} V22 Q${x + 22} 30 ${x + 14} 31 H${x + 6} Q${x} 30 ${x} 22 Z`,
      fill: kit.socks,
      ...outline,
    }),
    el('path', { d: `M${x} 0 H${x + 22} V8 H${x} Z`, fill: kit.socksCuff }),
  ];
  return [...sock(30), ...sock(68)];
}

/** A shirt alone: an `<svg>` of viewBox 0 0 120 100. */
export function shirtNode(kit: KitSpec, options: KitDrawOptions): SvgElement {
  return el(
    'svg',
    { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 120 100' },
    ...shirtContent(kit, options),
  );
}

/** Shirt, shorts and socks: an `<svg>` of viewBox 0 0 120 178. */
export function kitNode(kit: KitSpec, options: KitDrawOptions): SvgElement {
  return el(
    'svg',
    { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 120 178' },
    ...shirtContent(kit, options),
    el('g', { transform: 'translate(0 102)' }, ...shortsContent(kit)),
    el('g', { transform: 'translate(0 146)' }, ...socksContent(kit)),
  );
}

// ─── 3D prints ────────────────────────────────────────────────────────────────────────────────

/** The print texture's layout, read by the 3D kit shader (`render3d/players/kit-material.ts`). */
export const KIT_PRINT = {
  width: 1024,
  height: 512,
  /** The chest print fills the left half: a square that covers `printSize` metres of chest. */
  chest: 512,
  /** Digits 0–9 on the right half, 5 columns × 2 rows. */
  digitWidth: 102.4,
  digitHeight: 256,
} as const;

/**
 * What a team's shirts carry, as one texture for the 3D characters: the crest on the player's
 * left chest (on the right as you face him) and the sponsor across the chest, then the digits of
 * the numbers worn on the back. Inks are chosen to stand out on the shirt, like on the 2D kit.
 */
export function kitPrintNode(kit: KitSpec, options: KitDrawOptions): SvgElement {
  const ink = pickInk([kit.body, kit.stripe], ['#ffffff', '#111111'], 3);
  const halo = ink === '#ffffff' ? '#000000' : '#ffffff';
  const text = { fill: ink, stroke: halo, 'stroke-opacity': 0.45, 'stroke-linejoin': 'round' };
  const lines = sponsorLines(options.sponsor);
  const sponsor = lines.map((line, i) =>
    el(
      'text',
      {
        x: 256,
        y: 300 + i * 64 - (lines.length - 1) * 26,
        'text-anchor': 'middle',
        class: 'ld-font-display',
        'font-family': FONT,
        'font-weight': 800,
        'font-size': 66,
        'stroke-width': 7,
        'paint-order': 'stroke',
        textLength: Math.min(372, 40 * line.length),
        lengthAdjust: 'spacingAndGlyphs',
        ...text,
      },
      line,
    ),
  );
  const crest =
    options.crest === undefined
      ? []
      : [
          el(
            'g',
            { transform: 'translate(334 92) scale(0.92)' },
            ...crestContent(options.crest, `${options.uid}-crest`),
          ),
        ];
  const digits = Array.from({ length: 10 }, (_, d) =>
    el(
      'text',
      {
        x: KIT_PRINT.chest + ((d % 5) + 0.5) * KIT_PRINT.digitWidth,
        y: Math.floor(d / 5) * KIT_PRINT.digitHeight + 222,
        'text-anchor': 'middle',
        class: 'ld-font-display',
        'font-family': FONT,
        'font-weight': 900,
        'font-size': 250,
        'stroke-width': 9,
        'paint-order': 'stroke',
        textLength: 80,
        lengthAdjust: 'spacingAndGlyphs',
        ...text,
      },
      String(d),
    ),
  );
  return el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${KIT_PRINT.width} ${KIT_PRINT.height}`,
    },
    ...crest,
    ...sponsor,
    ...digits,
  );
}
