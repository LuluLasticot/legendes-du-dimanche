// Kit colours as a registry writes them ("VERT BLEU", "JAUNE ET NOIR", "NOIR/OR", "BLEU MARINE")
// turned into hex colours for the crest, the kit and the card.

const BASE: Readonly<Record<string, string>> = {
  rouge: '#c8102e',
  bleu: '#1f5fbf',
  vert: '#1b8a3a',
  jaune: '#f6c400',
  blanc: '#ffffff',
  noir: '#111111',
  orange: '#f28a1a',
  violet: '#6a2c91',
  mauve: '#6a2c91',
  rose: '#e75a9b',
  gris: '#8a8f98',
  marron: '#6b4226',
  bordeaux: '#7a1230',
  grenat: '#7a1230',
  turquoise: '#1aa6a6',
  or: '#d4a017',
  argent: '#b8bcc4',
  sang: '#c8102e',
};

/** A word after a colour that changes its shade ("bleu marine", "vert clair"). */
const SHADES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  bleu: {
    marine: '#0b2a6f',
    ciel: '#7ac8f0',
    fonce: '#0b2a6f',
    royal: '#2350d0',
    clair: '#7ac8f0',
  },
  vert: { fonce: '#0f5132', clair: '#6fcf7a', pomme: '#6fcf7a', bouteille: '#0f5132' },
  rouge: { fonce: '#8f0b22', vif: '#e0142f' },
  jaune: { fonce: '#d9a800', or: '#d4a017' },
  gris: { fonce: '#4a4f57', clair: '#c5c9cf' },
};

const fold = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * The colours in a registry's free text, in order, at most three. Unknown words are ignored; the
 * result is empty when nothing is recognised.
 */
export function parseKitColours(text: string | null | undefined): string[] {
  if (!text) return [];
  const words = fold(text)
    .split(/[^a-z]+/)
    .filter((w) => w !== '' && w !== 'et');
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i] ?? '';
    const base = BASE[word];
    if (base === undefined) continue;
    const shade = SHADES[word]?.[words[i + 1] ?? ''];
    if (shade !== undefined) i++;
    const hex = shade ?? base;
    if (!out.includes(hex)) out.push(hex);
  }
  return out.slice(0, 3);
}

/** Primary, secondary and tertiary colours; a lone colour gets the white or black that shows it. */
export function kitColours(
  text: string | null | undefined,
): { primary: string; secondary: string; tertiary: string | null } | null {
  const found = parseKitColours(text);
  const primary = found[0];
  if (primary === undefined) return null;
  const secondary =
    found[1] ?? (primary === '#ffffff' || primary === '#f6c400' ? '#111111' : '#ffffff');
  return { primary, secondary, tertiary: found[2] ?? null };
}
