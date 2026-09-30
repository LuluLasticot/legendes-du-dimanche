import { describe, expect, it } from 'vitest';
import { kitColours, parseKitColours } from '../src/colours.ts';
import {
  foldCommune,
  shortNameOf,
  slug,
  tidyGroundName,
  tidyName,
  withPlace,
} from '../src/naming.ts';

describe('club names', () => {
  it('turns registry capitals into names', () => {
    expect(tidyName('U.S. LIEU ST AMAND')).toBe('US Lieu Saint Amand');
    expect(tidyName('ENT. FEIGNIES AULNOYE FOOTBALL CLUB')).toBe(
      'Entente Feignies Aulnoye Football Club',
    );
    expect(tidyName('A. S. LYRECO')).toBe('AS Lyreco');
    expect(tidyName("J.S. D'HAVELUY")).toBe("JS d'Haveluy");
    expect(tidyName('ENT.S. HELESMOISE')).toBe('Entente Sportive Helesmoise');
    expect(tidyName('ET.S. SEBOURG ESTREUX')).toBe('Etoile Sportive Sebourg Estreux');
    expect(tidyName('O. WIGNEHIES')).toBe('Olympique Wignehies');
    expect(tidyName('ECLAIR S. CRESPIN')).toBe('Eclair Sportif Crespin');
    expect(tidyName('AM.F.C. COLLERET')).toBe('Amicale FC Colleret');
    expect(tidyName('VALENCIENNES F.C.')).toBe('Valenciennes FC');
  });

  it('shortens the usual prefixes and falls back on the commune', () => {
    expect(shortNameOf('Union Sportive de Quievy', 'Quiévy')).toBe('US Quievy');
    expect(shortNameOf('Football Club de Jenlain', 'Jenlain')).toBe('FC Jenlain');
    expect(shortNameOf('Association Sportive Vendegies Escarmain Sportive', 'Vendegies')).toBe(
      'Vendegies',
    );
  });

  it('adds the commune when a name says nothing about the club', () => {
    expect(withPlace('Union Sportive', 'Cambrai')).toBe('Union Sportive Cambrai');
    expect(withPlace('US Bavay', 'Bavay')).toBe('US Bavay');
  });

  it('makes stable identifiers and folds communes', () => {
    expect(slug('Étoile Sportive d’Ébly')).toBe('etoile-sportive-d-ebly');
    expect(foldCommune('ST AMAND')).toBe('saint amand');
    expect(foldCommune('Saint-Amand-les-Eaux')).toBe('saint amand les eaux');
    expect(foldCommune('ESCAUDOEUVRES')).toBe(foldCommune('Escaudœuvres'));
    expect(tidyGroundName("STADE DE L' ATTOQUE 1")).toBe("Stade de l'Attoque");
  });
});

describe('kit colours', () => {
  it('reads what registries write', () => {
    expect(parseKitColours('VERT BLEU')).toEqual(['#1b8a3a', '#1f5fbf']);
    expect(parseKitColours('JAUNE ET NOIR')).toEqual(['#f6c400', '#111111']);
    expect(parseKitColours('NOIR/OR')).toEqual(['#111111', '#d4a017']);
    expect(parseKitColours('BLEU MARINE')).toEqual(['#0b2a6f']);
    expect(parseKitColours('JAUNE -NOIR')).toEqual(['#f6c400', '#111111']);
    expect(parseKitColours(null)).toEqual([]);
    expect(parseKitColours('multicolore')).toEqual([]);
  });

  it('gives a lone colour a partner that shows on it', () => {
    expect(kitColours('BLEU')).toMatchObject({ primary: '#1f5fbf', secondary: '#ffffff' });
    expect(kitColours('NOIR')).toMatchObject({ secondary: '#ffffff' });
    expect(kitColours('BLANC')).toMatchObject({ secondary: '#111111' });
    expect(kitColours('???')).toBeNull();
  });
});
