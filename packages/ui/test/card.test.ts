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
  CARD_FINISHES,
  CARD_LOOKS,
  cardBackMaskNode,
  cardBackNode,
  cardMaskNode,
  cardNode,
  DEFAULT_CARD_TUNING,
  lookOf,
  cardShareNode,
  cardStoryNode,
  clubShareNode,
  playerLook,
  SHARE_SIZE,
  silhouette,
  STORY_SIZE,
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

describe('3D sources', () => {
  it.each([...CARD_LOOKS])('%s: mask, back and back mask are well formed and scoped', (look) => {
    const face = samples.get(look) as CardFace;
    const drawings = [
      toSvgString(cardMaskNode(face)),
      toSvgString(cardBackNode(look, `${face.uid}-back`)),
      toSvgString(cardBackMaskNode(look, `${face.uid}-back`)),
    ];
    for (const svg of drawings) {
      expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 250 350"/);
      expect(svg).not.toMatch(/NaN|undefined|null/);
      expect(wellFormed(svg)).toBe(true);
      for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g))
        expect(svg, `dangling reference ${ref}`).toContain(`id="${ref}"`);
    }
    // The mask paints its own areas in pure channels: red frame, green film, blue protection.
    expect(drawings[0]).toContain('fill="#ff0000"');
    expect(drawings[0]).toContain('fill="#00ff00"');
    expect(drawings[0]).toContain('0 0 0 0 1');
  });

  it('finishes rank the templates from bronze common to the top promo', () => {
    const ranks = CARD_LOOKS.map((look) => CARD_FINISHES[look].rank);
    expect([...ranks].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(CARD_FINISHES['gold-rare'].foil).toBeGreaterThan(CARD_FINISHES['gold-common'].foil);
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

describe('3D character looks', () => {
  it("come from the player's card: skin, hair, number; gloves for the goalkeeper only", () => {
    const club = WORLD.clubs[0] as Club;
    const kits = kitsOf(club);
    const squad = generateSquad(club).players;
    const boots = new Set<string>();
    for (const player of squad) {
      const keeper = player.positions[0] === 'GK';
      const look = playerLook(player, keeper ? kits.keeper : kits.home);
      expect(look).toEqual(playerLook(player, keeper ? kits.keeper : kits.home));
      expect(look.number).toBe(player.number);
      expect(look.skin).toMatch(/^#[0-9a-f]{6}$/);
      expect(look.hair === null).toBe(player.appearance.hair === 'bald');
      expect(look.gloves !== null).toBe(keeper);
      boots.add(look.boots);
    }
    expect(boots.size).toBeGreaterThan(1);
  });
});

describe('share images', () => {
  const club = WORLD.clubs[0] as Club;
  const player = generateSquad(club).players[0]!;
  const face: CardFace = {
    uid: player.id,
    look: 'gold-rare',
    rating: player.rating,
    position: 'MC',
    name: player.displayName,
    division: 'D1',
    crest: crestOf(club),
    clubColours: club.colours,
    stats: [{ label: 'VIT', value: 70 }],
    weakFoot: 3,
    skillMoves: 2,
    labels: { weakFoot: 'PF', skillMoves: 'GT' },
    trait: null,
    promo: null,
    appearance: player.appearance,
    kit: kitsOf(club).home,
  };
  const labels = {
    eyebrow: 'Or rare',
    line: '80 · Milieu central · N° 8',
    club: club.name,
    clubLine: 'D1 · Ville',
    brand: 'Légendes du Dimanche',
    footnote: 'Joueur fictif',
  };

  it('draw the card of the game, its player and the brand, well formed and sized', () => {
    for (const [node, size] of [
      [cardShareNode(face, labels), SHARE_SIZE],
      [cardStoryNode(face, labels), STORY_SIZE],
    ] as const) {
      const svg = toSvgString(node);
      expect(svg).not.toMatch(/NaN|undefined/);
      expect(wellFormed(svg)).toBe(true);
      expect(node.attrs['width']).toBe(size.width);
      expect(node.attrs['height']).toBe(size.height);
      expect(svg).toContain(player.displayName);
      expect(svg).toContain('LÉGENDES DU DIMANCHE');
    }
  });

  it('draw a club with its crest, its name on one or two lines, and its kits', () => {
    const kits = kitsOf(club);
    for (const name of [club.name, 'Union Sportive Assevent-Boussois Football Club']) {
      const svg = toSvgString(
        clubShareNode(
          { id: club.id, crest: crestOf(club), colour: club.colours.primary },
          [kits.home, kits.away, kits.keeper],
          {
            eyebrow: 'D1',
            name,
            line: 'Ville · Stade',
            brand: 'Légendes du Dimanche',
            footnote: 'Jeu non officiel',
          },
        ),
      );
      expect(wellFormed(svg), name).toBe(true);
      expect(svg).not.toMatch(/NaN|undefined/);
    }
  });
});
