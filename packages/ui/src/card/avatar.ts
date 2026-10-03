// The stylised portrait of a fictional player (GDD §5.1, §5.4): a flat-shaded bust in the club's
// shirt, drawn from the player's appearance (skin, hair, beard, build). Never a photo, never a real
// person (rule 3 of CLAUDE.md). Box: 160 × 176, head centred on x = 80.

import {
  darken,
  el,
  lighten,
  mix,
  type Appearance,
  type KitSpec,
  type SvgElement,
} from '@legendes/data';

export const AVATAR_WIDTH = 160;
export const AVATAR_HEIGHT = 176;

/** Skin tones 1 to 6 (shared with the 3D character). */
export const SKIN_TONES: readonly string[] = [
  '#f5d6c1',
  '#e6b692',
  '#cf9870',
  '#ad7249',
  '#865234',
  '#5b3620',
];
/** Hair colours (shared with the 3D character). */
export const HAIR_COLOURS: Readonly<Record<Appearance['hairColour'], string>> = {
  black: '#1b1613',
  brown: '#4b2f1d',
  blond: '#c7a059',
  ginger: '#a44e27',
  grey: '#a3a19c',
};
/** Half-width of the head, and shoulder spread, by build. */
const BUILD: Readonly<Record<Appearance['build'], { head: number; shoulders: number }>> = {
  lean: { head: 22.5, shoulders: 0.92 },
  average: { head: 24, shoulders: 1 },
  stocky: { head: 25.5, shoulders: 1.08 },
};

const CX = 80;
const n = (x: number): string => String(Math.round(x * 100) / 100);

function headPath(hw: number): string {
  const l = CX - hw;
  const r = CX + hw;
  return [
    `M${n(l)} 72`,
    `C${n(l)} 47 ${n(CX - hw * 0.78)} 36 ${CX} 36`,
    `C${n(CX + hw * 0.78)} 36 ${n(r)} 47 ${n(r)} 72`,
    `C${n(r)} 91 ${n(CX + hw * 0.72)} 106 ${CX} 110`,
    `C${n(CX - hw * 0.72)} 106 ${n(l)} 91 ${n(l)} 72 Z`,
  ].join(' ');
}

function shouldersPath(spread: number): string {
  const x = (dx: number): string => n(CX + dx * spread);
  return [
    `M${x(-78)} 176`,
    `C${x(-76)} 150 ${x(-60)} 138 ${x(-30)} 131`,
    `L${x(-12)} 125`,
    `Q${CX} 136 ${x(12)} 125`,
    `L${x(30)} 131`,
    `C${x(60)} 138 ${x(76)} 150 ${x(78)} 176 Z`,
  ].join(' ');
}

function shirtPattern(kit: KitSpec): SvgElement[] {
  const fill = kit.stripe;
  switch (kit.pattern) {
    case 'stripes':
      return [-66, -38, -10, 18, 46].map((dx) =>
        el('rect', { x: CX + dx, y: 118, width: 14, height: 60, fill }),
      );
    case 'hoops':
      return [140, 162].map((y) => el('rect', { x: 0, y, width: 160, height: 11, fill }));
    case 'sash':
      return [el('path', { d: 'M20 120 L42 120 L150 178 L118 178 Z', fill })];
    case 'checks': {
      const cells: SvgElement[] = [];
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 10; col++)
          if ((row + col) % 2 === 0)
            cells.push(el('rect', { x: col * 16, y: 124 + row * 14, width: 16, height: 14, fill }));
      return cells;
    }
    default:
      return [];
  }
}

function collar(kit: KitSpec): SvgElement {
  const common = {
    fill: 'none',
    stroke: kit.collar,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  };
  switch (kit.collarStyle) {
    case 'polo':
      return el(
        'g',
        {},
        el('path', { d: 'M67 125 Q80 137 93 125', 'stroke-width': 4, ...common }),
        el('path', { d: 'M64 121 L70 136 L80 131 Z M96 121 L90 136 L80 131 Z', fill: kit.collar }),
      );
    default:
      return el('path', { d: 'M67 125 Q80 139 93 125', 'stroke-width': 5, ...common });
  }
}

/** Hair drawn behind the head (long hair, afro, bun). */
function hairBack(style: Appearance['hair'], hw: number, colour: string): SvgElement[] {
  switch (style) {
    case 'long':
      return [
        el('path', {
          d: `M${n(CX - hw - 5)} 66 C${n(CX - hw - 8)} 36 ${n(CX + hw + 8)} 36 ${n(CX + hw + 5)} 66 L${n(CX + hw + 7)} 118 Q${CX} 126 ${n(CX - hw - 7)} 118 Z`,
          fill: darken(colour, 0.15),
        }),
      ];
    case 'afro':
      return [el('circle', { cx: CX, cy: 58, r: hw + 17, fill: colour })];
    case 'tied':
      return [el('circle', { cx: CX, cy: 27, r: 9.5, fill: colour })];
    default:
      return [];
  }
}

/** Hair drawn over the head: the hairline and the top. */
function hairFront(style: Appearance['hair'], hw: number, colour: string): SvgElement[] {
  const cap = (top: number, line: number): string =>
    [
      `M${n(CX - hw - 1)} 72`,
      `C${n(CX - hw - 2)} ${top + 12} ${n(CX - hw * 0.7)} ${top} ${CX} ${top}`,
      `C${n(CX + hw * 0.7)} ${top} ${n(CX + hw + 2)} ${top + 12} ${n(CX + hw + 1)} 72`,
      `L${n(CX + hw - 2)} ${line + 12}`,
      `C${n(CX + hw - 5)} ${line} ${n(CX + hw * 0.45)} ${line - 3} ${CX} ${line}`,
      `C${n(CX - hw * 0.45)} ${line - 3} ${n(CX - hw + 5)} ${line} ${n(CX - hw + 2)} ${line + 12} Z`,
    ].join(' ');
  switch (style) {
    case 'short':
    case 'tied':
    case 'long':
      return [el('path', { d: cap(31, 50), fill: colour })];
    case 'buzz':
      return [el('path', { d: cap(35, 52), fill: colour, 'fill-opacity': 0.72 })];
    case 'curly':
      return [
        el('path', { d: cap(33, 50), fill: colour }),
        ...[-18, -9, 0, 9, 18].map((dx, i) =>
          el('circle', { cx: CX + dx * (hw / 24), cy: 37 - (i % 2) * 2, r: 7.2, fill: colour }),
        ),
      ];
    case 'afro':
      return [el('path', { d: cap(30, 52), fill: colour })];
    default:
      // Bald: a highlight on the top of the head.
      return [
        el('ellipse', { cx: CX - 6, cy: 46, rx: 11, ry: 5, fill: '#ffffff', 'fill-opacity': 0.18 }),
      ];
  }
}

function beard(style: Appearance['beard'], hw: number, colour: string): SvgElement[] {
  const jaw = [
    `M${n(CX - hw + 1)} 80`,
    `C${n(CX - hw + 1)} 99 ${n(CX - hw * 0.55)} 113 ${CX} 114`,
    `C${n(CX + hw * 0.55)} 113 ${n(CX + hw - 1)} 99 ${n(CX + hw - 1)} 80`,
    `C${n(CX + hw - 6)} 91 ${CX + 7} 92 ${CX} 92`,
    `C${CX - 7} 92 ${n(CX - hw + 6)} 91 ${n(CX - hw + 1)} 80 Z`,
  ].join(' ');
  if (style === 'full') return [el('path', { d: jaw, fill: colour })];
  if (style === 'stubble') return [el('path', { d: jaw, fill: colour, 'fill-opacity': 0.26 })];
  return [];
}

/** The portrait as SVG elements in a 160 × 176 box. `uid` makes clip identifiers unique. */
export function avatarContent(look: Appearance, kit: KitSpec, uid: string): SvgElement[] {
  const skin = SKIN_TONES[look.skin - 1] ?? SKIN_TONES[2]!;
  const shade = darken(skin, 0.2);
  const hair = HAIR_COLOURS[look.hairColour];
  const build = BUILD[look.build];
  const hw = build.head;
  const brow =
    look.hairColour === 'blond' || look.hairColour === 'grey'
      ? darken(hair, 0.45)
      : darken(hair, 0.1);
  const lip = mix(skin, '#7c3326', 0.45);
  const headClip = `${uid}-head`;
  const shirtClip = `${uid}-shirt`;
  const head = headPath(hw);
  const shoulders = shouldersPath(build.shoulders);
  const eyeDx = hw * 0.41;

  return [
    el(
      'defs',
      {},
      el('clipPath', { id: headClip }, el('path', { d: head })),
      el('clipPath', { id: shirtClip }, el('path', { d: shoulders })),
    ),
    ...hairBack(look.hair, hw, hair),
    // Neck, then the shirt over its base.
    el('path', {
      d: `M${n(CX - hw * 0.55)} 94 H${n(CX + hw * 0.55)} V134 H${n(CX - hw * 0.55)} Z`,
      fill: shade,
    }),
    // Shadow of the chin on the neck.
    el('ellipse', {
      cx: CX,
      cy: 104,
      rx: hw * 0.6,
      ry: 8,
      fill: darken(skin, 0.38),
      'fill-opacity': 0.6,
    }),
    el('path', { d: shoulders, fill: kit.body }),
    el(
      'g',
      { 'clip-path': `url(#${shirtClip})` },
      ...shirtPattern(kit),
      el('path', {
        // Light from the left: the right shoulder falls into shadow.
        d: 'M80 118 H160 V176 H80 Z',
        fill: '#000000',
        'fill-opacity': 0.16,
      }),
    ),
    collar(kit),
    el('path', {
      d: shoulders,
      fill: 'none',
      stroke: darken(kit.body, 0.55),
      'stroke-width': 1.2,
      'stroke-opacity': 0.7,
    }),
    // Ears, head, shadow side.
    el('ellipse', { cx: CX - hw, cy: 77, rx: 4.2, ry: 7, fill: shade }),
    el('ellipse', { cx: CX + hw, cy: 77, rx: 4.2, ry: 7, fill: shade }),
    el('path', {
      d: head,
      fill: skin,
      stroke: darken(skin, 0.5),
      'stroke-width': 1.1,
      'stroke-opacity': 0.55,
    }),
    el(
      'g',
      { 'clip-path': `url(#${headClip})` },
      el('path', {
        d: `M${CX + 4} 30 C${CX + 14} 60 ${CX + 12} 92 ${CX - 2} 116 H130 V30 Z`,
        fill: shade,
        'fill-opacity': 0.55,
      }),
      ...beard(look.beard, hw, hair),
    ),
    // Face.
    el('path', {
      d: `M${n(CX - eyeDx - 5)} 70 L${n(CX - eyeDx + 5)} 68.6 M${n(CX + eyeDx - 5)} 68.6 L${n(CX + eyeDx + 5)} 70`,
      stroke: brow,
      'stroke-width': 2.6,
      'stroke-linecap': 'round',
    }),
    el('ellipse', { cx: n(CX - eyeDx), cy: 76.5, rx: 2.5, ry: 2.2, fill: '#1a1411' }),
    el('ellipse', { cx: n(CX + eyeDx), cy: 76.5, rx: 2.5, ry: 2.2, fill: '#1a1411' }),
    // A catch-light in each eye: the look stays alive on every skin tone.
    el('circle', {
      cx: n(CX - eyeDx + 0.9),
      cy: 75.6,
      r: 0.85,
      fill: '#ffffff',
      'fill-opacity': 0.9,
    }),
    el('circle', {
      cx: n(CX + eyeDx + 0.9),
      cy: 75.6,
      r: 0.85,
      fill: '#ffffff',
      'fill-opacity': 0.9,
    }),
    el('path', {
      d: `M${CX} 79 Q${CX - 3.5} 88 ${CX - 1} 90 Q${CX + 2} 91 ${CX + 3} 89.5`,
      stroke: darken(skin, 0.32),
      'stroke-width': 1.5,
      fill: 'none',
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: `M${CX - 6} 97.5 Q${CX} 100.5 ${CX + 6} 97.5`,
      stroke: look.beard === 'full' ? lighten(lip, 0.1) : lip,
      'stroke-width': 1.9,
      fill: 'none',
      'stroke-linecap': 'round',
    }),
    ...hairFront(look.hair, hw, hair),
  ];
}
