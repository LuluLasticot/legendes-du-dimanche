import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import fr from '../messages/fr.json' with { type: 'json' };
import {
  baseRatingRange,
  clubSchema,
  divisionCode,
  divisionRefSchema,
  FORMATION_SLOTS,
  FORMATIONS,
  KIT_PATTERNS,
  playerCardSchema,
  POSITIONS,
  SURFACES,
  tierForRating,
  TRAITS,
  type PlayerCard,
} from '../src/index.ts';

describe('formations', () => {
  it.each(FORMATIONS)('%s has 11 slots, one goalkeeper, anchors inside the pitch', (formation) => {
    const slots = FORMATION_SLOTS[formation];
    expect(slots).toHaveLength(11);
    expect(slots.filter((slot) => slot.position === 'GK')).toHaveLength(1);
    expect(slots[0]?.position).toBe('GK');
    for (const { x, y } of slots) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(1);
    }
  });

  it.each(FORMATIONS)('%s is left/right balanced', (formation) => {
    const meanX = FORMATION_SLOTS[formation].reduce((acc, slot) => acc + slot.x, 0) / 11;
    expect(meanX).toBeCloseTo(0.5, 2);
  });
});

describe('ratings and tiers', () => {
  it('tierForRating follows the GDD bands', () => {
    expect(tierForRating(40)).toBe('bronze');
    expect(tierForRating(64)).toBe('bronze');
    expect(tierForRating(65)).toBe('silver');
    expect(tierForRating(74)).toBe('silver');
    expect(tierForRating(75)).toBe('gold');
  });

  it('division rating bands are ordered and valid', () => {
    const order = [
      { level: 'district', rank: 5 },
      { level: 'district', rank: 1 },
      { level: 'regional', rank: 3 },
      { level: 'regional', rank: 2 },
      { level: 'regional', rank: 1 },
      { level: 'national', rank: 2 },
      { level: 'national', rank: 1 },
    ] as const;
    const ranges = order.map(baseRatingRange);
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i]!;
      expect(r.min).toBeLessThan(r.max);
      if (i > 0) expect(r.min).toBeGreaterThan(ranges[i - 1]!.min);
    }
    expect(divisionCode({ level: 'district', rank: 5 })).toBe('D5');
  });

  it('rejects National 3 (gone in 2026-27) and R5', () => {
    expect(divisionRefSchema.safeParse({ level: 'national', rank: 3 }).success).toBe(false);
    expect(divisionRefSchema.safeParse({ level: 'national', rank: 1 }).success).toBe(true);
    expect(divisionRefSchema.safeParse({ level: 'regional', rank: 5 }).success).toBe(false);
    expect(divisionRefSchema.safeParse({ level: 'district', rank: 7 }).success).toBe(true);
  });
});

const baseCard = {
  id: '4f0a2b1c-3d4e-4f60-8a7b-9c0d1e2f3a4b',
  identityId: '5f0a2b1c-3d4e-4f60-8a7b-9c0d1e2f3a4b',
  clubId: '6f0a2b1c-3d4e-4f60-8a7b-9c0d1e2f3a4b',
  displayName: 'K. Benali',
  rating: 74,
  tier: 'silver',
  rarity: 'rare',
  secondaryPositions: ['LM'],
  preferredFoot: 'left',
  weakFoot: 3,
  skillMoves: 4,
  age: 27,
  heightCm: 178,
  traits: ['workhorse'],
  kind: 'outfield',
  position: 'LW',
  attributes: { pace: 82, shooting: 64, passing: 69, dribbling: 71, defending: 38, physical: 61 },
} satisfies PlayerCard;

describe('playerCardSchema', () => {
  it('accepts a valid outfield card', () => {
    expect(playerCardSchema.parse(baseCard)).toEqual(baseCard);
  });

  it('never accepts a minor', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 17 }), (age) => {
        expect(playerCardSchema.safeParse({ ...baseCard, age }).success).toBe(false);
      }),
    );
  });

  it('requires goalkeeper attributes for goalkeepers', () => {
    expect(
      playerCardSchema.safeParse({ ...baseCard, kind: 'goalkeeper', position: 'GK' }).success,
    ).toBe(false);
    expect(playerCardSchema.safeParse({ ...baseCard, position: 'GK' }).success).toBe(false);
  });

  it('rejects unknown keys and out-of-range attributes', () => {
    expect(playerCardSchema.safeParse({ ...baseCard, extra: 1 }).success).toBe(false);
    expect(
      playerCardSchema.safeParse({ ...baseCard, attributes: { ...baseCard.attributes, pace: 100 } })
        .success,
    ).toBe(false);
  });
});

describe('clubSchema', () => {
  it('validates colours and kit pattern', () => {
    const club = {
      id: '7f0a2b1c-3d4e-4f60-8a7b-9c0d1e2f3a4b',
      name: 'US Exemple',
      city: 'Exempleville',
      districtId: '8f0a2b1c-3d4e-4f60-8a7b-9c0d1e2f3a4b',
      division: { level: 'district', rank: 5 },
      colors: ['#0b3d2e', '#f4f1e8'],
      kitPattern: 'stripes',
      stadium: { name: 'Stade municipal', surface: 'muddy' },
    };
    expect(clubSchema.safeParse(club).success).toBe(true);
    expect(clubSchema.safeParse({ ...club, colors: ['red', 'blue'] }).success).toBe(false);
  });
});

describe('French messages', () => {
  it('cover every identifier', () => {
    for (const p of POSITIONS) expect(fr.positions[p].short).toBeTruthy();
    for (const f of FORMATIONS) expect(fr.formations[f]).toBeTruthy();
    for (const t of TRAITS) expect(fr.traits[t].name).toBeTruthy();
    for (const s of SURFACES) expect(fr.surfaces[s]).toBeTruthy();
    for (const k of KIT_PATTERNS) expect(fr.kitPatterns[k]).toBeTruthy();
  });

  it('never mention forbidden trademarks', () => {
    const text = JSON.stringify(fr);
    for (const mark of ['FIFA', 'FUT', 'Ultimate Team', 'EA SPORTS'])
      expect(text).not.toContain(mark);
  });
});
