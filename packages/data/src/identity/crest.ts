// Generated crests (rule 3 of CLAUDE.md: never a real logo). A crest is drawn from the club's
// colours with a shield, a partition of the field, a charge (a football, a belfry, a pit
// headframe…) and, sometimes, a monogram or a ribbon with the town. Everything comes from a seed
// (the club id), so a crest is recomputed identically anywhere: no image file to store.

import { Rng } from '@legendes/engine/rng';
import { foldText } from '../naming.ts';
import type { Club, ShirtPattern } from '../schema.ts';
import { darken, lighten, pickInk } from './colour.ts';
import { el, toSvgString, type SvgElement, type SvgNode } from './svg.ts';

export const CREST_SHAPES = ['heater', 'french', 'pointed', 'round', 'banner', 'hex'] as const;
export type CrestShape = (typeof CREST_SHAPES)[number];

export const CREST_PARTITIONS = [
  'plain',
  'pale',
  'fess',
  'bend',
  'stripes',
  'hoops',
  'chevron',
  'cross',
  'saltire',
  'quarterly',
  'chief',
  'pile',
] as const;
export type CrestPartition = (typeof CREST_PARTITIONS)[number];

export const CREST_CHARGES = [
  'ball',
  'star',
  'tower',
  'belfry',
  'sheaf',
  'headframe',
  'terril',
  'fleur',
  'crown',
  'wave',
  'sun',
  'diamond',
] as const;
export type CrestCharge = (typeof CREST_CHARGES)[number];

export const CREST_STYLES = ['charge', 'charge-ribbon', 'monogram'] as const;
export type CrestStyle = (typeof CREST_STYLES)[number];

export interface CrestSpec {
  readonly shape: CrestShape;
  readonly partition: CrestPartition;
  readonly charge: CrestCharge;
  readonly style: CrestStyle;
  /** Two or three capitals ("USL"). */
  readonly monogram: string;
  /** Under the charge when the style has a ribbon: the town, in capitals. */
  readonly ribbonText: string;
  readonly colours: {
    readonly field: string;
    readonly alt: string;
    /** Colour of the charge and of the text. */
    readonly ink: string;
    /** Dark outline. */
    readonly rim: string;
    /** Thin trim between the outline and the field. */
    readonly accent: string;
  };
}

// ─── Text ─────────────────────────────────────────────────────────────────────────────────────

const PARTICLES = new Set('de du des la le les sur en lez et aux au sous l d'.split(' '));

/** "US Lieu Saint Amand" → "USL", "Olympique Marcquois" → "OM", "Racing Club Douai" → "RCD". */
export function monogramOf(name: string): string {
  const tokens = name.split(/\s+/).filter(Boolean);
  const acronym = tokens.find((t) => /^[A-Z]{2,3}$/.test(t));
  const words = tokens.filter(
    (t) => t !== acronym && !PARTICLES.has(foldText(t)) && /^\p{L}/u.test(t),
  );
  const initial = (w: string | undefined): string =>
    w === undefined ? '' : foldText(w).charAt(0).toUpperCase();
  if (acronym !== undefined) return (acronym + initial(words[0])).slice(0, 3);
  const letters = words.slice(0, 3).map(initial).join('');
  if (letters.length >= 2) return letters;
  return foldText(words[0] ?? name)
    .slice(0, 2)
    .toUpperCase();
}

/** The town as a ribbon reads: "Le Plessis-Belleville" → "PLESSIS", "Saint-Amand" → "ST AMAND". */
export function townLabel(city: string): string {
  const text = foldText(city)
    .replace(/^(le|la|les|l) /, '')
    .replace(/\bsainte\b/g, 'ste')
    .replace(/\bsaint\b/g, 'st')
    .toUpperCase();
  if (text.length <= 12) return text;
  return text.split(' ').find((w) => w.length >= 4 && w.length <= 12) ?? text.slice(0, 12);
}

// ─── Drawing data ─────────────────────────────────────────────────────────────────────────────

/** Outlines in a 100 × 120 box, centred on x = 50. */
const SHAPE_PATHS: Readonly<Record<CrestShape, string>> = {
  heater: 'M8 8 H92 V58 C92 92 70 110 50 116 C30 110 8 92 8 58 Z',
  french: 'M10 8 H90 V68 A40 40 0 0 1 10 68 Z',
  pointed: 'M8 8 H92 V60 L50 116 L8 60 Z',
  round: 'M50 14 A46 46 0 1 1 50 106 A46 46 0 1 1 50 14 Z',
  banner: 'M8 8 H36 Q50 22 64 8 H92 V66 C92 92 72 108 50 116 C28 108 8 92 8 66 Z',
  hex: 'M50 4 L92 24 V80 L50 116 L8 80 V24 Z',
};

/** Where the ribbon sits, per shape (the shield narrows towards the bottom). */
const RIBBON_Y: Readonly<Record<CrestShape, number>> = {
  heater: 78,
  french: 74,
  pointed: 68,
  round: 78,
  banner: 76,
  hex: 74,
};

/** The second colour of the field, as shapes over a field of the first colour. */
const PARTITION_PATHS: Readonly<Record<CrestPartition, string>> = {
  plain: '',
  pale: 'M50 0 H100 V120 H50 Z',
  fess: 'M0 60 H100 V120 H0 Z',
  bend: 'M0 0 L100 120 L0 120 Z',
  stripes: 'M20 0 H40 V120 H20 Z M60 0 H80 V120 H60 Z',
  hoops: 'M0 26 H100 V48 H0 Z M0 70 H100 V92 H0 Z',
  chevron: 'M-5 78 L50 34 L105 78 L105 98 L50 54 L-5 98 Z',
  cross: 'M41 0 H59 V120 H41 Z M0 49 H100 V67 H0 Z',
  saltire: 'M-6 0 L14 0 L106 120 L86 120 Z M106 0 L86 0 L-6 120 L14 120 Z',
  quarterly: 'M50 0 H100 V60 H50 Z M0 60 H50 V120 H0 Z',
  chief: 'M0 0 H100 V34 H0 Z',
  pile: 'M14 0 H86 L50 92 Z',
};

/** Which partitions echo the pattern of the club's real shirt. */
const PATTERN_PARTITION: Readonly<Record<ShirtPattern, CrestPartition>> = {
  plain: 'plain',
  stripes: 'stripes',
  hoops: 'hoops',
  sash: 'bend',
  checks: 'quarterly',
};

type Ink = { readonly ink: string; readonly edge: string };

/** Charges are drawn in a box of about ±22 around the origin. */
const CHARGES: Readonly<Record<CrestCharge, (c: Ink) => SvgNode[]>> = {
  ball: ({ ink, edge }) => [
    el('circle', { r: 19, fill: ink, stroke: edge, 'stroke-width': 1.8 }),
    el('path', { d: 'M0 -6 L5.7 -1.85 L3.53 4.85 L-3.53 4.85 L-5.7 -1.85 Z', fill: edge }),
    el('path', {
      d: 'M0 -6 L0 -18 M5.7 -1.85 L17.1 -5.56 M3.53 4.85 L10.6 14.56 M-3.53 4.85 L-10.6 14.56 M-5.7 -1.85 L-17.1 -5.56',
      stroke: edge,
      'stroke-width': 1.6,
      fill: 'none',
    }),
  ],
  star: ({ ink, edge }) => [
    el('path', {
      d: 'M0 -21 L4.9 -6.7 L19.9 -6.5 L8 2.6 L12.3 17 L0 8.4 L-12.3 17 L-8 2.6 L-19.9 -6.5 L-4.9 -6.7 Z',
      fill: ink,
      stroke: edge,
      'stroke-width': 1.6,
      'stroke-linejoin': 'round',
    }),
  ],
  tower: ({ ink, edge }) => [
    el('path', {
      d: 'M-13 20 V-2 H-16 V-16 H-10 V-11 H-5 V-16 H5 V-11 H10 V-16 H16 V-2 H13 V20 Z',
      fill: ink,
      stroke: edge,
      'stroke-width': 1.6,
      'stroke-linejoin': 'round',
    }),
    el('path', { d: 'M-4.5 20 V9 A4.5 4.5 0 0 1 4.5 9 V20 Z', fill: edge }),
    el('rect', { x: -2, y: -8, width: 4, height: 8, rx: 2, fill: edge }),
  ],
  belfry: ({ ink, edge }) => [
    el('path', {
      d: 'M-9 20 V-2 H-11 V-8 H-7 V-12 H-8 L0 -25 L8 -12 H7 V-8 H11 V-2 H9 V20 Z',
      fill: ink,
      stroke: edge,
      'stroke-width': 1.6,
      'stroke-linejoin': 'round',
    }),
    el('rect', { x: -3, y: 4, width: 6, height: 11, rx: 3, fill: edge }),
    el('rect', { x: -2, y: -8, width: 4, height: 5, rx: 1, fill: edge }),
  ],
  sheaf: ({ ink, edge }) => [
    el('path', {
      d: 'M0 19 L-11 -3 M0 19 L0 -10 M0 19 L11 -3',
      stroke: ink,
      'stroke-width': 2.8,
      'stroke-linecap': 'round',
      fill: 'none',
    }),
    el('ellipse', { cx: 0, cy: -11, rx: 4.6, ry: 9, fill: ink, stroke: edge, 'stroke-width': 1.3 }),
    el('ellipse', {
      cx: -12,
      cy: -4,
      rx: 4.2,
      ry: 8.5,
      fill: ink,
      stroke: edge,
      'stroke-width': 1.3,
      transform: 'rotate(-32 -12 -4)',
    }),
    el('ellipse', {
      cx: 12,
      cy: -4,
      rx: 4.2,
      ry: 8.5,
      fill: ink,
      stroke: edge,
      'stroke-width': 1.3,
      transform: 'rotate(32 12 -4)',
    }),
    el('rect', { x: -9, y: 5, width: 18, height: 4.5, rx: 1.5, fill: edge }),
  ],
  headframe: ({ ink, edge }) => [
    el('path', {
      d: 'M-15 20 L-4 -12 H4 L15 20 H11 L3 -4 H-3 L-11 20 Z',
      fill: ink,
      stroke: edge,
      'stroke-width': 1.5,
      'stroke-linejoin': 'round',
    }),
    el('path', {
      d: 'M-8.5 8 H8.5 M-5.5 -1 H5.5',
      stroke: ink,
      'stroke-width': 2,
      fill: 'none',
    }),
    el('circle', { cx: 0, cy: -16, r: 6, fill: ink, stroke: edge, 'stroke-width': 1.5 }),
    el('circle', { cx: 0, cy: -16, r: 2, fill: edge }),
  ],
  terril: ({ ink, edge }) => [
    el('path', {
      d: 'M-23 20 L-8 -9 L3 20 Z M-4 20 L10 -3 L23 20 Z',
      fill: ink,
      stroke: edge,
      'stroke-width': 1.6,
      'stroke-linejoin': 'round',
    }),
  ],
  fleur: ({ ink, edge }) => {
    const side = 'M-3 5 C-9 -9 -22 -7 -19 3 C-17 9 -9 9 -3 5 Z';
    const attrs = { fill: ink, stroke: edge, 'stroke-width': 1.4, 'stroke-linejoin': 'round' };
    return [
      el('path', { d: 'M0 -22 C7 -13 7 -3 0 7 C-7 -3 -7 -13 0 -22 Z', ...attrs }),
      el('path', { d: side, ...attrs }),
      el('path', { d: side, ...attrs, transform: 'scale(-1 1)' }),
      el('path', { d: 'M-12 8 H12 V13 H-12 Z', ...attrs }),
      el('path', { d: 'M-4 13 L-7 21 H7 L4 13 Z', ...attrs }),
    ];
  },
  crown: ({ ink, edge }) => [
    el('path', {
      d: 'M-19 14 L-21 -6 L-9 3 L0 -14 L9 3 L21 -6 L19 14 Z',
      fill: ink,
      stroke: edge,
      'stroke-width': 1.6,
      'stroke-linejoin': 'round',
    }),
    el('circle', { cx: -21, cy: -8, r: 2.6, fill: ink, stroke: edge, 'stroke-width': 1.2 }),
    el('circle', { cx: 0, cy: -16, r: 2.6, fill: ink, stroke: edge, 'stroke-width': 1.2 }),
    el('circle', { cx: 21, cy: -8, r: 2.6, fill: ink, stroke: edge, 'stroke-width': 1.2 }),
    el('rect', { x: -19, y: 9, width: 38, height: 5, fill: edge }),
  ],
  wave: ({ ink, edge }) =>
    [-9, 1, 11].flatMap((y) => {
      const d = `M-21 ${y} q5.25 -7 10.5 0 t10.5 0 t10.5 0 t10.5 0`;
      return [
        el('path', {
          d,
          stroke: edge,
          'stroke-width': 7,
          'stroke-linecap': 'round',
          fill: 'none',
        }),
        el('path', {
          d,
          stroke: ink,
          'stroke-width': 4,
          'stroke-linecap': 'round',
          fill: 'none',
        }),
      ];
    }),
  sun: ({ ink, edge }) => [
    ...[0, 45, 90, 135, 180, 225, 270, 315].map((deg) =>
      el('path', {
        d: 'M0 -21 L4.2 -11 H-4.2 Z',
        fill: ink,
        stroke: edge,
        'stroke-width': 1.2,
        'stroke-linejoin': 'round',
        transform: `rotate(${deg})`,
      }),
    ),
    el('circle', { r: 9, fill: ink, stroke: edge, 'stroke-width': 1.6 }),
  ],
  diamond: ({ ink, edge }) => [
    el('path', {
      d: 'M0 -22 L15 0 L0 22 L-15 0 Z',
      fill: ink,
      stroke: edge,
      'stroke-width': 1.6,
      'stroke-linejoin': 'round',
    }),
    el('path', { d: 'M0 -12 L7 0 L0 12 L-7 0 Z', fill: edge }),
  ],
};

// ─── Generation ───────────────────────────────────────────────────────────────────────────────

const SHAPE_WEIGHTS = [0.28, 0.22, 0.12, 0.14, 0.16, 0.08];
const CHARGE_WEIGHTS = [0.22, 0.1, 0.1, 0.1, 0.07, 0.09, 0.06, 0.06, 0.05, 0.06, 0.05, 0.04];
const STYLE_WEIGHTS = [0.42, 0.3, 0.28];
const PARTITION_WEIGHTS = [0.16, 0.1, 0.08, 0.1, 0.14, 0.1, 0.09, 0.05, 0.04, 0.07, 0.05, 0.02];

/** The crest of a club, from its id, colours and pattern. Deterministic. */
export function crestOf(club: Club): CrestSpec {
  const rng = Rng.create(`crest:${club.id}`);
  const shape = CREST_SHAPES[rng.fork('shape').weightedIndex(SHAPE_WEIGHTS)] as CrestShape;
  const style = CREST_STYLES[rng.fork('style').weightedIndex(STYLE_WEIGHTS)] as CrestStyle;

  // A club whose shirt is striped is likelier to carry stripes on its crest.
  const echo = PATTERN_PARTITION[club.pattern];
  const weights = CREST_PARTITIONS.map((p, i) =>
    p === echo && p !== 'plain' ? (PARTITION_WEIGHTS[i] ?? 0) * 6 : (PARTITION_WEIGHTS[i] ?? 0),
  );
  const partition = CREST_PARTITIONS[
    rng.fork('partition').weightedIndex(weights)
  ] as CrestPartition;

  // A monogram is drawn over the field: keep the charge for the other styles.
  const charge = CREST_CHARGES[rng.fork('charge').weightedIndex(CHARGE_WEIGHTS)] as CrestCharge;

  const { primary, secondary, tertiary } = club.colours;
  const backgrounds = partition === 'plain' ? [primary] : [primary, secondary];
  const ink = pickInk(
    backgrounds,
    [...(tertiary === null ? [] : [tertiary]), secondary, '#ffffff', '#f5d77a', '#111111'],
    3,
  );
  const rim = darken(primary, 0.62);
  const accent = pickInk(
    [rim],
    [...(tertiary === null ? [] : [tertiary]), secondary, '#f5d77a'],
    2.4,
  );

  return {
    shape,
    partition,
    charge,
    style,
    monogram: monogramOf(club.name),
    ribbonText: townLabel(club.city),
    colours: { field: primary, alt: secondary, ink, rim, accent },
  };
}

// ─── Rendering ────────────────────────────────────────────────────────────────────────────────

const FONT = "'Big Shoulders','Arial Narrow',Impact,sans-serif";
const INSET = 'translate(50 60) scale(0.86) translate(-50 -60)';

/**
 * The drawing of a crest as SVG elements, in a 100 × 120 box. `uid` makes the gradient and clip
 * identifiers unique when several crests share a page (use the club id).
 */
export function crestContent(spec: CrestSpec, uid: string): SvgElement[] {
  const { shape, partition, charge, style, colours } = spec;
  const outline = SHAPE_PATHS[shape];
  const clip = `${uid}-clip`;
  const gloss = `${uid}-gloss`;
  const inkEdge = colours.rim;

  const field: SvgNode[] = [
    el('rect', { x: -10, y: -10, width: 120, height: 140, fill: colours.field }),
    partition === 'plain' ? null : el('path', { d: PARTITION_PATHS[partition], fill: colours.alt }),
  ].filter((n): n is SvgElement => n !== null);

  const chargeY = style === 'charge-ribbon' ? 50 : 58;
  const chargeScale = style === 'charge-ribbon' ? 1.05 : 1.35;
  const body: SvgNode[] = [];
  if (style === 'monogram') {
    const n = spec.monogram.length;
    body.push(
      el(
        'text',
        {
          x: 50,
          y: 74,
          'text-anchor': 'middle',
          'font-family': FONT,
          'font-weight': 800,
          'font-size': 46,
          fill: colours.ink,
          stroke: inkEdge,
          'stroke-width': 3.2,
          'stroke-linejoin': 'round',
          'paint-order': 'stroke',
          textLength: n === 2 ? 56 : 66,
          lengthAdjust: 'spacingAndGlyphs',
        },
        spec.monogram,
      ),
    );
  } else {
    body.push(
      el(
        'g',
        { transform: `translate(50 ${chargeY}) scale(${chargeScale})` },
        ...CHARGES[charge]({ ink: colours.ink, edge: inkEdge }),
      ),
    );
    if (style === 'charge-ribbon') {
      const y = RIBBON_Y[shape];
      const width = shape === 'pointed' ? 38 : 50;
      body.push(
        el('rect', {
          x: 50 - width / 2,
          y,
          width,
          height: 14,
          rx: 3,
          fill: colours.rim,
          stroke: colours.accent,
          'stroke-width': 1,
        }),
        el(
          'text',
          {
            x: 50,
            y: y + 10.5,
            'text-anchor': 'middle',
            'font-family': FONT,
            'font-weight': 800,
            'font-size': 10.5,
            fill: colours.accent,
            textLength: Math.min(width - 8, 5.2 * spec.ribbonText.length),
            lengthAdjust: 'spacingAndGlyphs',
          },
          spec.ribbonText,
        ),
      );
    }
  }

  return [
    el(
      'defs',
      {},
      el(
        'linearGradient',
        { id: gloss, x1: 0, y1: 0, x2: 0, y2: 1 },
        el('stop', { offset: 0, 'stop-color': '#ffffff', 'stop-opacity': 0.4 }),
        el('stop', { offset: 0.42, 'stop-color': '#ffffff', 'stop-opacity': 0.05 }),
        el('stop', { offset: 0.6, 'stop-color': '#000000', 'stop-opacity': 0 }),
        el('stop', { offset: 1, 'stop-color': '#000000', 'stop-opacity': 0.34 }),
      ),
      el('clipPath', { id: clip }, el('path', { d: outline, transform: INSET })),
    ),
    // Outline, then the thin trim, then the field.
    el('path', { d: outline, fill: colours.rim }),
    el('path', {
      d: outline,
      fill: colours.accent,
      transform: 'translate(50 60) scale(0.94) translate(-50 -60)',
    }),
    el('path', {
      d: outline,
      fill: colours.rim,
      transform: 'translate(50 60) scale(0.9) translate(-50 -60)',
    }),
    el('g', { 'clip-path': `url(#${clip})` }, ...field, ...body),
    // Gloss and glass highlight.
    el('path', { d: outline, transform: INSET, fill: `url(#${gloss})` }),
    el('path', {
      d: 'M0 0 H100 V40 Q50 62 0 40 Z',
      fill: '#ffffff',
      'fill-opacity': 0.13,
      'clip-path': `url(#${clip})`,
    }),
    el('path', {
      d: outline,
      fill: 'none',
      stroke: lighten(colours.accent, 0.45),
      'stroke-opacity': 0.7,
      'stroke-width': 1,
    }),
  ];
}

/** A standalone crest: an `<svg>` of viewBox 0 0 100 120. */
export function crestNode(spec: CrestSpec, uid: string): SvgElement {
  return el(
    'svg',
    { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 100 120' },
    ...crestContent(spec, uid),
  );
}

export const crestSvg = (spec: CrestSpec, uid: string): string => toSvgString(crestNode(spec, uid));
