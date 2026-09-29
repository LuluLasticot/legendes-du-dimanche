// The world as the game uses it: reference tables + clubs, built from the club list
// (sources/clubs-hdf.csv) by `pnpm --filter @legendes/data build:seed` and committed as
// `generated/clubs.ts`. Build-time code (CSV → validated clubs) and run-time lookups live here.

import { Rng } from '@legendes/engine/rng';
import { parseCsvRecords } from './csv.ts';
import { DISTRICTS, DIVISIONS, LEAGUES } from './reference.ts';
import {
  clubSchema,
  districtSchema,
  divisionSchema,
  leagueSchema,
  SHIRT_PATTERNS,
  SURFACES,
  type Club,
  type District,
  type Division,
  type League,
  type ShirtPattern,
  type Surface,
} from './schema.ts';

export interface Universe {
  readonly leagues: readonly League[];
  readonly districts: readonly District[];
  readonly divisions: readonly Division[];
  readonly clubs: readonly Club[];
}

// Plausible kit colours for clubs whose colours are not known yet (marked `guess`, to correct).
const GUESS_PALETTE: readonly (readonly [string, string])[] = [
  ['#c8102e', '#ffffff'],
  ['#0b3d91', '#ffffff'],
  ['#1b5e20', '#ffffff'],
  ['#f9a825', '#111111'],
  ['#111111', '#c8102e'],
  ['#6a1b9a', '#ffffff'],
  ['#00838f', '#ffffff'],
  ['#ffffff', '#0b3d91'],
  ['#ef6c00', '#111111'],
  ['#d81b60', '#ffffff'],
  ['#2e7d32', '#f9a825'],
  ['#1565c0', '#c8102e'],
];

const text = (row: Record<string, string>, key: string): string => row[key] ?? '';

/** Colours guessed from the club id: same club, same guess, on every machine. */
export function guessColours(clubId: string): {
  primary: string;
  secondary: string;
  pattern: ShirtPattern;
} {
  const rng = Rng.create(`colours:${clubId}`);
  const [primary, secondary] = rng.pick(GUESS_PALETTE);
  return { primary, secondary, pattern: rng.pick(SHIRT_PATTERNS) };
}

function surfaceOf(value: string, where: string): Surface {
  const surface = SURFACES.find((s) => s === value);
  if (!surface) throw new Error(`${where}: unknown surface "${value}" (${SURFACES.join(', ')})`);
  return surface;
}

/** Parses the club list: validation with Zod, guessed colours filled in where they are missing. */
export function parseClubs(csv: string): Club[] {
  return parseCsvRecords(csv).map((row, i) => {
    const where = `clubs-hdf.csv row ${i + 1} (${text(row, 'id') || text(row, 'name')})`;
    const id = text(row, 'id');
    const guessed = guessColours(id);
    const known = text(row, 'primary') !== '' && text(row, 'secondary') !== '';
    const parsed = clubSchema.safeParse({
      id,
      name: text(row, 'name'),
      shortName: text(row, 'short_name') || text(row, 'name'),
      city: text(row, 'city'),
      insee: text(row, 'insee'),
      districtId: text(row, 'district'),
      divisionId: text(row, 'division'),
      divisionKnown: text(row, 'division_known').toLowerCase() === 'oui',
      colours: {
        primary: known ? text(row, 'primary').toLowerCase() : guessed.primary,
        secondary: known ? text(row, 'secondary').toLowerCase() : guessed.secondary,
        tertiary: text(row, 'tertiary') === '' ? null : text(row, 'tertiary').toLowerCase(),
      },
      coloursSource: known ? 'known' : 'guess',
      pattern: text(row, 'pattern') === '' ? guessed.pattern : text(row, 'pattern'),
      stadium: {
        name: text(row, 'stadium') || `Stade municipal de ${text(row, 'city')}`,
        surface: surfaceOf(text(row, 'surface') || 'grass', where),
      },
      founded: text(row, 'founded') === '' ? null : Number(text(row, 'founded')),
      verified: text(row, 'verified').toLowerCase() === 'oui',
    });
    if (!parsed.success)
      throw new Error(
        `${where}: ${parsed.error.issues.map((e) => `${e.path.join('.')} ${e.message}`).join('; ')}`,
      );
    return parsed.data;
  });
}

/** Everything that must hold for the world to be consistent; returns the problems found. */
export function checkUniverse(universe: Universe): string[] {
  const problems: string[] = [];
  const unique = (label: string, ids: readonly string[]): void => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`duplicate ${label} id: ${id}`);
      seen.add(id);
    }
  };
  unique(
    'league',
    universe.leagues.map((l) => l.id),
  );
  unique(
    'district',
    universe.districts.map((d) => d.id),
  );
  unique(
    'division',
    universe.divisions.map((d) => d.id),
  );
  unique(
    'club',
    universe.clubs.map((c) => c.id),
  );

  const leagues = new Set(universe.leagues.map((l) => l.id));
  const districts = new Map(universe.districts.map((d) => [d.id, d]));
  const divisions = new Map(universe.divisions.map((d) => [d.id, d]));
  for (const d of universe.districts)
    if (!leagues.has(d.leagueId)) problems.push(`district ${d.id}: unknown league ${d.leagueId}`);
  for (const d of universe.divisions) {
    if (d.leagueId !== null && !leagues.has(d.leagueId))
      problems.push(`division ${d.id}: unknown league ${d.leagueId}`);
    if (d.districtId !== null && !districts.has(d.districtId))
      problems.push(`division ${d.id}: unknown district ${d.districtId}`);
  }
  for (const c of universe.clubs) {
    const district = districts.get(c.districtId);
    const division = divisions.get(c.divisionId);
    if (!district) problems.push(`club ${c.id}: unknown district ${c.districtId}`);
    if (!division) problems.push(`club ${c.id}: unknown division ${c.divisionId}`);
    // A district division belongs to the club's own district.
    if (division && division.districtId !== null && division.districtId !== c.districtId)
      problems.push(`club ${c.id}: plays in ${division.id} but belongs to ${c.districtId}`);
    if (district && !district.departments.includes(c.insee.slice(0, 2)))
      problems.push(`club ${c.id}: INSEE ${c.insee} is outside ${district.name}`);
  }
  return problems;
}

/** The reference tables with the given clubs, validated. Throws on the first inconsistency. */
export function buildUniverse(clubs: readonly Club[]): Universe {
  const universe: Universe = {
    leagues: LEAGUES.map((l) => leagueSchema.parse(l)),
    districts: DISTRICTS.map((d) => districtSchema.parse(d)),
    divisions: DIVISIONS.map((d) => divisionSchema.parse(d)),
    clubs,
  };
  const problems = checkUniverse(universe);
  if (problems.length > 0)
    throw new Error(`The world is inconsistent:\n- ${problems.join('\n- ')}`);
  return universe;
}
