// Builds sources/clubs-hdf.csv from JSON files a person saved by hand from the FFF's competition
// API in their own browser (the API refuses programs, so nothing here calls the network):
//
//   clubs-89-p1.json … p12.json   /api/clubs?cdg.cg_no=89&page=N      the clubs of the district
//   eng-d1-p1.json …              /api/engagements?competition.cp_no=…  who plays in D1 … D6
//   engagements-r1.json           idem for Régional 1 (eng-r2-p*.json, eng-r3-p*.json for R2, R3)
//
// A club goes in when it has a men's senior team in one of these divisions; its division is the
// highest of its teams. Kit colours and grounds come from the club's file. The raw files hold
// names and contacts of club officials (personal data): they stay on the person's machine and are
// never committed; only the club-level facts below reach the CSV.
//
// Clubs of the Hauts-de-France in National 1 / 2 outside the district come from
// sources/national-extras.csv (Wikipédia). Running this overwrites sources/clubs-hdf.csv.
//
//   node scripts/import-fff-export.ts ~/Downloads/escaut

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { kitColours } from '../src/colours.ts';
import {
  foldCommune,
  shortNameOf,
  slug,
  tidyGroundName,
  tidyName,
  withPlace,
  deCity,
} from '../src/naming.ts';

const dir = process.argv[2];
if (!dir) throw new Error('Usage: node scripts/import-fff-export.ts <folder of saved JSON files>');

// ─── Reading the saved files ─────────────────────────────────────────────────────────────────

function members(file: string): unknown[] {
  const data = JSON.parse(readFileSync(join(dir ?? '', file), 'utf8')) as unknown;
  // Saved as a JSON-LD object, or as the browser's array view of it.
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const m = (data as Record<string, unknown>)['hydra:member'];
    return Array.isArray(m) ? m : [];
  }
  if (Array.isArray(data)) return data.find((x): x is unknown[] => Array.isArray(x)) ?? [];
  return [];
}

const filesOf = (pattern: RegExp): string[] =>
  readdirSync(dir ?? '')
    .filter((f) => pattern.test(f))
    .sort();

interface FffTerrain {
  name: string;
  city: string | null;
  libelle_surface: string | null;
}
interface FffClub {
  cl_no: number;
  name: string;
  location: string | null;
  postal_code: string | null;
  colors: string | null;
  cl_statut: string;
  terrains: FffTerrain[];
}
interface FffEngagement {
  equipe: { club: { cl_no: number }; category_code: string; number: number };
}

const clubs = new Map<number, FffClub>();
for (const f of filesOf(/^clubs-89-p\d+\.json$/))
  for (const c of members(f) as FffClub[]) clubs.set(c.cl_no, c);

// ─── Divisions ───────────────────────────────────────────────────────────────────────────────

// Highest first.
const RANK = [
  'n1-a',
  'n2-d',
  'hdf-r1',
  'hdf-r2',
  'hdf-r3',
  'escaut-d1',
  'escaut-d2',
  'escaut-d3',
  'escaut-d4',
  'escaut-d5',
  'escaut-d6',
];
const rankOf = (division: string): number => {
  const i = RANK.indexOf(division);
  return i < 0 ? RANK.length : i;
};

const files: [RegExp, string][] = [
  [/^engagements-r1\.json$/, 'hdf-r1'],
  [/^eng-r2-p\d+\.json$/, 'hdf-r2'],
  [/^eng-r3-p\d+\.json$/, 'hdf-r3'],
  ...([1, 2, 3, 4, 5, 6] as const).map((d): [RegExp, string] => [
    new RegExp(`^eng-d${d}-p\\d+\\.json$`),
    `escaut-d${d}`,
  ]),
];
const best = new Map<number, string>();
const counts = new Map<string, number>();
for (const [pattern, division] of files)
  for (const f of filesOf(pattern))
    for (const e of members(f) as FffEngagement[]) {
      if (e.equipe.category_code !== 'SEM') continue;
      const clNo = e.equipe.club.cl_no;
      counts.set(division, (counts.get(division) ?? 0) + 1);
      const current = best.get(clNo);
      if (current === undefined || rankOf(division) < rankOf(current)) best.set(clNo, division);
    }

// A national team is not in the district's files: known from the FFF's own team list (Feignies) and
// from Wikipédia (Saint Amand FC).
best.set(186901, 'n1-a');
best.set(25896, 'n2-d');

// ─── Communes ────────────────────────────────────────────────────────────────────────────────

interface Commune {
  code: string;
  name: string;
  postalCodes: string[];
}
const nord = (
  JSON.parse(readFileSync(new URL('../sources/hdf-communes.json', import.meta.url), 'utf8')) as {
    communes: Commune[];
  }
).communes;

function communeOf(club: FffClub): Commune | undefined {
  const wanted = foldCommune(club.location ?? '');
  const named = nord.filter((c) => foldCommune(c.name) === wanted);
  if (named.length === 1) return named[0];
  if (named.length > 1) return named.find((c) => c.postalCodes.includes(club.postal_code ?? ''));
  // "ST AMAND" for Saint-Amand-les-Eaux, "LIGNY HAUCOURT" for a club of two communes: the postal
  // code narrows it down, then the commune sharing the most words with the registry's spelling,
  // the first word winning a tie.
  const byPostal = nord.filter((c) => c.postalCodes.includes(club.postal_code ?? ''));
  if (byPostal.length === 1) return byPostal[0];
  const words = wanted.replace(/\bsainte\b/g, 'saint').split(' ');
  const shared = (c: Commune): number => {
    const have = foldCommune(c.name)
      .replace(/\bsainte\b/g, 'saint')
      .split(' ');
    return (
      words.filter((w) => have.includes(w)).length * 10 + (have.includes(words[0] ?? '') ? 1 : 0)
    );
  };
  const ranked = [...byPostal].sort((x, y) => shared(y) - shared(x));
  return ranked[0] && shared(ranked[0]) >= 10 ? ranked[0] : undefined;
}

// ─── Grounds ─────────────────────────────────────────────────────────────────────────────────

const INDOOR = /pvc|lino|r[ée]sine|parquet|caoutchouc/i;

function surfaceOf(label: string | null): 'grass' | 'artificial' | 'stabilized' {
  if (!label) return 'grass';
  if (/synth/i.test(label)) return 'artificial';
  if (/stabilis|cendr/i.test(label)) return 'stabilized';
  return 'grass';
}

function groundOf(
  club: FffClub,
  commune: Commune,
): { name: string; surface: 'grass' | 'artificial' | 'stabilized' } {
  const here = foldCommune(commune.name);
  const outdoor = club.terrains.filter((t) => !INDOOR.test(t.libelle_surface ?? ''));
  const score = (t: FffTerrain): number =>
    (foldCommune(t.city ?? '') === here ? 4 : 0) + (/stade/i.test(t.name) ? 2 : 0);
  const best = [...outdoor].sort((a, b) => score(b) - score(a))[0];
  if (!best) return { name: `Stade municipal ${deCity(commune.name)}`, surface: 'grass' };
  return { name: tidyGroundName(best.name), surface: surfaceOf(best.libelle_surface) };
}

// ─── Rows ────────────────────────────────────────────────────────────────────────────────────

const q = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const rows: { id: string; line: string }[] = [];
const unmatched: string[] = [];
const seenIds = new Set<string>();

for (const [clNo, division] of best) {
  const club = clubs.get(clNo);
  if (!club) continue;
  const commune = communeOf(club);
  if (!commune) {
    unmatched.push(`${club.name} (${club.location ?? '?'} ${club.postal_code ?? ''})`);
    continue;
  }
  const name = withPlace(tidyName(club.name), commune.name);
  const id = `${slug(name)}-${commune.code}`;
  if (seenIds.has(id)) continue;
  seenIds.add(id);
  const kit = kitColours(club.colors);
  const ground = groundOf(club, commune);
  rows.push({
    id,
    line: [
      id,
      name,
      shortNameOf(name, commune.name),
      commune.name,
      commune.code,
      'escaut',
      division,
      'oui',
      kit?.primary ?? '',
      kit?.secondary ?? '',
      kit?.tertiary ?? '',
      kit ? 'plain' : '',
      ground.name,
      ground.surface,
      '',
      'non',
      `FFF club ${club.cl_no}, export manuel du 2026-09-30${kit ? '' : ' ; couleurs inconnues'}`,
    ]
      .map(q)
      .join(','),
  });
}

// Clubs of the Hauts-de-France above the district: no FFF file for them, Wikipédia only.
const extrasText = readFileSync(new URL('../sources/national-extras.csv', import.meta.url), 'utf8');
const extras = extrasText
  .split('\n')
  .filter((l) => l !== '' && !l.startsWith('#') && !l.startsWith('id,'));
for (const line of extras) rows.push({ id: line.slice(0, line.indexOf(',')), line });

const header = readFileSync(new URL('../sources/clubs-hdf.csv', import.meta.url), 'utf8')
  .split('\n')
  .filter((line) => line.startsWith('#') || line.startsWith('id,'))
  .join('\n');
rows.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(
  new URL('../sources/clubs-hdf.csv', import.meta.url),
  `${header}\n${rows.map((r) => r.line).join('\n')}\n`,
);

const perDivision = new Map<string, number>();
for (const division of best.values())
  perDivision.set(division, (perDivision.get(division) ?? 0) + 1);
console.log(`${rows.length} clubs written (${extras.length} national extras).`);
console.log('Senior engagements read:', [...counts].map(([d, n]) => `${d}=${n}`).join(' '));
console.log(
  'Clubs by division:',
  [...perDivision]
    .sort((a, b) => rankOf(a[0]) - rankOf(b[0]))
    .map(([d, n]) => `${d}=${n}`)
    .join(' '),
);
if (unmatched.length > 0)
  console.log(`No commune found for ${unmatched.length}:`, unmatched.join('; '));
