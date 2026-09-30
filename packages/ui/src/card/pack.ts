// The pack: a foil sachet in the metal of its tier, sealed at both ends, a dotted line to tear
// along. Drawn as SVG (290 × 475, the 3D pack's 2.9 × 4.75) with its 3D mask, like the cards.

import { darken, el, lighten, type SvgElement } from '@legendes/data';
import type { PackType } from '@legendes/data';
import { CARD_FONTS } from './layout.ts';

export const PACK_WIDTH = 290;
export const PACK_HEIGHT = 475;
/** The tear line, as a share of the height from the bottom (the 3D pack tears there). */
export const PACK_TEAR_V = 0.885;
const TEAR_Y = Math.round(PACK_HEIGHT * (1 - PACK_TEAR_V) * 100) / 100;

export interface PackLook {
  /** Foil: highlight, body, shadow. */
  readonly metal: readonly [string, string, string];
  readonly ink: string;
  /** Tint of the lights on the foil in 3D, and of the light leaking from the tear. */
  readonly tint: string;
  /** Holographic film on the foil (the premium pack). */
  readonly holo: number;
}

export const PACK_LOOKS: Readonly<Record<PackType, PackLook>> = {
  bronze: { metal: ['#f0c197', '#b0703a', '#5a3115'], ink: '#2a1608', tint: '#ffba80', holo: 0 },
  silver: { metal: ['#ffffff', '#b9c3cd', '#58626d'], ink: '#131b24', tint: '#e6eef8', holo: 0 },
  gold: { metal: ['#fff0b3', '#d6a93a', '#7a5a0c'], ink: '#271c02', tint: '#ffd166', holo: 0.25 },
  'gold-premium': {
    metal: ['#fff3c4', '#e0b43c', '#3a2a06'],
    ink: '#f6dc85',
    tint: '#ffcf40',
    holo: 1,
  },
};

/** Texts printed on a pack, translated. */
export interface PackLabels {
  /** "PACK OR". */
  readonly title: string;
  /** "12 cartes · 3 or minimum". */
  readonly contents: string;
  /** "Déchirer ici". */
  readonly tearHere: string;
  /** Back: "Probabilités affichées avant chaque ouverture". */
  readonly odds: string;
  /** Back: "Jeu non officiel…". */
  readonly legal: string;
}

const display = (size: number, fill: string, extra: Record<string, string | number> = {}) => ({
  class: CARD_FONTS.display.className,
  'font-family': CARD_FONTS.display.family,
  'font-weight': 900,
  'font-size': size,
  'text-anchor': 'middle',
  fill,
  ...extra,
});

interface Parts {
  readonly defs: SvgElement;
  readonly foil: SvgElement[];
  readonly panel: SvgElement[];
  readonly print: SvgElement[];
  readonly metalPrint: SvgElement[];
}

const PANEL = { x: 18, y: 72, w: PACK_WIDTH - 36, h: 364, r: 14 };

function parts(type: PackType, labels: PackLabels, uid: string, back: boolean): Parts {
  const look = PACK_LOOKS[type];
  const [hi, body, low] = look.metal;
  const id = (name: string): string => `${uid}-${name}`;
  const premium = type === 'gold-premium';
  const defs = el(
    'defs',
    {},
    el(
      'linearGradient',
      { id: id('foil'), x1: 0, y1: 0, x2: 1, y2: 1 },
      el('stop', { offset: 0, 'stop-color': hi }),
      el('stop', { offset: 0.25, 'stop-color': body }),
      el('stop', { offset: 0.48, 'stop-color': lighten(hi, 0.3) }),
      el('stop', { offset: 0.7, 'stop-color': body }),
      el('stop', { offset: 1, 'stop-color': low }),
    ),
    el(
      'radialGradient',
      { id: id('night'), cx: 0.5, cy: 0.38, r: 0.8 },
      el('stop', { offset: 0, 'stop-color': premium ? '#2a2412' : '#1d5a41' }),
      el('stop', { offset: 0.6, 'stop-color': premium ? '#0d0b06' : '#0a1f17' }),
      el('stop', { offset: 1, 'stop-color': '#030806' }),
    ),
    el(
      'pattern',
      {
        id: id('mesh'),
        width: 14,
        height: 14,
        patternUnits: 'userSpaceOnUse',
        patternTransform: 'rotate(45)',
      },
      el('path', { d: 'M0 0 H14 M0 0 V14', stroke: '#ffffff', 'stroke-width': 1, fill: 'none' }),
    ),
    el(
      'pattern',
      { id: id('crimp'), width: 5, height: 22, patternUnits: 'userSpaceOnUse' },
      el('rect', { width: 2.5, height: 22, fill: darken(body, 0.25), opacity: 0.45 }),
    ),
    el(
      'clipPath',
      { id: id('panel-clip') },
      el('rect', { x: PANEL.x, y: PANEL.y, width: PANEL.w, height: PANEL.h, rx: PANEL.r }),
    ),
  );
  const foil = [
    el('rect', { width: PACK_WIDTH, height: PACK_HEIGHT, fill: `url(#${id('foil')})` }),
    // Crimped seals at both ends.
    el('rect', { width: PACK_WIDTH, height: 22, fill: `url(#${id('crimp')})` }),
    el('rect', {
      y: PACK_HEIGHT - 22,
      width: PACK_WIDTH,
      height: 22,
      fill: `url(#${id('crimp')})`,
    }),
  ];
  const cx = PACK_WIDTH / 2;
  const chalk = { stroke: '#f4f1e8', 'stroke-opacity': 0.13, 'stroke-width': 1.6, fill: 'none' };
  const panel = [
    el(
      'g',
      { 'clip-path': `url(#${id('panel-clip')})` },
      el('rect', {
        x: 0,
        y: 0,
        width: PACK_WIDTH,
        height: PACK_HEIGHT,
        fill: `url(#${id('night')})`,
      }),
      el('rect', {
        width: PACK_WIDTH,
        height: PACK_HEIGHT,
        fill: `url(#${id('mesh')})`,
        opacity: 0.05,
      }),
      ...[0, 1, 2, 3].map((k) =>
        el('path', {
          d: `M300 40 L${-50 + k * 80} 480 L${-14 + k * 80} 480 Z`,
          fill: look.tint,
          'fill-opacity': 0.07,
        }),
      ),
      el('circle', { cx, cy: 196, r: 86, ...chalk }),
      el('path', { d: `M0 196 H${PACK_WIDTH}`, ...chalk }),
    ),
    el('rect', {
      x: PANEL.x,
      y: PANEL.y,
      width: PANEL.w,
      height: PANEL.h,
      rx: PANEL.r,
      fill: 'none',
      stroke: `url(#${id('foil')})`,
      'stroke-width': 3,
    }),
  ];
  const tear = [
    el('path', {
      d: `M6 ${TEAR_Y} H${PACK_WIDTH - 6}`,
      stroke: look.ink,
      'stroke-width': 1.6,
      'stroke-dasharray': '6 5',
      'stroke-opacity': 0.75,
    }),
    el(
      'text',
      {
        class: CARD_FONTS.sans.className,
        'font-family': CARD_FONTS.sans.family,
        'font-weight': 800,
        'font-size': 8.5,
        'letter-spacing': 1.4,
        x: PACK_WIDTH - 10,
        y: TEAR_Y - 6,
        'text-anchor': 'end',
        fill: look.ink,
        'fill-opacity': 0.8,
      },
      labels.tearHere.toUpperCase(),
    ),
    // Scissor marks at the start of the line.
    el('path', {
      d: `M10 ${TEAR_Y - 9} L22 ${TEAR_Y} L10 ${TEAR_Y + 9}`,
      stroke: look.ink,
      'stroke-width': 1.6,
      fill: 'none',
      'stroke-opacity': 0.8,
    }),
  ];
  const metal = `url(#${id('foil')})`;
  if (back) {
    return {
      defs,
      foil,
      panel,
      print: [
        el(
          'text',
          {
            class: CARD_FONTS.sans.className,
            'font-family': CARD_FONTS.sans.family,
            'font-weight': 700,
            'font-size': 10,
            x: cx,
            y: 360,
            'text-anchor': 'middle',
            fill: '#f4f1e8',
            'fill-opacity': 0.75,
          },
          labels.odds,
        ),
        el(
          'text',
          {
            class: CARD_FONTS.sans.className,
            'font-family': CARD_FONTS.sans.family,
            'font-weight': 700,
            'font-size': 8,
            x: cx,
            y: 412,
            'text-anchor': 'middle',
            fill: '#f4f1e8',
            'fill-opacity': 0.5,
          },
          labels.legal,
        ),
      ],
      metalPrint: [
        el('circle', {
          cx,
          cy: 196,
          r: 44,
          fill: darken(low, 0.5),
          stroke: metal,
          'stroke-width': 4,
        }),
        el('text', display(46, metal, { x: cx, y: 213 }), 'LD'),
        // A pretend barcode, for the look of a real sachet.
        ...Array.from({ length: 28 }, (_, i) =>
          el('rect', {
            x: 98 + i * 3.4,
            y: 290,
            width: i % 3 === 0 ? 2.2 : 1.1,
            height: 30,
            fill: metal,
          }),
        ),
      ],
    };
  }
  return {
    defs,
    foil,
    panel,
    print: [...tear],
    metalPrint: [
      el('circle', {
        cx,
        cy: 176,
        r: 56,
        fill: darken(low, 0.55),
        stroke: metal,
        'stroke-width': 5,
      }),
      el('circle', { cx, cy: 176, r: 48, fill: 'none', stroke: hi, 'stroke-opacity': 0.5 }),
      el('text', display(60, metal, { x: cx, y: 197, 'letter-spacing': -1 }), 'LD'),
      el('text', display(26, metal, { x: cx, y: 272, 'letter-spacing': 3 }), 'LÉGENDES'),
      el(
        'text',
        display(14, metal, { x: cx, y: 292, 'letter-spacing': 5, 'font-weight': 800 }),
        'DU DIMANCHE',
      ),
      el(
        'text',
        display(labels.title.length > 10 ? 38 : 46, metal, {
          x: cx,
          y: 360,
          ...(labels.title.length > 12
            ? { textLength: 230, lengthAdjust: 'spacingAndGlyphs' }
            : {}),
        }),
        labels.title.toUpperCase(),
      ),
      el(
        'text',
        {
          class: CARD_FONTS.sans.className,
          'font-family': CARD_FONTS.sans.family,
          'font-weight': 800,
          'font-size': 11,
          'letter-spacing': 1.2,
          x: cx,
          y: 392,
          'text-anchor': 'middle',
          fill: '#f4f1e8',
          'fill-opacity': 0.85,
        },
        labels.contents.toUpperCase(),
      ),
    ],
  };
}

const root = (...children: SvgElement[]): SvgElement =>
  el(
    'svg',
    { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${PACK_WIDTH} ${PACK_HEIGHT}` },
    ...children,
  );

/** The front (or back) of a pack as a standalone `<svg>`. */
export function packNode(
  type: PackType,
  labels: PackLabels,
  uid: string,
  back = false,
): SvgElement {
  const p = parts(type, labels, uid, back);
  return root(p.defs, ...p.foil, ...p.panel, ...p.metalPrint, ...p.print);
}

/** Its 3D mask: red = foil (metal that reflects), green = holographic film, black = the panel. */
export function packMaskNode(
  type: PackType,
  labels: PackLabels,
  uid: string,
  back = false,
): SvgElement {
  const p = parts(type, labels, uid, back);
  const red = `${uid}-to-red`;
  const holo = Math.round(PACK_LOOKS[type].holo * 255)
    .toString(16)
    .padStart(2, '0');
  return root(
    p.defs,
    el(
      'defs',
      {},
      el(
        'filter',
        { id: red },
        el('feColorMatrix', {
          type: 'matrix',
          values: '0 0 0 0 1  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
        }),
      ),
    ),
    el('rect', { width: PACK_WIDTH, height: PACK_HEIGHT, fill: `#ff${holo}00` }),
    el('rect', {
      x: PANEL.x,
      y: PANEL.y,
      width: PANEL.w,
      height: PANEL.h,
      rx: PANEL.r,
      fill: `#00${Math.round(PACK_LOOKS[type].holo * 90)
        .toString(16)
        .padStart(2, '0')}00`,
    }),
    el('g', { filter: `url(#${red})` }, ...p.metalPrint),
  );
}
