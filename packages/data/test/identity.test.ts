import { describe, expect, it } from 'vitest';
import { hashString } from '@legendes/engine/hash';
import {
  allSponsorNames,
  CREST_CHARGES,
  CREST_PARTITIONS,
  CREST_SHAPES,
  CREST_STYLES,
  contrast,
  crestOf,
  crestSvg,
  identityOf,
  kitNode,
  kitsOf,
  mentionsExcludedBrand,
  monogramOf,
  sponsorLines,
  shirtNode,
  SPONSOR_EXCLUSIONS,
  sponsorsOf,
  toSvgString,
  el,
  WORLD,
  type Club,
} from '../src/index.ts';

const clubs = WORLD.clubs;
/** Hash of the identity of every club of the pilot (see the test that uses it). */
const IDENTITY_GOLDEN = '709bea5';

/** Elements opened and closed in order, no stray text: what a parser needs to accept the string. */
function wellFormed(svg: string): boolean {
  const stack: string[] = [];
  for (const [, closing, name, selfClosing] of svg.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)) {
    if (selfClosing === '/') continue;
    if (closing === '/') {
      if (stack.pop() !== name) return false;
    } else stack.push(name as string);
  }
  return stack.length === 0;
}

describe('the svg tree', () => {
  it('escapes text and attributes and rounds numbers', () => {
    const node = el('text', { x: 1.23456, title: 'a "b" <c>' }, 'Fish & Chips <b>');
    expect(toSvgString(node)).toBe(
      '<text x="1.23" title="a &quot;b&quot; &lt;c&gt;">Fish &amp; Chips &lt;b&gt;</text>',
    );
  });
});

describe('monograms', () => {
  it.each([
    ['US Lieu Saint Amand', 'USL'],
    ['FC Escaudain', 'FCE'],
    ['Olympique Marcquois', 'OM'],
    ['Racing Club de Douai', 'RCD'],
    ['Valenciennes', 'VA'],
    ['ES Lambres lez Douai', 'ESL'],
  ])('%s → %s', (name, expected) => {
    expect(monogramOf(name)).toBe(expected);
  });
});

describe('crests of the pilot', () => {
  const specs = clubs.map((c) => ({ club: c, spec: crestOf(c) }));

  it('are deterministic', () => {
    for (const { club, spec } of specs.slice(0, 20)) expect(crestOf(club)).toEqual(spec);
  });

  it('are valid, well formed SVG with unique identifiers per club', () => {
    for (const { club, spec } of specs) {
      const svg = crestSvg(spec, club.id);
      expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 100 120"/);
      expect(svg).not.toMatch(/NaN|undefined|null/);
      expect(wellFormed(svg), club.id).toBe(true);
      expect(svg).toContain(`id="${club.id}-clip"`);
      expect(spec.monogram).toMatch(/^[A-Z]{2,3}$/);
      expect(spec.colours.ink).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('are varied: every shape, partition, charge and style is drawn, and few crests look alike', () => {
    const seen = <T>(pick: (s: (typeof specs)[number]['spec']) => T): number =>
      new Set(specs.map(({ spec }) => pick(spec))).size;
    expect(seen((s) => s.shape)).toBe(CREST_SHAPES.length);
    expect(seen((s) => s.partition)).toBe(CREST_PARTITIONS.length);
    expect(seen((s) => s.charge)).toBe(CREST_CHARGES.length);
    expect(seen((s) => s.style)).toBe(CREST_STYLES.length);
    // Two clubs sharing shape, partition, charge, style and colours would be twins on a card.
    const twins = seen((s) => JSON.stringify(s));
    expect(twins).toBeGreaterThanOrEqual(clubs.length - 2);
  });

  it('keep the charge readable: it stands out from the field or from half of it', () => {
    for (const { club, spec } of specs) {
      // On a divided field the ink cannot beat both halves: it must beat one of them, and the
      // dark outline of the charge carries it over the other.
      const bestContrast = Math.max(
        contrast(spec.colours.ink, spec.colours.field),
        spec.partition === 'plain' ? 0 : contrast(spec.colours.ink, spec.colours.alt),
      );
      expect(bestContrast, club.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('echo a striped shirt with a striped field more often than chance', () => {
    const striped = clubs.filter((c) => c.pattern === 'stripes');
    expect(striped.length).toBeGreaterThan(0);
    const echoes = striped.filter((c) => crestOf(c).partition === 'stripes').length;
    expect(echoes / striped.length).toBeGreaterThan(0.2);
  });
});

describe('kits of the pilot', () => {
  it('are deterministic and give three distinct kits', () => {
    for (const club of clubs) {
      const kits = kitsOf(club);
      expect(kitsOf(club)).toEqual(kits);
      expect(kits.home.body).toBe(club.colours.primary);
      expect(kits.home.pattern).toBe(club.pattern);
      // The away shirt must not be mistaken for the home shirt, the keeper for either.
      expect(contrast(kits.away.body, kits.home.body), club.id).toBeGreaterThanOrEqual(1.5);
      expect(contrast(kits.keeper.body, kits.home.body), club.id).toBeGreaterThanOrEqual(1.3);
      expect(contrast(kits.keeper.body, kits.away.body), club.id).toBeGreaterThanOrEqual(1.3);
    }
  });

  it('draw well formed shirts and full kits, with the crest and the sponsor', () => {
    for (const club of clubs.slice(0, 60)) {
      const identity = identityOf(club);
      for (const name of ['home', 'away', 'keeper'] as const) {
        const options = {
          uid: `${club.id}-${name}`,
          crest: identity.crest,
          sponsor: identity.sponsors[0]?.label,
        };
        for (const svg of [
          toSvgString(shirtNode(identity.kits[name], options)),
          toSvgString(kitNode(identity.kits[name], options)),
        ]) {
          expect(svg).not.toMatch(/NaN|undefined|null/);
          expect(wellFormed(svg), `${club.id} ${name}`).toBe(true);
        }
      }
    }
  });
});

describe('sponsor labels', () => {
  it('go on two lines when long', () => {
    expect(sponsorLines('CHEZ MOMO')).toEqual(['CHEZ MOMO']);
    expect(sponsorLines('BOULANGERIE DELATTRE')).toEqual(['BOULANGERIE', 'DELATTRE']);
    expect(sponsorLines('DISTILLERIE DU TERRIL')).toEqual(['DISTILLERIE', 'DU TERRIL']);
    expect(sponsorLines(undefined)).toEqual([]);
  });
});

describe('sponsors', () => {
  it('are deterministic, distinct within a club and short enough for a shirt', () => {
    for (const club of clubs) {
      const sponsors = sponsorsOf(club);
      expect(sponsorsOf(club)).toEqual(sponsors);
      expect(sponsors).toHaveLength(3);
      expect(new Set(sponsors.map((s) => s.name)).size).toBe(3);
      for (const s of sponsors) {
        expect(s.name).not.toMatch(/[{}]/);
        expect(s.label).not.toMatch(/[{}]/);
        expect(s.label.length).toBeLessThanOrEqual(30);
        expect(s.label).toBe(s.label.toUpperCase());
      }
    }
  });

  it('never name a real brand: every template, and every name of the pilot, passes the exclusion list', () => {
    expect(SPONSOR_EXCLUSIONS.length).toBeGreaterThan(50);
    for (const name of allSponsorNames()) expect(mentionsExcludedBrand(name), name).toBe(false);
    for (const club of clubs) {
      for (const s of sponsorsOf(club)) expect(mentionsExcludedBrand(s.name), s.name).toBe(false);
    }
    // The check does catch a brand.
    expect(mentionsExcludedBrand('Garage Renault du Centre')).toBe(true);
    expect(mentionsExcludedBrand('Crédit Agricole Nord')).toBe(true);
  });

  it('vary from club to club', () => {
    const first = new Set(clubs.map((c) => sponsorsOf(c)[0]?.name));
    expect(first.size).toBeGreaterThan(clubs.length / 2);
  });
});

describe('identity of the pilot', () => {
  it('keeps its look: every crest, kit and sponsor hashes to the committed value', () => {
    // A change of the generators changes every club's look (and the image of every shared card).
    // Update this value on purpose, once the change is meant; see D-033.
    const digest = hashString(
      JSON.stringify(clubs.map((c: Club) => [c.id, identityOf(c)])),
    ).toString(16);
    expect(digest).toBe(IDENTITY_GOLDEN);
  });
});
