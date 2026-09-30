// Names of clubs, communes and grounds as the game writes them. Registries shout in capitals with
// dotted initials ("U.S. LIEU ST AMAND", "ENT. FEIGNIES AULNOYE FOOTBALL CLUB"): these helpers turn
// them into names a person would print on a card.

const SMALL = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'sur',
  'en',
  'lez',
  'et',
  'aux',
  'au',
  'sous',
  'l',
  'd',
]);
const ACRONYMS = new Set(
  'fc us as es rc sc ac js cs os aj ol ca afc asc usm usc cso usl osc esc rcs'.split(' '),
);

const cap = (w: string): string => (w.charAt(0).toUpperCase() + w.slice(1)).trim();

/** Lowercase, no accents, no punctuation: the form two spellings of a name share. */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/['’.\-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A commune name as registries write it ("ST AMAND", "LIEU ST AMAND") in the folded form. */
export function foldCommune(text: string): string {
  return foldText(text)
    .replace(/\bcedex\b.*$/, '')
    .replace(/\bste\b/g, 'sainte')
    .replace(/\bst\b/g, 'saint')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Registry abbreviations of several letters ("ENT.S.", "ET.S.", "AM.F.C."), expanded first. */
const MULTI: readonly [RegExp, string][] = [
  [/\bENT\.\s?S\./g, 'ENTENTE SPORTIVE'],
  [/\bET\.\s?S\./g, 'ETOILE SPORTIVE'],
  [/\bAM\.\s?S\./g, 'AMICALE SPORTIVE'],
  [/\bAM\.\s?F\.\s?C\./g, 'AMICALE FC'],
  [/\bESP\.\s?S\./g, 'ESPERANCE SPORTIVE'],
  [/\bAV\.\s?O\./g, 'AVENIR OLYMPIQUE'],
];

/** Single abbreviated words, once the dotted initials ("U.S.") have been set aside. */
const SINGLE: readonly [RegExp, string][] = [
  [/\bET\.(?=\s|$)/g, 'ETOILE'],
  [/\bESP\.(?=\s|$)/g, 'ESPERANCE'],
  [/\bSP\.(?=\s|$)/g, 'SPORTING'],
  [/\bENT\.(?=\s|$)/g, 'ENTENTE'],
  [/\bAM\.(?=\s|$)/g, 'AMICALE'],
  [/\bASS\.(?=\s|$)/g, 'ASSOCIATION'],
  [/\bO\.(?=\s|$)/g, 'OLYMPIQUE'],
  [/\bS\.(?=\s|$)/g, 'SPORTIF'],
  [/\bF\.(?=\s|$)/g, 'FOOTBALL'],
  [/\bSTE\.?(?=\s)/g, 'SAINTE'],
  [/\bST\.?(?=\s)/g, 'SAINT'],
];

function expandAbbreviations(raw: string): string {
  let text = raw.toUpperCase();
  for (const [pattern, replacement] of MULTI) text = text.replace(pattern, replacement);
  // Dotted initials ("U.S.", "A. S.", "R.C.") become one acronym token, kept in capitals.
  text = text.replace(/\b(?:[A-Z]\.\s?){2,}/g, (m) => ` §${m.replace(/[.\s]/g, '')} `);
  for (const [pattern, replacement] of SINGLE) text = text.replace(pattern, replacement);
  return text;
}

/**
 * "U.S. LIEU ST AMAND" → "US Lieu Saint Amand": initials joined and kept in capitals, Saint
 * written out, the rest in title case with French particles in lower case.
 */
export function tidyName(raw: string): string {
  const expanded = expandAbbreviations(raw)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return expanded
    .split(' ')
    .map((word, i) => {
      if (word.startsWith('§')) return word.slice(1).toUpperCase();
      const w = word.toLowerCase();
      if (ACRONYMS.has(w)) return w.toUpperCase();
      if (i > 0 && SMALL.has(w)) return w;
      // "d'Avesnes", "l'Écluse": the particle in lower case, what follows capitalised.
      const apostrophe = w.match(/^([dl])['’](.+)$/);
      if (apostrophe) return `${apostrophe[1]}'${cap(apostrophe[2] ?? '')}`;
      return w.split('-').map(cap).join('-');
    })
    .join(' ');
}

/** Words that say what a club is, not which club it is. */
const GENERIC = new Set(
  'football foot ball club union sportive association entente olympique racing etoile sporting athletic jeunesse stade amicale omnisports de du des la le les et d l fc us as es rc sc ac js cs os aj'.split(
    ' ',
  ),
);

/** "US" alone says nothing: the commune is what tells the club apart. */
export function withPlace(name: string, city: string): string {
  const words = foldText(name).split(' ').filter(Boolean);
  return words.every((w) => GENERIC.has(w) || /^\d+$/.test(w)) ? `${name} ${city}` : name;
}

/** "de Lille", "d'Avesnes". */
export const deCity = (city: string): string =>
  /^[aeiouyhàâéèêîôû]/i.test(city) ? `d'${city}` : `de ${city}`;

const ABBREVIATIONS: readonly [RegExp, string][] = [
  [/^Football Club /, 'FC '],
  [/^Foot Ball Club /, 'FC '],
  [/^Union Sportive /, 'US '],
  [/^Association Sportive /, 'AS '],
  [/^Entente Sportive /, 'ES '],
  [/^Racing Club /, 'RC '],
  [/^Sporting Club /, 'SC '],
  [/^Athletic Club /, 'AC '],
  [/^Jeunesse Sportive /, 'JS '],
  [/^Club Sportif /, 'CS '],
];

/** Short name for a scoreboard or a card (24 characters at most). */
export function shortNameOf(name: string, city: string): string {
  let short = name;
  for (const [pattern, replacement] of ABBREVIATIONS) short = short.replace(pattern, replacement);
  short = short.replace(/^(FC|US|AS|ES|RC|SC|AC|JS|CS) (de la |de l'|du |des |de |d')/i, '$1 ');
  return short.length <= 24 ? short : city.length <= 24 ? city : short.slice(0, 24).trim();
}

/** Stable identifier: lowercase letters, digits and dashes. */
export const slug = (text: string): string =>
  foldText(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** A ground's name: "STADE ERNEST LABROSSE 1" → "Stade Ernest Labrosse". */
export function tidyGroundName(raw: string): string {
  return tidyName(raw.replace(/\s+\d+$/, '').replace(/\s*'\s*/g, "'"));
}
