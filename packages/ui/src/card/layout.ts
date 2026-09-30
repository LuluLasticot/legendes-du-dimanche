// The player card's single source of truth (Phase 3, D-034): size, zones and palettes in card
// units. The SVG drawing (`face.ts`) reads it for the 2D card and the share image; the canvas
// painter of the 3D card (step 5) will read the same values.
//
// Original design (rule 4 of CLAUDE.md): a 90s sticker spirit — metal frame, notch at the top
// like a ticket stub, the diamond mesh of a ground's fence in the background — with the shine
// of a modern collectible. Nothing is borrowed from another game's cards.

import type { CardTier, Rarity } from '@legendes/shared';
import type { CardVariant } from '@legendes/data';

export const CARD_WIDTH = 250;
export const CARD_HEIGHT = 350;

export const CARD_LOOKS = [
  'bronze-common',
  'bronze-rare',
  'silver-common',
  'silver-rare',
  'gold-common',
  'gold-rare',
  'weekend',
  'former-pro',
] as const;
export type CardLook = (typeof CARD_LOOKS)[number];

export function lookOf(tier: CardTier, rarity: Rarity, variant: CardVariant): CardLook {
  if (variant === 'weekend') return 'weekend';
  if (variant === 'former-pro') return 'former-pro';
  const metal = tier === 'special' ? 'gold' : tier;
  return `${metal}-${rarity}`;
}

export interface CardPalette {
  /** Frame metal: highlight, body, shadow. */
  readonly metal: readonly [string, string, string];
  /** Inner panel, top to bottom. */
  readonly panel: readonly [string, string];
  /** Rating, name and values. */
  readonly ink: string;
  /** Labels and secondary text. */
  readonly inkSoft: string;
  /** Lines, stars, promo title. */
  readonly accent: string;
  /** Floodlight behind the portrait. */
  readonly glow: string;
  /** Rare cards: diagonal foil streaks and sparkles. */
  readonly foil: boolean;
  /** Opacity of the white sweep across the card. */
  readonly sheen: number;
}

export const CARD_PALETTES: Readonly<Record<CardLook, CardPalette>> = {
  'bronze-common': {
    metal: ['#e9b98e', '#b0723a', '#5e3417'],
    panel: ['#c98d5a', '#7d4a22'],
    ink: '#2a1608',
    inkSoft: '#4f2d12',
    accent: '#5c3314',
    glow: '#f4cda6',
    foil: false,
    sheen: 0.18,
  },
  'bronze-rare': {
    metal: ['#ffd9b3', '#d4803c', '#6b3310'],
    panel: ['#e5a066', '#8e4d1f'],
    ink: '#2a1305',
    inkSoft: '#4f260b',
    accent: '#5a2a0a',
    glow: '#ffe0bf',
    foil: true,
    sheen: 0.32,
  },
  'silver-common': {
    metal: ['#f6f8fa', '#b3bcc6', '#5f6873'],
    panel: ['#d6dce3', '#8e98a3'],
    ink: '#131b24',
    inkSoft: '#34404c',
    accent: '#27323d',
    glow: '#ffffff',
    foil: false,
    sheen: 0.22,
  },
  'silver-rare': {
    metal: ['#ffffff', '#c9d4df', '#667280'],
    panel: ['#eaf0f6', '#9eaab8'],
    ink: '#0e1620',
    inkSoft: '#2c3947',
    accent: '#1f2b38',
    glow: '#ffffff',
    foil: true,
    sheen: 0.38,
  },
  'gold-common': {
    metal: ['#fbe8a6', '#cfa634', '#7a5c0e'],
    panel: ['#ead07a', '#a78322'],
    ink: '#271c02',
    inkSoft: '#4a3707',
    accent: '#553f05',
    glow: '#fff4c8',
    foil: false,
    sheen: 0.24,
  },
  'gold-rare': {
    metal: ['#fff6cc', '#eec13a', '#86620a'],
    panel: ['#f8de7c', '#bf941a'],
    ink: '#241900',
    inkSoft: '#473404',
    accent: '#4f3a02',
    glow: '#fffbe6',
    foil: true,
    sheen: 0.4,
  },
  weekend: {
    metal: ['#fbe7a1', '#d4af37', '#6d5208'],
    panel: ['#232326', '#060607'],
    ink: '#f6dc85',
    inkSoft: '#c9b067',
    accent: '#d4af37',
    glow: '#d4af37',
    foil: true,
    sheen: 0.3,
  },
  'former-pro': {
    metal: ['#f5ecd3', '#c3b083', '#6e5e37'],
    panel: ['#20325a', '#0a1328'],
    ink: '#f5ecd3',
    inkSoft: '#b9ae93',
    accent: '#e0a84a',
    glow: '#8fb0e8',
    foil: true,
    sheen: 0.26,
  },
};

/** Settings exposed in /lab/cards to tune the look without touching the code. */
export interface CardTuning {
  /** Frame thickness in card units. */
  readonly frame: number;
  /** Opacity of the fence mesh in the background. */
  readonly mesh: number;
  /** Multiplier of the palette's sheen. */
  readonly sheen: number;
  /** Opacity of the club's colours behind the portrait. */
  readonly clubBand: number;
  /** Opacity of the paper grain (0 turns the filter off). */
  readonly grain: number;
}

export const DEFAULT_CARD_TUNING: CardTuning = {
  frame: 8,
  mesh: 0.09,
  sheen: 1,
  clubBand: 0.34,
  grain: 0.12,
};

/** Zones, in card units. */
export const CARD_ZONES = {
  /** Left column: rating, position, crest, division. */
  column: { x: 45 },
  rating: { y: 80, size: 60 },
  position: { y: 104, size: 21 },
  crest: { x: 27, y: 116, width: 36 },
  division: { y: 172, width: 34, height: 16 },
  portrait: { x: 56, y: 6, width: 196, height: 216 },
  promo: { y: 26, size: 9 },
  name: { y: 223, size: 27, maxWidth: 200 },
  divider: { y: 234 },
  stats: { rows: [259, 281, 303], columns: [80, 172], size: 22, labelSize: 15 },
  footer: { y: 324, traitY: 338, size: 10.5 },
  notch: { from: 96, to: 154, depth: 7 },
} as const;

/**
 * The card's outline inset by `inset` units: top corners cut like a ticket, bottom corners
 * rounded, a shallow notch in the middle of the top edge.
 */
export function silhouette(inset: number): string {
  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;
  const i = inset;
  const c = Math.max(4, 24 - i * 0.42);
  const r = Math.max(3, 18 - i);
  const { from, to, depth } = CARD_ZONES.notch;
  const n = (x: number): string => String(Math.round(x * 100) / 100);
  return [
    `M${n(i)} ${n(i + c)}`,
    `L${n(i + c)} ${n(i)}`,
    `H${n(from - i * 0.4)}`,
    `L${n(from + depth - i * 0.4)} ${n(i + depth)}`,
    `H${n(to - depth + i * 0.4)}`,
    `L${n(to + i * 0.4)} ${n(i)}`,
    `H${n(W - i - c)}`,
    `L${n(W - i)} ${n(i + c)}`,
    `V${n(H - i - r)}`,
    `Q${n(W - i)} ${n(H - i)} ${n(W - i - r)} ${n(H - i)}`,
    `H${n(i + r)}`,
    `Q${n(i)} ${n(H - i)} ${n(i)} ${n(H - i - r)}`,
    'Z',
  ].join(' ');
}

/** Font stacks: the class lets a page apply its loaded fonts, the attribute is the fallback. */
export const CARD_FONTS = {
  display: {
    family: "'Big Shoulders','Arial Narrow',Impact,sans-serif",
    className: 'ld-font-display',
  },
  sans: { family: 'Manrope,system-ui,sans-serif', className: 'ld-font-sans' },
} as const;
