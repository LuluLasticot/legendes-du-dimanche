/** Club prefixes that say nothing about which club it is (FC, US, Olympique…). */
const PREFIXES = new Set([
  'fc',
  'us',
  'as',
  'sc',
  'es',
  'rc',
  'js',
  'ac',
  'cs',
  'sa',
  'ja',
  'ol',
  'olympique',
  'stade',
  'union',
  'sporting',
  'racing',
  'entente',
  'association',
  'club',
  'football',
  'amicale',
  'avenir',
  'étoile',
  'etoile',
  'jeunesse',
  'la',
  'le',
  'les',
  'de',
  'du',
  'des',
  'et',
]);

/**
 * Three-letter code of a club for narrow screens: the first letters of the first word that
 * names the place ("FC Avesnes-le-Sec" → "AVE", "US Saint-Amand" → "STA").
 */
export function teamCode(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[\s-]+/)
    .filter(Boolean);
  const word = words.find((w) => !PREFIXES.has(w.toLowerCase())) ?? words[0] ?? name;
  // "Saint" / "Sainte" read as ST.
  if (/^saint/i.test(word)) {
    const next = words[words.indexOf(word) + 1];
    return `ST${(next ?? 'X').charAt(0)}`.toUpperCase();
  }
  return word.slice(0, 3).toUpperCase();
}
