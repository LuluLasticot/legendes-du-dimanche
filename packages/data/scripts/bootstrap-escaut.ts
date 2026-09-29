// One-off bootstrap of the club list for the pilot. It writes sources/clubs-hdf.csv from open
// data only — never the FFF's protected sites or API:
//
//   1. Clubs of the National 1 / National 2 season 2026-27 located in the Hauts-de-France:
//      names, communes and groups read from Wikipédia (CC BY-SA), listed below by hand after
//      parsing the season pages; INSEE codes from geo.api.gouv.fr.
//   2. Clubs of the district de l'Escaut: sports-club associations (activity 93.12Z) of the
//      communes of its territory, from the Annuaire des entreprises API (Licence Ouverte),
//      kept when their name looks like a football club.
//   3. Grounds and surfaces: Recensement des équipements sportifs, "Terrain de football"
//      (Licence Ouverte), by commune.
//
// What no open source gives is the DIVISION of a district club: those are drawn (seeded, so the
// same on every run) and marked `division_known = non`, for a person to correct. Every line stays
// `verified = non` until a person has checked it.
//
// Running it again overwrites sources/clubs-hdf.csv (hand edits included): it is a starting
// point, not a build step. Network responses are cached in .cache/ (not versioned).
//
//   node scripts/bootstrap-escaut.ts

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Rng } from '@legendes/engine/rng';

const UA =
  'LegendesDuDimanche/0.1 (personal game project; https://github.com/LuluLasticot/legendes-du-dimanche)';
const CACHE = new URL('../.cache/', import.meta.url);
mkdirSync(CACHE, { recursive: true });

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA } });
      if (response.ok) return await response.json();
      if (attempt >= 4) throw new Error(`HTTP ${response.status} for ${url}`);
    } catch (error) {
      if (attempt >= 4) throw error;
    }
    await sleep(1500 * (attempt + 1));
  }
}

async function cached<T>(name: string, produce: () => Promise<T>): Promise<T> {
  const file = new URL(name, CACHE);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as T;
  const value = await produce();
  writeFileSync(file, JSON.stringify(value));
  return value;
}

// ─── Communes of the territory ────────────────────────────────────────────────────────────────

interface Communes {
  arrondissements: Record<string, Record<string, string>>;
}
const territory = JSON.parse(
  readFileSync(new URL('../sources/escaut-communes.json', import.meta.url), 'utf8'),
) as Communes;
const communes = new Map<string, string>(
  Object.values(territory.arrondissements).flatMap((a) => Object.entries(a)),
);

// ─── Associations (Annuaire des entreprises) ────────────────────────────────────────────────

interface Association {
  insee: string;
  name: string;
  created: string | null;
}

interface SearchPage {
  total_pages: number;
  results: {
    nom_complet: string;
    date_creation: string | null;
  }[];
}

async function associationsOf(insee: string): Promise<Association[]> {
  const out: Association[] = [];
  for (let page = 1; ; page++) {
    const query = new URLSearchParams({
      code_commune: insee,
      est_association: 'true',
      etat_administratif: 'A',
      activite_principale: '93.12Z',
      per_page: '25',
      page: String(page),
    });
    const data = (await getJson(
      `https://recherche-entreprises.api.gouv.fr/search?${query.toString()}`,
    )) as SearchPage;
    for (const r of data.results)
      out.push({ insee, name: r.nom_complet, created: r.date_creation });
    if (page >= data.total_pages) return out;
    await sleep(160);
  }
}

const NOT_A_CLUB =
  /ACADEM|ACCADEM|JEUNE|F[ÉE]MIN|COLL[ÈE]GE|LYC[ÉE]E|FAUTEUIL|SALLE|ANCIENS|DISTRICT|COMMISSION|SOUTIEN|SOCCER|V[ÉE]T[ÉE]RAN|LOISIR|SECTION|EDUCATION|MISSION|ECOLE|ÉCOLE|LAIQUE|TENNIS|HAND ?BALL|BASKET|RUGBY|P[ÉE]TANQUE|BOULE|GYM|KARAT|JUDO|CYCL|NATATION|DANSE|YOGA|P[ÊE]CHE|CHASSE|VOLLEY|BADMINTON|GOLF|MOTO|EQUIT|RANDONN|FUTSAL|MARCHE|BOXE|ESCRIME|PING|ATHL[ÉE]TISME|FOOTING|BILLARD|KAYAK|VOILE|ESCALADE|FITNESS|MUSCULATION|ROLLER|SKATE|PALET|QUILLES|BOWLING|GARDIEN|EVENEMENT|ÉV[ÉE]NEMENT|MONDE|PARENTS|SUPPORTER|AMIS DU|FOOT ?A ?5|FOOT ?EN ?SALLE|FREESTYLE|TEAM|AM[ÉE]RICAIN|FLAG|EAGLES|TENIS|SCOLAIRE|UNIVERSIT|MILITAIRE|POMPIER|POLICE|ENTREPRISE|COMIT[ÉE]/i;
const CLUB_START =
  /^(FOOTBALL CLUB|FOOT BALL CLUB|F\.?C\.? |U\.?S\.? |A\.?S\.? |E\.?S\.? |R\.?C\.? |S\.?C\.? |A\.?C\.? |J\.?S\.? |C\.?S\.? |O\.?S\.? |A\.?J\.? |UNION SPORTIVE|ASSOCIATION SPORTIVE|ENTENTE|OLYMPIQUE|RACING|ETOILE|ÉTOILE|SPORTING|ATHLETIC|JEUNESSE SPORTIVE|CLUB SPORTIF|STADE|AMICALE SPORTIVE|UNION FOOTBALL|UNION SPORTIVE)/i;

function looksLikeFootballClub(name: string): boolean {
  if (NOT_A_CLUB.test(name)) return false;
  return /FOOT/i.test(name) || CLUB_START.test(name);
}

// ─── Tidying names ───────────────────────────────────────────────────────────────────────────

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
const ACRONYMS = new Set([
  'fc',
  'us',
  'as',
  'es',
  'rc',
  'sc',
  'ac',
  'js',
  'cs',
  'os',
  'aj',
  'ol',
  'usm',
  'usc',
  'ca',
]);

function tidyName(raw: string): string {
  const cleaned = raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b([A-Z])\.(?=[A-Z]\b|\s|$)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned
    .split(' ')
    .map((word, i) => {
      const w = word.toLowerCase();
      if (ACRONYMS.has(w)) return w.toUpperCase();
      if (i > 0 && SMALL.has(w)) return w;
      // "d'Avesnes", "l'Écluse": lowercase the particle, capitalise what follows.
      const apostrophe = w.match(/^([dl])['’](.+)$/);
      if (apostrophe) return `${apostrophe[1]}'${cap(apostrophe[2] ?? '')}`;
      return w.split('-').map(cap).join('-');
    })
    .join(' ');
}
const cap = (w: string): string => (w.charAt(0).toUpperCase() + w.slice(1)).trim();

/** Words that say what a club is, not which club it is. */
const GENERIC = new Set(
  'football foot ball club union sportive association entente olympique racing etoile sporting athletic jeunesse stade amicale omnisports de du des la le les et d l fc us as es rc sc ac js cs os aj'.split(
    ' ',
  ),
);

/** "US" alone says nothing: the commune is what tells the club apart. */
function withPlace(name: string, city: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words.every((w) => GENERIC.has(w) || /^\d+$/.test(w)) ? `${name} ${city}` : name;
}

const deCity = (city: string): string =>
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

function shortNameOf(name: string, city: string): string {
  let short = name;
  for (const [pattern, replacement] of ABBREVIATIONS) short = short.replace(pattern, replacement);
  short = short.replace(/^(FC|US|AS|ES|RC|SC|AC|JS|CS) (de la |de l'|du |des |de |d')/i, '$1 ');
  return short.length <= 24 ? short : city.length <= 24 ? city : short.slice(0, 24).trim();
}

const slug = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ─── Grounds (Recensement des équipements sportifs) ─────────────────────────────────────────

interface Ground {
  insee: string;
  name: string;
  soil: string | null;
  lit: boolean;
}

async function groundsOf(codes: readonly string[]): Promise<Ground[]> {
  const out: Ground[] = [];
  for (let i = 0; i < codes.length; i += 25) {
    const batch = codes.slice(i, i + 25);
    for (let offset = 0; ; offset += 100) {
      const query = new URLSearchParams({
        select: 'inst_nom,new_code,equip_sol,equip_eclair',
        where: `equip_type_name='Terrain de football' and new_code in (${batch.map((c) => `'${c}'`).join(',')})`,
        limit: '100',
        offset: String(offset),
      });
      const data = (await getJson(
        `https://equipements.sports.gouv.fr/api/explore/v2.1/catalog/datasets/data-es/records?${query.toString()}`,
      )) as {
        results: {
          inst_nom: string | null;
          new_code: string;
          equip_sol: string | null;
          equip_eclair: string | null;
        }[];
      };
      for (const r of data.results)
        out.push({
          insee: r.new_code,
          name: r.inst_nom ?? '',
          soil: r.equip_sol,
          lit: r.equip_eclair === 'true',
        });
      if (data.results.length < 100) break;
      await sleep(200);
    }
  }
  return out;
}

function surfaceOf(soil: string | null): 'grass' | 'artificial' | 'stabilized' {
  if (!soil) return 'grass';
  if (/synth/i.test(soil)) return 'artificial';
  if (/stabilis|cendr/i.test(soil)) return 'stabilized';
  return 'grass';
}

// ─── Clubs known from Wikipédia (National 1 / National 2 2026-27, Hauts-de-France) ──────────

interface NationalClub {
  name: string;
  short: string;
  city: string;
  insee: string;
  district: string;
  division: string;
}
const NATIONAL: readonly NationalClub[] = [
  {
    name: 'Entente Feignies Aulnoye FC',
    short: 'Feignies-Aulnoye',
    city: 'Feignies',
    insee: '59225',
    district: 'escaut',
    division: 'n1-a',
  },
  {
    name: 'FC Chambly Oise',
    short: 'Chambly',
    city: 'Chambly',
    insee: '60139',
    district: 'oise',
    division: 'n1-a',
  },
  {
    name: 'US Chantilly',
    short: 'Chantilly',
    city: 'Chantilly',
    insee: '60141',
    district: 'oise',
    division: 'n1-a',
  },
  {
    name: 'US Le Pays du Valois',
    short: 'Pays du Valois',
    city: 'Le Plessis-Belleville',
    insee: '60500',
    district: 'oise',
    division: 'n1-a',
  },
  {
    name: 'AS Steenvoorde',
    short: 'Steenvoorde',
    city: 'Steenvoorde',
    insee: '59580',
    district: 'flandres',
    division: 'n2-d',
  },
  {
    name: 'IC Croix',
    short: 'IC Croix',
    city: 'Croix',
    insee: '59163',
    district: 'flandres',
    division: 'n2-d',
  },
  {
    name: 'Olympique Saint-Quentin',
    short: 'OSQ',
    city: 'Saint-Quentin',
    insee: '02691',
    district: 'aisne',
    division: 'n2-d',
  },
  {
    name: 'Saint Amand FC',
    short: 'Saint Amand FC',
    city: 'Saint-Amand-les-Eaux',
    insee: '59526',
    district: 'escaut',
    division: 'n2-d',
  },
  {
    name: 'US Vimy',
    short: 'US Vimy',
    city: 'Vimy',
    insee: '62861',
    district: 'artois',
    division: 'n2-d',
  },
];
// The same clubs also appear as associations of the Escaut communes: keep the national line only.
const ALREADY_NATIONAL = /FEIGNIES|AULNOYE|SAINT.?AMAND (F|FOOT)|SAINT.?AMAND FC/i;

// ─── Provisional divisions of the district (seeded draw) ────────────────────────────────────

// Escaut D1 is 2 groups of 12 (Wikipédia); the depth below is drawn in growing sizes.
const DISTRICT_SHARE: readonly [string, number][] = [
  ['escaut-d1', 24],
  ['escaut-d2', 36],
  ['escaut-d3', 48],
  ['escaut-d4', 56],
  ['escaut-d5', 56],
  ['escaut-d6', 1000],
];

function drawDivisions(ids: readonly string[]): Map<string, string> {
  const shuffled = Rng.create('escaut-divisions-2026-27').shuffle([...ids].sort());
  const out = new Map<string, string>();
  let cursor = 0;
  for (const [division, size] of DISTRICT_SHARE) {
    for (const id of shuffled.slice(cursor, cursor + size)) out.set(id, division);
    cursor += size;
  }
  return out;
}

// ─── Main ────────────────────────────────────────────────────────────────────────────────────

const q = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const associations = await cached('associations-9312Z.json', async () => {
  const all: Association[] = [];
  let done = 0;
  for (const insee of communes.keys()) {
    all.push(...(await associationsOf(insee)));
    if (++done % 100 === 0) console.log(`associations: ${done}/${communes.size} communes`);
    await sleep(160);
  }
  return all;
});

const wanted = [...communes.keys(), ...NATIONAL.map((n) => n.insee)];
const grounds = await cached('grounds.json', () => groundsOf([...new Set(wanted)]));

function groundFor(insee: string): { name: string; surface: string } | null {
  const here = grounds.filter((g) => g.insee === insee);
  if (here.length === 0) return null;
  // Prefer a named stadium, then a lit pitch, then whatever comes first.
  const best =
    here.find((g) => /stade/i.test(g.name) && g.lit) ??
    here.find((g) => /stade/i.test(g.name)) ??
    here.find((g) => g.lit) ??
    here[0];
  return best ? { name: best.name, surface: surfaceOf(best.soil) } : null;
}

function groundName(insee: string, city: string): string {
  const ground = groundFor(insee);
  const name = ground ? tidyName(ground.name) : '';
  const generic =
    /^(complexe sportif( municipal)?|terrain de football|stade de football|stade municipal|plateau .*|installations? .*|salle .*)$/i;
  return name.length >= 4 && !generic.test(name) ? name : `Stade municipal ${deCity(city)}`;
}

interface Row {
  id: string;
  name: string;
  short: string;
  city: string;
  insee: string;
  district: string;
  division: string;
  known: boolean;
  founded: string;
  source: string;
}

const rows: Row[] = [];
for (const n of NATIONAL)
  rows.push({
    id: `${slug(n.name)}-${n.insee}`,
    name: n.name,
    short: n.short,
    city: n.city,
    insee: n.insee,
    district: n.district,
    division: n.division,
    known: true,
    founded: '',
    source:
      'Wikipédia, Championnat de France de football de quatrième / cinquième division 2026-2027',
  });

const seen = new Set<string>();
const derived: Row[] = [];
for (const a of associations.filter((x) => looksLikeFootballClub(x.name))) {
  if (ALREADY_NATIONAL.test(a.name)) continue;
  const city = communes.get(a.insee) ?? '';
  const name = withPlace(tidyName(a.name), city);
  const id = `${slug(name)}-${a.insee}`;
  // "Union Sportive Hergnies 2025" next to "Union Sportive Hergnies": one club.
  const key = `${a.insee}:${slug(name.replace(/\b(19|20)\d\d\b/g, ''))}`;
  if (seen.has(id) || seen.has(key)) continue;
  seen.add(id);
  seen.add(key);
  derived.push({
    id,
    name,
    short: shortNameOf(name, city),
    city,
    insee: a.insee,
    district: 'escaut',
    division: '',
    known: false,
    founded: a.created ? a.created.slice(0, 4) : '',
    source: 'Annuaire des entreprises (association, activité 93.12Z) ; division provisoire',
  });
}
const divisions = drawDivisions(derived.map((r) => r.id));
for (const r of derived) rows.push({ ...r, division: divisions.get(r.id) ?? 'escaut-d6' });

const header = readFileSync(new URL('../sources/clubs-hdf.csv', import.meta.url), 'utf8')
  .split('\n')
  .filter((line) => line.startsWith('#') || line.startsWith('id,'))
  .join('\n');

const lines = rows
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((r) => {
    const ground = groundFor(r.insee);
    // 1900 is the registry's placeholder for "date unknown".
    const founded = /^\d{4}$/.test(r.founded) && Number(r.founded) > 1900 ? r.founded : '';
    return [
      r.id,
      r.name,
      r.short,
      r.city,
      r.insee,
      r.district,
      r.division,
      r.known ? 'oui' : 'non',
      '', // primary
      '', // secondary
      '', // tertiary
      '', // pattern
      groundName(r.insee, r.city),
      ground ? ground.surface : 'grass',
      founded,
      'non',
      r.source,
    ]
      .map(q)
      .join(',');
  });

writeFileSync(
  new URL('../sources/clubs-hdf.csv', import.meta.url),
  `${header}\n${lines.join('\n')}\n`,
);
console.log(
  `${rows.length} clubs (${NATIONAL.length} national, ${derived.length} of the Escaut). Divisions of the district: ` +
    Array.from(
      [...divisions.values()].reduce(
        (acc, d) => acc.set(d, (acc.get(d) ?? 0) + 1),
        new Map<string, number>(),
      ),
    )
      .sort()
      .map(([d, n]) => `${d}=${n}`)
      .join(' '),
);
