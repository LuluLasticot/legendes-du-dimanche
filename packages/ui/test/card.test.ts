import { describe, expect, it } from 'vitest';
import {
  APPEARANCE,
  cardOf,
  crestOf,
  generateSquad,
  kitsOf,
  toSvgString,
  WORLD,
  type Appearance,
  type Card,
  type Club,
} from '@legendes/data';
import {
  avatarContent,
  CARD_LOOKS,
  cardNode,
  DEFAULT_CARD_TUNING,
  lookOf,
  silhouette,
  type CardFace,
  type CardLook,
} from '../src/card/index.ts';

const LABELS = ['VIT', 'TIR', 'PAS', 'DRI', 'DÉF', 'PHY'];

function faceOf(card: Card, club: Club): CardFace {
  const p = card.player;
  const a = p.attributes;
  return {
    uid: card.id,
    look: lookOf(card.tier, card.rarity, card.variant),
    rating: p.rating,
    position: p.positions[0] ?? 'CM',
    name: p.displayName,
    division: 'N1',
    crest: crestOf(club),
    clubColours: club.colours,
    stats: [a.pace, a.shooting, a.passing, a.dribbling, a.defending, a.physical].map(
      (value, i) => ({
        label: LABELS[i] ?? '',
        value,
      }),
    ),
    weakFoot: p.weakFoot,
    skillMoves: p.skillMoves,
    labels: { weakFoot: 'PF', skillMoves: 'GT' },
    trait: p.traits[0] ?? null,
    promo: card.variant === 'base' ? null : card.variant.toUpperCase(),
    appearance: p.appearance,
    kit: kitsOf(club).home,
  };
}

/** One real card of the pilot per template, as /lab/cards shows them. */
function sampleCards(): Map<CardLook, CardFace> {
  const out = new Map<CardLook, CardFace>();
  for (const club of WORLD.clubs) {
    for (const player of generateSquad(club).players) {
      const base = cardOf(player);
      const look = lookOf(base.tier, base.rarity, 'base');
      if (!out.has(look)) out.set(look, faceOf(base, club));
      if (!out.has('weekend')) out.set('weekend', faceOf(cardOf(player, 'weekend'), club));
      if (!out.has('former-pro') && player.traits.includes('former-pro'))
        out.set('former-pro', faceOf(cardOf(player, 'former-pro'), club));
    }
    if (out.size === CARD_LOOKS.length) break;
  }
  return out;
}

/** FNV-1a: a short fingerprint of a drawing for the snapshot file. */
function digest(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return `${h.toString(16)} (${text.length} chars)`;
}

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

const samples = sampleCards();

describe('card templates', () => {
  it('cover every look with a real card of the pilot', () => {
    expect([...samples.keys()].sort()).toEqual([...CARD_LOOKS].sort());
  });

  it.each([...CARD_LOOKS])('%s: well formed, complete, identifiers scoped to the card', (look) => {
    const face = samples.get(look) as CardFace;
    const svg = toSvgString(cardNode(face));
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 250 350"/);
    expect(svg).not.toMatch(/NaN|undefined|null|Infinity/);
    expect(wellFormed(svg)).toBe(true);
    expect(svg).toContain(`>${face.rating}<`);
    expect(svg).toContain(`>${face.name}<`);
    for (const [, ident] of svg.matchAll(/ id="([^"]+)"/g))
      expect(ident?.startsWith(face.uid)).toBe(true);
    for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g))
      expect(svg, `dangling reference ${ref}`).toContain(`id="${ref}"`);
  });

  it.each([...CARD_LOOKS])('%s: the drawing does not change by accident', (look) => {
    // A change here changes every card and every share image: look at /lab/cards, then update the
    // snapshot on purpose (`vitest -u`).
    expect(digest(toSvgString(cardNode(samples.get(look) as CardFace)))).toMatchSnapshot();
  });

  it('turns the grain filter off at 0', () => {
    const face = samples.get('gold-rare') as CardFace;
    const svg = toSvgString(cardNode(face, { ...DEFAULT_CARD_TUNING, grain: 0 }));
    expect(svg).not.toContain('feTurbulence');
  });
});

describe('avatars', () => {
  it('draw every combination of hair, beard, build and skin', () => {
    const kit = kitsOf(WORLD.clubs[0] as Club).home;
    for (const hair of APPEARANCE.hair)
      for (const beard of APPEARANCE.beard)
        for (const build of APPEARANCE.build)
          for (const skin of APPEARANCE.skin) {
            const look: Appearance = { hair, beard, build, skin, hairColour: 'brown' };
            const svg = avatarContent(look, kit, 'a').map(toSvgString).join('');
            expect(svg).not.toMatch(/NaN|undefined/);
          }
  });
});

describe('silhouette', () => {
  it('shrinks with the inset and stays closed', () => {
    expect(silhouette(0)).toMatch(/^M0 24 .* Z$/);
    expect(silhouette(8)).toMatch(/^M8 /);
  });
});
