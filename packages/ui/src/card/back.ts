// The back of a player card: the game's emblem on a night pitch, framed in the metal of the card's
// tier. The back is what a pack shows first: its frame already tells a bronze from a gold, the
// first beat of a reveal (GDD §12.4).

import { darken, el, lighten, type SvgElement } from '@legendes/data';
import {
  CARD_FONTS,
  CARD_HEIGHT,
  CARD_PALETTES,
  CARD_WIDTH,
  DEFAULT_CARD_TUNING,
  silhouette,
  type CardLook,
} from './layout.ts';

const CX = CARD_WIDTH / 2;
const CY = 168;

interface BackParts {
  readonly defs: SvgElement;
  readonly panel: SvgElement;
  readonly emblem: readonly SvgElement[];
  readonly outer: string;
  readonly inner: string;
}

function backParts(look: CardLook, uid: string): BackParts {
  const p = CARD_PALETTES[look];
  const [hi, body, low] = p.metal;
  const id = (name: string): string => `${uid}-${name}`;
  const outer = silhouette(0);
  const inner = silhouette(DEFAULT_CARD_TUNING.frame);
  const chalk = { stroke: '#f4f1e8', 'stroke-opacity': 0.14, 'stroke-width': 1.6, fill: 'none' };
  const defs = el(
    'defs',
    {},
    el(
      'linearGradient',
      { id: id('metal'), x1: 0, y1: 0, x2: 1, y2: 1 },
      el('stop', { offset: 0, 'stop-color': hi }),
      el('stop', { offset: 0.3, 'stop-color': body }),
      el('stop', { offset: 0.52, 'stop-color': lighten(hi, 0.25) }),
      el('stop', { offset: 0.75, 'stop-color': body }),
      el('stop', { offset: 1, 'stop-color': low }),
    ),
    el(
      'radialGradient',
      { id: id('night'), cx: 0.5, cy: 0.45, r: 0.75 },
      el('stop', { offset: 0, 'stop-color': '#1d5a41' }),
      el('stop', { offset: 0.6, 'stop-color': '#0a1f17' }),
      el('stop', { offset: 1, 'stop-color': '#040d09' }),
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
    el('clipPath', { id: id('panel-clip') }, el('path', { d: inner })),
  );
  const panel = el(
    'g',
    { 'clip-path': `url(#${id('panel-clip')})` },
    el('rect', { width: CARD_WIDTH, height: CARD_HEIGHT, fill: `url(#${id('night')})` }),
    el('rect', {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      fill: `url(#${id('mesh')})`,
      opacity: 0.05,
    }),
    // Chalk: halfway line and centre circle around the emblem.
    el('path', { d: `M0 ${CY} H${CARD_WIDTH}`, ...chalk }),
    el('circle', { cx: CX, cy: CY, r: 74, ...chalk }),
    el('circle', { cx: CX, cy: CY, r: 3, fill: '#f4f1e8', 'fill-opacity': 0.2 }),
    // Penalty arcs at both ends.
    el('path', { d: `M60 ${CARD_HEIGHT} V296 H190 V${CARD_HEIGHT}`, ...chalk }),
    el('path', { d: 'M60 0 V54 H190 V0', ...chalk }),
  );
  const text = (size: number, y: number, content: string, extra = {}): SvgElement =>
    el(
      'text',
      {
        class: CARD_FONTS.display.className,
        'font-family': CARD_FONTS.display.family,
        'font-weight': 900,
        'font-size': size,
        x: CX,
        y,
        'text-anchor': 'middle',
        fill: `url(#${id('metal')})`,
        ...extra,
      },
      content,
    );
  const emblem = [
    el('circle', {
      cx: CX,
      cy: CY,
      r: 50,
      fill: darken(low, 0.55),
      stroke: `url(#${id('metal')})`,
      'stroke-width': 5,
    }),
    el('circle', {
      cx: CX,
      cy: CY,
      r: 43,
      fill: 'none',
      stroke: hi,
      'stroke-opacity': 0.5,
      'stroke-width': 1,
    }),
    text(56, CY + 20, 'LD', { 'letter-spacing': -1 }),
    text(24, CY + 88, 'LÉGENDES', { 'letter-spacing': 3 }),
    text(13, CY + 106, 'DU DIMANCHE', { 'letter-spacing': 4.5, 'font-weight': 800 }),
    ...[-1, 1].map((side) =>
      el('path', {
        d: `M${CX + side * 58} ${CY + 83} H${CX + side * 90}`,
        stroke: `url(#${id('metal')})`,
        'stroke-width': 1.5,
      }),
    ),
  ];
  return { defs, panel, emblem, outer, inner };
}

function frameOf(look: CardLook, uid: string, outer: string, inner: string): SvgElement[] {
  const [hi, , low] = CARD_PALETTES[look].metal;
  return [
    el('path', { d: `${outer} ${inner}`, fill: `url(#${uid}-metal)`, 'fill-rule': 'evenodd' }),
    el('path', {
      d: silhouette(1.2),
      fill: 'none',
      stroke: lighten(hi, 0.4),
      'stroke-width': 1,
      'stroke-opacity': 0.8,
    }),
    el('path', { d: inner, fill: 'none', stroke: darken(low, 0.35), 'stroke-width': 1.4 }),
  ];
}

const root = (...children: SvgElement[]): SvgElement =>
  el(
    'svg',
    { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${CARD_WIDTH} ${CARD_HEIGHT}` },
    ...children,
  );

/** The back of a card of this template, as a standalone `<svg>`. */
export function cardBackNode(look: CardLook, uid: string): SvgElement {
  const b = backParts(look, uid);
  return root(b.defs, b.panel, ...b.emblem, ...frameOf(look, uid, b.outer, b.inner));
}

/** Its 3D mask: the frame and the emblem are metal (red), the pitch shimmers a little (green). */
export function cardBackMaskNode(look: CardLook, uid: string): SvgElement {
  const b = backParts(look, uid);
  const metal = `${uid}-to-red`;
  return root(
    b.defs,
    el(
      'defs',
      {},
      el(
        'filter',
        { id: metal },
        el('feColorMatrix', {
          type: 'matrix',
          values: '0 0 0 0 1  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
        }),
      ),
    ),
    el('rect', { width: CARD_WIDTH, height: CARD_HEIGHT, fill: '#000000' }),
    el(
      'g',
      { 'clip-path': `url(#${uid}-panel-clip)` },
      el('rect', { width: CARD_WIDTH, height: CARD_HEIGHT, fill: '#003000' }),
    ),
    el('g', { filter: `url(#${metal})` }, ...b.emblem),
    el('path', { d: `${b.outer} ${b.inner}`, fill: '#ff0000', 'fill-rule': 'evenodd' }),
  );
}
