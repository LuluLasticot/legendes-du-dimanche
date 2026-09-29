import { describe, expect, it } from 'vitest';
import {
  buildUniverse,
  checkUniverse,
  clubsOf,
  DISTRICTS,
  DIVISIONS,
  divisionLabel,
  getClub,
  getDistrict,
  getDivision,
  guessColours,
  parseClubs,
  parseCsv,
  parseCsvRecords,
  universeSql,
  WORLD,
} from '../src/index.ts';

// Fictional clubs only: fixtures never carry the name of a real club.
const HEADER =
  'id,name,short_name,city,insee,district,division,division_known,primary,secondary,tertiary,pattern,stadium,surface,founded,verified,source';
const CSV = [
  HEADER,
  'us-exemplaire-59999,US Exemplaire,Exemplaire,Exemplaire-sur-Escaut,59999,escaut,escaut-d3,oui,#0b3d91,#ffffff,,hoops,Stade des Tests,grass,1931,oui,fixture',
  'fc-fictif-59998,"FC Fictif ""1er""",,Fictif,59998,escaut,hdf-r2,non,,,,,,,,,fixture',
].join('\n');

describe('CSV reader', () => {
  it('handles quotes, doubled quotes, CRLF, BOM and comments', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\nlast,');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['last', ''],
    ]);
    expect(parseCsvRecords('# comment\nk,v\n1,2')).toEqual([{ k: '1', v: '2' }]);
  });

  it('refuses a line with more fields than columns', () => {
    expect(() => parseCsvRecords('a,b\n1,2,3')).toThrow(/3 fields for 2 columns/);
  });
});

describe('club list', () => {
  const clubs = parseClubs(CSV);

  it('validates lines and fills what is missing, marking guesses', () => {
    const [known, guessed] = clubs;
    expect(known?.coloursSource).toBe('known');
    expect(known?.divisionKnown).toBe(true);
    expect(known?.stadium).toEqual({ name: 'Stade des Tests', surface: 'grass' });
    expect(guessed?.coloursSource).toBe('guess');
    expect(guessed?.shortName).toBe('FC Fictif "1er"');
    expect(guessed?.stadium.name).toBe('Stade municipal de Fictif');
    expect(guessed?.verified).toBe(false);
    expect(guessed?.divisionKnown).toBe(false);
  });

  it('guesses the same colours for the same club, everywhere', () => {
    expect(guessColours('fc-fictif-59998')).toEqual(guessColours('fc-fictif-59998'));
    const distinct = new Set(
      Array.from(
        { length: 40 },
        (_, i) => guessColours(`club-${i}`).primary + guessColours(`club-${i}`).pattern,
      ),
    );
    expect(distinct.size).toBeGreaterThan(8);
  });

  it('says which line is wrong', () => {
    expect(() => parseClubs(`${HEADER}\nx,X,,Ville,12,escaut,escaut-d3,non,,,,,,,,,`)).toThrow(
      /insee/,
    );
    expect(() =>
      parseClubs(`${HEADER}\nBAD ID,X,,Ville,59000,escaut,escaut-d3,non,,,,,,,,,`),
    ).toThrow(/BAD ID/);
    expect(() =>
      parseClubs(`${HEADER}\nx-59000,X,,Ville,59000,escaut,escaut-d3,non,,,,,,moon,,,`),
    ).toThrow(/unknown surface/);
  });

  it('builds a consistent world, and rejects an inconsistent one', () => {
    expect(buildUniverse(clubs).clubs).toHaveLength(2);
    const stray = parseClubs(`${HEADER}\nx-62000,X,,Arras,62000,escaut,escaut-d3,non,,,,,,,,,`);
    expect(() => buildUniverse(stray)).toThrow(/outside/);
    const unknown = parseClubs(`${HEADER}\nx-59000,X,,Ville,59000,escaut,escaut-d9,non,,,,,,,,,`);
    expect(() => buildUniverse(unknown)).toThrow(/unknown division/);
    const wrongDistrict = parseClubs(
      `${HEADER}\nx-59000,X,,Ville,59000,flandres,escaut-d3,non,,,,,,,,,`,
    );
    expect(() => buildUniverse(wrongDistrict)).toThrow(/belongs to flandres/);
    const twice = [...clubs, ...clubs];
    expect(checkUniverse({ ...buildUniverse(clubs), clubs: twice })).toContain(
      'duplicate club id: us-exemplaire-59999',
    );
  });

  it('writes an idempotent seed with quotes escaped', () => {
    const sql = universeSql(buildUniverse(clubs));
    expect(sql).toContain('insert into public.clubs');
    expect(sql).toContain('\'FC Fictif "1er"\'');
    expect(sql).toContain("'District de l''Escaut'");
    expect(sql.match(/on conflict/g)).toHaveLength(5);
    expect(universeSql(buildUniverse(clubs))).toBe(sql);
  });
});

describe('reference tables', () => {
  it('describe the pilot: seven districts, Escaut down to D6, R1 to R3, N2 and N3', () => {
    expect(DISTRICTS).toHaveLength(7);
    expect(DIVISIONS.filter((d) => d.districtId === 'escaut').map(divisionLabel)).toEqual([
      'D1',
      'D2',
      'D3',
      'D4',
      'D5',
      'D6',
    ]);
    expect(DIVISIONS.filter((d) => d.scope === 'league').map(divisionLabel)).toEqual([
      'R1',
      'R2',
      'R3',
    ]);
    // Since 2026-27: National 1 (three groups) and National 2 (eight). Ligue 3 is out of the game.
    expect(DIVISIONS.filter((d) => d.level === 'national').map((d) => d.id)).toEqual([
      'n1-a',
      'n1-b',
      'n1-c',
      ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((g) => `n2-${g}`),
    ]);
    // Ligue 3 is professional and out of the game: nothing above N1.
    expect(DIVISIONS.every((d) => d.level !== 'national' || d.rank <= 2)).toBe(true);
  });

  it('are consistent by themselves', () => {
    expect(
      checkUniverse({
        leagues: WORLD.leagues,
        districts: DISTRICTS,
        divisions: DIVISIONS,
        clubs: [],
      }),
    ).toEqual([]);
  });
});

describe('the pilot list', () => {
  it('is consistent, whatever it holds so far', () => {
    expect(checkUniverse(WORLD)).toEqual([]);
    for (const club of WORLD.clubs) {
      expect(getClub(club.id)).toBe(club);
      expect(getDistrict(club.districtId)).toBeDefined();
      expect(getDivision(club.divisionId)).toBeDefined();
    }
    expect(clubsOf({ districtId: 'escaut' }).length).toBe(
      WORLD.clubs.filter((c) => c.districtId === 'escaut').length,
    );
  });

  it('holds the top of the pyramid known from a public source, and the Escaut district', () => {
    const national = WORLD.clubs.filter((c) => getDivision(c.divisionId)?.level === 'national');
    expect(national.length).toBeGreaterThanOrEqual(9);
    // A national club's division is never a draw.
    expect(national.every((c) => c.divisionKnown)).toBe(true);
    expect(clubsOf({ districtId: 'escaut' }).length).toBeGreaterThanOrEqual(150);
    // District divisions are provisional until a person has checked them.
    const district = WORLD.clubs.filter((c) => getDivision(c.divisionId)?.level === 'district');
    expect(district.every((c) => c.divisionKnown || !c.verified)).toBe(true);
  });

  it.todo('every club of the pilot has been verified by a person');
});
