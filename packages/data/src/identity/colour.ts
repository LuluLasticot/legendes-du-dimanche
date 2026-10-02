// Colour arithmetic for the crest, the kit and the card. Only additions, multiplications and
// rounding: the same colours come out on every engine (no `Math.pow`, whose last digit can differ
// from one JavaScript engine to another and flip a comparison).

export type Rgb = readonly [r: number, g: number, b: number];

export function parseHex(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

const byte = (x: number): string =>
  Math.min(255, Math.max(0, Math.round(x)))
    .toString(16)
    .padStart(2, '0');

export const toHex = ([r, g, b]: Rgb): string => `#${byte(r)}${byte(g)}${byte(b)}`;

/** `t` = 0 gives `a`, 1 gives `b`. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  return toHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
}

export const darken = (hex: string, t: number): string => mix(hex, '#000000', t);
export const lighten = (hex: string, t: number): string => mix(hex, '#ffffff', t);

/** Relative luminance with a squared (gamma 2) transfer curve: close to WCAG's, exact everywhere. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((c) => c / 255) as [number, number, number];
  return 0.2126 * r * r + 0.7152 * g * g + 0.0722 * b * b;
}

/**
 * How far apart two colours look, 0 (same) to about 765 (black and white): RGB distance weighted
 * by the mean red ("redmean"), a cheap stand-in for a perceptual distance.
 */
export function colourDistance(a: string, b: string): number {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const r = (ar + br) / 2;
  const dr = ar - br;
  const dg = ag - bg;
  const db = ab - bb;
  return Math.sqrt((2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db);
}

/** Contrast ratio between two colours, 1 (same) to 21 (black on white). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The first candidate that stands out from every background (contrast of `min` or more), else
 * the candidate that stands out the most. Candidates come in order of preference: club colours
 * first, then neutrals.
 */
export function pickInk(
  backgrounds: readonly string[],
  candidates: readonly string[],
  min = 3,
): string {
  let best = candidates[0] ?? '#ffffff';
  let bestScore = -1;
  for (const c of candidates) {
    const score = Math.min(...backgrounds.map((bg) => contrast(c, bg)));
    if (score >= min) return c;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

/** Black or white, whichever reads on `hex`. */
export const readableOn = (hex: string): string => (luminance(hex) > 0.36 ? '#111111' : '#ffffff');
