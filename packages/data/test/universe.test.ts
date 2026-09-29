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
  'id,name,short_name,city,insee,district,division,primary,secondary,tertiary,pattern,stadium,surface,founded,verified,source';
const CSV = [
  HEADER,
  'us-exemplaire-59999,US Exemplaire,Exemplaire,Exemplaire-sur-Escaut,59999,escaut,escaut-d3,#0b3d91,#ffffff,,hoops,Stade des Tests,grass,1931,oui,fixture',
  'fc-fictif-59998,"FC Fictif ""1er""",,Fictif,59998,escaut,hdf-r2,,,,,,,,,fixture',
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
    expect(known?.stadium).toEqual({ name: 'Stade des Tests', surface: 'grass' });
    expect(guessed?.coloursSource).toBe('guess');
    expect(guessed?.shortName).toBe('FC Fictif "1er"');
    expect(guessed?.stadium.name).toBe('Stade municipal de Fictif');
    expect(guessed?.verified).toBe(false);
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
    expect(() => parseClubs(`${HEADER}\nx,X,,Ville,12,escaut,escaut-d3,,,,,,,,,`)).toThrow(/insee/);
    expect(() => parseClubs(`${HEADER}\nBAD ID,X,,Ville,59000,escaut,escaut-d3,,,,,,,,,`)).toThrow(
      /BAD ID/,
    );
    expect(() =>
      parseClubs(`${HEADER}\nx-59000,X,,Ville,59000,escaut,escaut-d3,,,,,,moon,,,`),
    ).toThrow(/unknown surface/);
  });

  it('builds a consistent world, and rejects an inconsistent one', () => {
    expect(buildUniverse(clubs).clubs).toHaveLength(2);
    const stray = parseClubs(`${HEADER}\nx-62000,X,,Arras,62000,escaut,escaut-d3,,,,,,,,,`);
    expect(() => buildUniverse(stray)).toThrow(/outside/);
    const unknown = parseClubs(`${HEADER}\nx-59000,X,,Ville,59000,escaut,escaut-d9,,,,,,,,,`);
    expect(() => buildUniverse(unknown)).toThrow(/unknown division/);
    const wrongDistrict = parseClubs(
      `${HEADER}\nx-59000,X,,Ville,59000,flandres,escaut-d3,,,,,,,,,`,
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
    expect(DIVISIONS.filter((d) => d.level === 'national').map((d) => d.id)).toEqual([
      'n2-a',
      'n2-b',
      'n2-c',
      'n2-d',
      'n3-hdf',
    ]);
    // Ligue 3 is professional and out of the game: nothing above N2.
    expect(DIVISIONS.every((d) => d.level !== 'national' || d.rank >= 2)).toBe(true);
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

  it.todo('has 150 to 250 clubs: the whole Escaut district and the divisions above it');
  it.todo('every club of the pilot has been verified by a person');
});
