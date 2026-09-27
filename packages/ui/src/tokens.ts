// Design tokens: source of truth for values used outside CSS (canvas, Three.js, OG images).
// Mirrored as CSS variables in tokens.css (kept in sync by test/tokens.test.ts).
// Palette (GDD §12.2, provisional): deep night-pitch green, chalk white, floodlight accent, metals.

export const colors = {
  'pitch-950': '#06140f',
  'pitch-900': '#0a1f17',
  'pitch-800': '#0f2c21',
  'pitch-700': '#15402f',
  'pitch-600': '#1d5a41',
  'pitch-500': '#2a7a58',
  chalk: '#f4f1e8',
  'chalk-muted': '#c9c5b8',
  'chalk-faint': '#8f9a92',
  'floodlight-300': '#ffe29a',
  'floodlight-400': '#ffd166',
  'floodlight-500': '#ffb627',
  'floodlight-600': '#f28c28',
  'bronze-light': '#e0a872',
  bronze: '#b87333',
  'bronze-dark': '#7a4a22',
  'silver-light': '#eef2f5',
  silver: '#c0c7cf',
  'silver-dark': '#8a939c',
  'gold-light': '#f5d77a',
  gold: '#d4af37',
  'gold-dark': '#9c7a1c',
  success: '#30a46c',
  danger: '#e5484d',
} as const;

export type ColorToken = keyof typeof colors;

export const radii = {
  sm: '6px',
  md: '10px',
  lg: '16px',
  card: '14px',
  pill: '999px',
} as const;

export const fonts = {
  display: 'var(--ld-font-display-family, "Big Shoulders"), "Arial Narrow", sans-serif',
  sans: 'var(--ld-font-sans-family, Manrope), system-ui, sans-serif',
} as const;

/** CSS variable name of a colour token, e.g. cssVar('chalk') → 'var(--ld-color-chalk)'. */
export function cssVar(token: ColorToken): string {
  return `var(--ld-color-${token})`;
}
