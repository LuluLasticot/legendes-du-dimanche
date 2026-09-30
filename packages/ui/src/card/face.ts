// The front of a player card as an SVG tree (D-034). Pure: the same face gives the same bytes, so
// the 2D card, the share image and the 3D card's texture show the very same card.

import {
  crestContent,
  darken,
  el,
  lighten,
  type Appearance,
  type CrestSpec,
  type KitSpec,
  type SvgElement,
} from '@legendes/data';
import { AVATAR_HEIGHT, AVATAR_WIDTH, avatarContent } from './avatar.ts';
import {
  CARD_FONTS,
  CARD_HEIGHT,
  CARD_PALETTES,
  CARD_WIDTH,
  CARD_ZONES as Z,
  DEFAULT_CARD_TUNING,
  silhouette,
  type CardLook,
  type CardTuning,
} from './layout.ts';

/** Everything printed on a card, already translated. */
export interface CardFace {
  /** Unique on the page (the card id): prefixes the SVG identifiers. */
  readonly uid: string;
  readonly look: CardLook;
  readonly rating: number;
  /** Short position label ("AG"). */
  readonly position: string;
  /** "K. BENALI". */
  readonly name: string;
  /** "N2", "R1", "D3". */
  readonly division: string;
  readonly crest: CrestSpec;
  readonly clubColours: { readonly primary: string; readonly secondary: string };
  /** Six attributes in reading order: left column top to bottom, then right column. */
  readonly stats: readonly { readonly label: string; readonly value: number }[];
  readonly weakFoot: number;
  readonly skillMoves: number;
  /** "PF", "GT". */
  readonly labels: { readonly weakFoot: string; readonly skillMoves: string };
  /** First trait's name, or null. */
  readonly trait: string | null;
  /** Title of a special card ("ONZE DU WEEK-END"), null for a base card. */
  readonly promo: string | null;
  readonly appearance: Appearance;
  readonly kit: KitSpec;
}

const display = (size: number, fill: string, extra: Record<string, string | number> = {}) => ({
  class: CARD_FONTS.display.className,
  'font-family': CARD_FONTS.display.family,
  'font-weight': 800,
  'font-size': size,
  fill,
  ...extra,
});

/** Fixed positions of the sparkles of a rare card (card units). */
const SPARKLES: readonly (readonly [number, number, number])[] = [
  [206, 46, 5],
  [218, 160, 3.5],
  [34, 206, 4],
  [150, 30, 3],
  [226, 288, 3.2],
];

function sparkle(x: number, y: number, r: number, fill: string): SvgElement {
  const k = r * 0.28;
  return el('path', {
    d: `M${x} ${y - r} L${x + k} ${y - k} L${x + r} ${y} L${x + k} ${y + k} L${x} ${y + r} L${x - k} ${y + k} L${x - r} ${y} L${x - k} ${y - k} Z`,
    fill,
  });
}

function stars(count: number, x: number, y: number, fill: string, empty: string): SvgElement {
  const star = (cx: number, on: boolean): SvgElement =>
    el('path', {
      d: `M${cx} ${y - 4.4} L${cx + 1.3} ${y - 1.4} L${cx + 4.4} ${y - 1.2} L${cx + 2} ${y + 0.9} L${cx + 2.8} ${y + 4} L${cx} ${y + 2.3} L${cx - 2.8} ${y + 4} L${cx - 2} ${y + 0.9} L${cx - 4.4} ${y - 1.2} L${cx - 1.3} ${y - 1.4} Z`,
      fill: on ? fill : empty,
    });
  return el('g', {}, ...[0, 1, 2, 3, 4].map((i) => star(x + i * 9.4, i < count)));
}

/** The card's elements, in a 250 × 350 box. */
export function cardContent(
  face: CardFace,
  tuning: CardTuning = DEFAULT_CARD_TUNING,
): SvgElement[] {
  const p = CARD_PALETTES[face.look];
  const id = (name: string): string => `${face.uid}-${name}`;
  const outer = silhouette(0);
  const inner = silhouette(tuning.frame);
  const [hi, body, low] = p.metal;
  const sheen = Math.min(1, p.sheen * tuning.sheen * 0.55);
  const dark = face.look === 'weekend' || face.look === 'former-pro';

  const defs = el(
    'defs',
    {},
    el(
      'linearGradient',
      { id: id('metal'), x1: 0, y1: 0, x2: 1, y2: 1 },
      el('stop', { offset: 0, 'stop-color': hi }),
      el('stop', { offset: 0.28, 'stop-color': body }),
      el('stop', { offset: 0.5, 'stop-color': lighten(hi, 0.2) }),
      el('stop', { offset: 0.72, 'stop-color': body }),
      el('stop', { offset: 1, 'stop-color': low }),
    ),
    el(
      'linearGradient',
      { id: id('panel'), x1: 0, y1: 0, x2: 0.35, y2: 1 },
      el('stop', { offset: 0, 'stop-color': p.panel[0] }),
      el('stop', { offset: 1, 'stop-color': p.panel[1] }),
    ),
    el(
      'radialGradient',
      { id: id('glow'), cx: 0.5, cy: 0.42, r: 0.5 },
      el('stop', { offset: 0, 'stop-color': p.glow, 'stop-opacity': dark ? 0.55 : 0.85 }),
      el('stop', { offset: 1, 'stop-color': p.glow, 'stop-opacity': 0 }),
    ),
    el(
      'linearGradient',
      { id: id('sheen'), x1: 0, y1: 0, x2: 1, y2: 1 },
      el('stop', { offset: 0.3, 'stop-color': '#ffffff', 'stop-opacity': 0 }),
      el('stop', { offset: 0.44, 'stop-color': '#ffffff', 'stop-opacity': sheen }),
      el('stop', { offset: 0.5, 'stop-color': '#ffffff', 'stop-opacity': sheen * 0.35 }),
      el('stop', { offset: 0.58, 'stop-color': '#ffffff', 'stop-opacity': 0 }),
    ),
    el(
      'linearGradient',
      { id: id('foil'), x1: 0, y1: 1, x2: 1, y2: 0 },
      el('stop', { offset: 0, 'stop-color': '#ff6ec7', 'stop-opacity': 0.0 }),
      el('stop', { offset: 0.25, 'stop-color': '#ff6ec7', 'stop-opacity': 0.22 }),
      el('stop', { offset: 0.45, 'stop-color': '#7dd8ff', 'stop-opacity': 0.24 }),
      el('stop', { offset: 0.65, 'stop-color': '#b6ff8a', 'stop-opacity': 0.2 }),
      el('stop', { offset: 0.85, 'stop-color': '#ffe27a', 'stop-opacity': 0.22 }),
      el('stop', { offset: 1, 'stop-color': '#ffe27a', 'stop-opacity': 0 }),
    ),
    el(
      'radialGradient',
      { id: id('vignette'), cx: 0.5, cy: 0.4, r: 0.75 },
      el('stop', { offset: 0.55, 'stop-color': '#000000', 'stop-opacity': 0 }),
      el('stop', { offset: 1, 'stop-color': '#000000', 'stop-opacity': dark ? 0.5 : 0.28 }),
    ),
    // Portrait fades into the card above the name.
    el(
      'linearGradient',
      { id: id('fade'), x1: 0, y1: 0, x2: 0, y2: 1 },
      el('stop', { offset: 0.8, 'stop-color': '#ffffff', 'stop-opacity': 1 }),
      el('stop', { offset: 1, 'stop-color': '#ffffff', 'stop-opacity': 0 }),
    ),
    el(
      'mask',
      { id: id('portrait-mask'), maskContentUnits: 'objectBoundingBox' },
      el('rect', { x: 0, y: 0, width: 1, height: 1, fill: `url(#${id('fade')})` }),
    ),
    // The fence of an amateur ground: a diamond mesh.
    el(
      'pattern',
      {
        id: id('mesh'),
        width: 14,
        height: 14,
        patternUnits: 'userSpaceOnUse',
        patternTransform: 'rotate(45)',
      },
      el('path', {
        d: 'M0 0 H14 M0 0 V14',
        stroke: dark ? '#ffffff' : p.ink,
        'stroke-width': 1.1,
        fill: 'none',
      }),
    ),
    el('clipPath', { id: id('panel-clip') }, el('path', { d: inner })),
    ...(tuning.grain > 0
      ? [
          el(
            'filter',
            { id: id('grain'), x: 0, y: 0, width: 1, height: 1 },
            el('feTurbulence', {
              type: 'fractalNoise',
              baseFrequency: 0.9,
              numOctaves: 2,
              seed: 3,
              stitchTiles: 'stitch',
            }),
            el('feColorMatrix', { type: 'saturate', values: 0 }),
          ),
        ]
      : []),
  );

  // Background of the panel: gradient, club colours, mesh, floodlight.
  const { primary, secondary } = face.clubColours;
  const panel = el(
    'g',
    { 'clip-path': `url(#${id('panel-clip')})` },
    el('rect', { width: CARD_WIDTH, height: CARD_HEIGHT, fill: `url(#${id('panel')})` }),
    // Floodlight beams from a tower beyond the top right corner.
    ...[0, 1, 2, 3].map((k) =>
      el('path', {
        d: `M262 -24 L${-40 + k * 70} 360 L${-8 + k * 70} 360 Z`,
        fill: dark ? p.accent : '#ffffff',
        'fill-opacity': dark ? 0.07 : 0.13,
      }),
    ),
    // The club's colours: a banner rising behind the player.
    el('path', {
      d: 'M150 0 H206 L162 250 H106 Z',
      fill: primary,
      'fill-opacity': tuning.clubBand,
    }),
    el('path', {
      d: 'M206 0 H218 L174 250 H162 Z',
      fill: secondary,
      'fill-opacity': tuning.clubBand,
    }),
    el('rect', {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      fill: `url(#${id('mesh')})`,
      opacity: tuning.mesh,
    }),
    el('ellipse', { cx: 150, cy: 100, rx: 112, ry: 108, fill: `url(#${id('glow')})` }),
    ...(p.foil
      ? [0, 1, 2, 3].map((k) =>
          el('path', {
            d: `M${-60 + k * 95} 350 L${40 + k * 95} 0 H${62 + k * 95} L${-38 + k * 95} 350 Z`,
            fill: `url(#${id('foil')})`,
          }),
        )
      : []),
    el('rect', { width: CARD_WIDTH, height: CARD_HEIGHT, fill: `url(#${id('vignette')})` }),
    ...(tuning.grain > 0
      ? [
          el('rect', {
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            filter: `url(#${id('grain')})`,
            opacity: tuning.grain,
            style: 'mix-blend-mode:overlay',
          }),
        ]
      : []),
  );

  // Portrait.
  const { portrait } = Z;
  const scale = portrait.width / AVATAR_WIDTH;
  const avatar = el(
    'g',
    { 'clip-path': `url(#${id('panel-clip')})` },
    el(
      'g',
      {
        transform: `translate(${portrait.x} ${portrait.y}) scale(${scale})`,
        mask: `url(#${id('portrait-mask')})`,
      },
      el('rect', {
        width: AVATAR_WIDTH,
        height: AVATAR_HEIGHT,
        fill: '#000000',
        'fill-opacity': 0,
      }),
      ...avatarContent(face.appearance, face.kit, id('avatar')),
    ),
  );

  // Left column: rating, position, crest, division.
  const cx = Z.column.x;
  const crestScale = Z.crest.width / 100;
  const column: SvgElement[] = [
    el(
      'text',
      display(Z.rating.size, p.ink, {
        x: cx,
        y: Z.rating.y,
        'text-anchor': 'middle',
        'font-weight': 900,
      }),
      String(face.rating),
    ),
    el(
      'text',
      display(Z.position.size, p.inkSoft, { x: cx, y: Z.position.y, 'text-anchor': 'middle' }),
      face.position,
    ),
    el('path', {
      d: `M${cx - 14} 111 H${cx + 14}`,
      stroke: p.accent,
      'stroke-width': 1.4,
      'stroke-opacity': 0.7,
    }),
    el(
      'g',
      { transform: `translate(${Z.crest.x} ${Z.crest.y}) scale(${crestScale})` },
      ...crestContent(face.crest, id('crest')),
    ),
    el('rect', {
      x: cx - Z.division.width / 2,
      y: Z.division.y - Z.division.height / 2,
      width: Z.division.width,
      height: Z.division.height,
      rx: 4,
      fill: p.ink,
      'fill-opacity': dark ? 0.16 : 0.85,
      stroke: dark ? p.accent : 'none',
      'stroke-width': 1,
    }),
    el(
      'text',
      display(12, dark ? p.ink : p.panel[0], {
        x: cx,
        y: Z.division.y + 4.4,
        'text-anchor': 'middle',
      }),
      face.division,
    ),
  ];

  // Name and divider (club colours in the middle).
  const long = face.name.length > 13;
  const name = el(
    'text',
    display(Z.name.size, p.ink, {
      x: CARD_WIDTH / 2,
      y: Z.name.y,
      'text-anchor': 'middle',
      'letter-spacing': 0.5,
      ...(long ? { textLength: Z.name.maxWidth, lengthAdjust: 'spacingAndGlyphs' } : {}),
    }),
    face.name,
  );
  const divider: SvgElement[] = [
    el('path', {
      d: `M28 ${Z.divider.y} H112 M138 ${Z.divider.y} H222`,
      stroke: p.accent,
      'stroke-width': 1.2,
      'stroke-opacity': 0.75,
    }),
    el('rect', {
      x: 114,
      y: Z.divider.y - 2.5,
      width: 11,
      height: 5,
      rx: 1,
      fill: primary,
      stroke: p.accent,
      'stroke-width': 0.6,
    }),
    el('rect', {
      x: 125,
      y: Z.divider.y - 2.5,
      width: 11,
      height: 5,
      rx: 1,
      fill: secondary,
      stroke: p.accent,
      'stroke-width': 0.6,
    }),
  ];

  // Six attributes in two columns.
  const stats: SvgElement[] = face.stats.slice(0, 6).flatMap(({ label, value }, i) => {
    const col = Z.stats.columns[Math.floor(i / 3)] ?? 80;
    const y = Z.stats.rows[i % 3] ?? 259;
    return [
      el(
        'text',
        display(Z.stats.size, p.ink, { x: col - 4, y, 'text-anchor': 'end', 'font-weight': 900 }),
        String(value),
      ),
      el(
        'text',
        display(Z.stats.labelSize, p.inkSoft, { x: col + 3, y: y - 0.5, 'font-weight': 700 }),
        label,
      ),
    ];
  });
  const statsRule = el('path', {
    d: `M125 ${Z.stats.rows[0] - 17} V${Z.stats.rows[2] + 5}`,
    stroke: p.accent,
    'stroke-width': 1,
    'stroke-opacity': 0.55,
  });

  // Footer: weak foot, skill moves, first trait.
  const footer: SvgElement[] = [
    el(
      'text',
      display(Z.footer.size, p.inkSoft, { x: 40, y: Z.footer.y + 3.6, 'text-anchor': 'end' }),
      face.labels.weakFoot,
    ),
    stars(face.weakFoot, 47, Z.footer.y, p.accent, dark ? '#ffffff26' : '#00000026'),
    el(
      'text',
      display(Z.footer.size, p.inkSoft, { x: 150, y: Z.footer.y + 3.6, 'text-anchor': 'end' }),
      face.labels.skillMoves,
    ),
    stars(face.skillMoves, 157, Z.footer.y, p.accent, dark ? '#ffffff26' : '#00000026'),
  ];
  if (face.trait !== null) {
    footer.push(
      el(
        'text',
        {
          class: CARD_FONTS.sans.className,
          'font-family': CARD_FONTS.sans.family,
          'font-weight': 700,
          'font-size': 9.5,
          fill: p.inkSoft,
          x: CARD_WIDTH / 2,
          y: Z.footer.traitY,
          'text-anchor': 'middle',
          'letter-spacing': 0.6,
        },
        face.trait.toUpperCase(),
      ),
    );
  }

  const promo: SvgElement[] =
    face.promo === null
      ? []
      : [
          el(
            'text',
            {
              class: CARD_FONTS.sans.className,
              'font-family': CARD_FONTS.sans.family,
              'font-weight': 800,
              'font-size': Z.promo.size,
              fill: p.accent,
              x: CARD_WIDTH / 2,
              y: Z.promo.y,
              'text-anchor': 'middle',
              'letter-spacing': 1.6,
            },
            face.promo.toUpperCase(),
          ),
        ];

  // Frame on top: metal ring (outer minus inner), bevel lines, then shine.
  const frame = [
    el('path', { d: `${outer} ${inner}`, fill: `url(#${id('metal')})`, 'fill-rule': 'evenodd' }),
    el('path', {
      d: silhouette(1.2),
      fill: 'none',
      stroke: lighten(hi, 0.4),
      'stroke-width': 1,
      'stroke-opacity': 0.8,
    }),
    el('path', { d: inner, fill: 'none', stroke: darken(low, 0.35), 'stroke-width': 1.4 }),
    el('path', {
      d: silhouette(tuning.frame + 2.4),
      fill: 'none',
      stroke: p.accent,
      'stroke-width': 0.8,
      'stroke-opacity': 0.55,
    }),
  ];
  const shine: SvgElement[] = [
    el('path', { d: outer, fill: `url(#${id('sheen')})` }),
    ...(p.foil ? SPARKLES.map(([x, y, r]) => sparkle(x, y, r, dark ? p.accent : '#ffffff')) : []),
  ];

  return [
    defs,
    panel,
    avatar,
    ...column,
    name,
    ...divider,
    statsRule,
    ...stats,
    ...footer,
    ...promo,
    ...frame,
    ...shine,
  ];
}

/** A standalone card: an `<svg>` of viewBox 0 0 250 350. */
export function cardNode(face: CardFace, tuning?: CardTuning): SvgElement {
  return el(
    'svg',
    { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${CARD_WIDTH} ${CARD_HEIGHT}` },
    ...cardContent(face, tuning),
  );
}
