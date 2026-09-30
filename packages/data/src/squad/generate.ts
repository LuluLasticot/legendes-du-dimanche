// The squad of a club (GDD §5.4): 22 to 25 fictional adult players, drawn from a seed (club id +
// season) so the same club gets the same squad on every machine and in every process.
//
// Pure and deterministic: only the engine's seeded generator and plain arithmetic.

import { Rng } from '@legendes/engine/rng';
import { playerRating, type MatchPlayer } from '@legendes/engine/sim';
import { POSITION_LINE, type Position } from '@legendes/engine/sim/positions';
import {
  baseRatingRange,
  PLAYER_MAX_AGE,
  PLAYER_MIN_AGE,
  tierForRating,
  type Trait,
} from '@legendes/shared';
import { DIVISIONS, divisionRef } from '../reference.ts';
import { SEASON, type Club } from '../schema.ts';
import {
  ARCHETYPE_DEFS,
  ARCHETYPES_BY_POSITION,
  NEIGHBOURS,
  PREFERRED_NUMBERS,
  SQUAD_ORDER,
  type Archetype,
} from './archetypes.ts';
import { COMMON_SURNAMES, DIVERSE_SURNAMES, FIRST_NAMES, type BirthDecade } from './names.ts';
import type { Appearance, Player, Squad } from './player.ts';

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/**
 * An index that favours the front of a list of `length` items (frequent names first) without
 * making the back of the list rare: half uniform, half quadratic.
 */
function skewed(rng: Rng, length: number): number {
  const u = rng.float();
  return Math.min(length - 1, Math.floor((length * u * (1 + u)) / 2));
}

const decadeOf = (birthYear: number): BirthDecade =>
  birthYear >= 2000 ? 2000 : birthYear >= 1990 ? 1990 : 1980;

// ─── Rating and attributes ────────────────────────────────────────────────────────────────────

/** The engine's overall rating of a bundle of attributes at a position. */
function ratingOf(
  position: Position,
  attributes: Player['attributes'],
  keeper: Player['keeper'],
): number {
  const stub: MatchPlayer = {
    id: 'stub',
    name: 'stub',
    number: 1,
    positions: [position],
    foot: 'right',
    weakFoot: 3,
    attributes,
    keeper: {
      diving: keeper.diving,
      handling: keeper.handling,
      reflexes: keeper.reflexes,
      speed: keeper.speed,
      positioning: keeper.positioning,
      heightCm: 185,
    },
    stamina: 50,
    composure: 50,
    club: '',
    district: '',
    league: '',
    division: '',
  };
  return playerRating(stub, position);
}

const ATTRIBUTE_KEYS = [
  'pace',
  'shooting',
  'passing',
  'dribbling',
  'defending',
  'physical',
] as const;
const KEEPER_KEYS = ['diving', 'handling', 'kicking', 'reflexes', 'speed', 'positioning'] as const;

/** Age effects on the six attributes and on endurance (pace fades, reading the game grows). */
function ageEffects(age: number): { attributes: number[]; stamina: number } {
  const old = Math.max(0, age - 29);
  const veteran = Math.max(0, age - 31);
  const young = Math.max(0, 21 - age);
  const wise = clamp((age - 28) * 0.6, 0, 6);
  return {
    attributes: [-old * 1.6, 0, wise, 0, wise, -veteran * 1.1 - young * 1.5],
    stamina: -Math.max(0, age - 32) * 1.5,
  };
}

interface Body {
  attributes: Player['attributes'];
  keeper: Player['keeper'];
}

/** Attributes whose overall rating at `position` is exactly `target`, shaped by the archetype. */
function buildBody(
  rng: Rng,
  position: Position,
  archetype: Archetype,
  age: number,
  target: number,
): Body {
  const def = ARCHETYPE_DEFS[archetype];
  const keeperPlayer = POSITION_LINE[position] === 'goalkeeper';
  const age$ = ageEffects(age);
  const base = ATTRIBUTE_KEYS.map((_, k) =>
    keeperPlayer
      ? target - 30 + rng.normal(0, 4)
      : target + (def.offsets[k] ?? 0) + rng.normal(0, 3) + (age$.attributes[k] ?? 0),
  );
  const keeperBase = KEEPER_KEYS.map((_, k) =>
    keeperPlayer
      ? target + (def.keeper?.[k] ?? 0) + rng.normal(0, 3)
      : target - 38 + rng.normal(0, 4),
  );
  const make = (shift: number): Body => {
    const at = (v: number, apply: boolean): number =>
      Math.round(clamp(v + (apply ? shift : 0), 12, 97));
    const a = base.map((v) => at(v, !keeperPlayer));
    const g = keeperBase.map((v) => at(v, keeperPlayer));
    return {
      attributes: {
        pace: a[0] ?? 50,
        shooting: a[1] ?? 50,
        passing: a[2] ?? 50,
        dribbling: a[3] ?? 50,
        defending: a[4] ?? 50,
        physical: a[5] ?? 50,
      },
      keeper: {
        diving: g[0] ?? 50,
        handling: g[1] ?? 50,
        kicking: g[2] ?? 50,
        reflexes: g[3] ?? 50,
        speed: g[4] ?? 50,
        positioning: g[5] ?? 50,
      },
    };
  };
  // Shift the relevant attributes until the engine's rating is the target (rounding, clamping).
  let shift = 0;
  let body = make(0);
  for (let i = 0; i < 12; i++) {
    const r = ratingOf(position, body.attributes, body.keeper);
    if (r === target) break;
    shift += target - r;
    body = make(shift);
  }
  return body;
}

// ─── Identity and looks ───────────────────────────────────────────────────────────────────────

function pickWeighted<T>(rng: Rng, items: readonly (readonly [T, number])[]): T {
  const i = rng.weightedIndex(items.map(([, w]) => w));
  return (items[i] as readonly [T, number])[0];
}

function appearanceOf(rng: Rng, age: number): Appearance {
  const skin = pickWeighted(rng, [
    [1, 0.34],
    [2, 0.24],
    [3, 0.14],
    [4, 0.1],
    [5, 0.1],
    [6, 0.08],
  ] as const);
  const dark = skin >= 5;
  const hair = pickWeighted(rng, [
    ['short', dark ? 0.15 : 0.45],
    ['buzz', 0.2],
    ['curly', dark ? 0.15 : 0.15],
    ['long', dark ? 0.03 : 0.06],
    ['tied', dark ? 0.05 : 0.06],
    ['afro', dark ? 0.35 : skin >= 4 ? 0.08 : 0],
    ['bald', age >= 30 ? 0.1 : 0.03],
  ] as const);
  const hairColour = pickWeighted(rng, [
    ['black', dark ? 0.95 : 0.3],
    ['brown', dark ? 0.05 : 0.42],
    ['blond', dark ? 0 : 0.18],
    ['ginger', dark ? 0 : 0.05],
    ['grey', age >= 34 ? 0.2 : 0.01],
  ] as const);
  return {
    skin,
    hair,
    hairColour,
    beard: pickWeighted(rng, [
      ['none', 0.5 - (age >= 30 ? 0.1 : 0)],
      ['stubble', 0.3],
      ['full', 0.2 + (age >= 30 ? 0.1 : 0)],
    ] as const),
    build: pickWeighted(rng, [
      ['lean', 0.35],
      ['average', 0.45],
      ['stocky', 0.2],
    ] as const),
  };
}

const LEFT_FOOTED: ReadonlySet<Position> = new Set(['LB', 'LWB', 'LM', 'LW']);

// ─── Traits (GDD §5.5) ────────────────────────────────────────────────────────────────────────

interface Draft extends Omit<Player, 'id' | 'number' | 'traits' | 'displayName'> {
  traits: Trait[];
}

/** Traits a player may get, most structural first, with their probability. */
function traitCandidates(
  p: Draft,
  divisionLevel: 'national' | 'regional' | 'district',
): [Trait, number][] {
  const line = POSITION_LINE[p.positions[0] ?? 'CM'];
  const outfield = line !== 'goalkeeper';
  const list: [Trait, number][] = [
    ['one-footed', p.weakFoot === 1 ? 0.5 : 0],
    ['veteran', p.age >= 33 ? 0.75 : 0],
    ['defensive-leader', p.archetype === 'leader' ? 0.4 : 0],
    ['poacher', p.archetype === 'poacher' ? 0.5 : p.archetype === 'false-nine' ? 0.1 : 0],
    [
      'aerial-threat',
      p.archetype === 'target-man'
        ? 0.45
        : p.archetype === 'leader' || (line === 'defence' && p.heightCm >= 188)
          ? 0.2
          : 0,
    ],
    ['workhorse', outfield && line !== 'defence' && p.stamina >= p.rating + 6 ? 0.22 : 0],
    ['thunderbolt', outfield && p.attributes.shooting >= 68 ? 0.1 : 0],
    [
      'magician',
      outfield && line !== 'defence' && p.attributes.dribbling >= p.rating + 8 ? 0.12 : 0,
    ],
    ['former-pro', p.age >= 26 ? (divisionLevel === 'district' ? 0.015 : 0.05) : 0],
    ['diesel', 0.06],
    ['third-half', p.age >= 24 ? 0.07 : 0],
    ['hothead', line === 'defence' || p.archetype === 'pitbull' ? 0.1 : 0.05],
    ['trash-talker', 0.05],
    ['late-arrival', 0.05],
    ['fair-weather', 0.05],
  ];
  return list.filter(([, prob]) => prob > 0);
}

// ─── The squad ────────────────────────────────────────────────────────────────────────────────

const divisionOf = (club: Club) => DIVISIONS.find((d) => d.id === club.divisionId);

/**
 * The squad of `club` for `season`. Same club, same season: same players, bit for bit. The ratings
 * follow the division's band (GDD §5.2); the club's own strength moves the whole squad a little,
 * so two clubs of a division are not equal.
 */
export function generateSquad(club: Club, season: string = SEASON): Squad {
  const division = divisionOf(club);
  if (!division) throw new RangeError(`Unknown division ${club.divisionId} for ${club.id}`);
  const range = baseRatingRange(divisionRef(division));
  const root = Rng.create(`squad:${club.id}:${season}`);
  const mid = (range.min + range.max) / 2;
  const spread = (range.max - range.min) / 5;
  const strength = root.fork('club').normal(0, 1.8);
  const size = 22 + root.fork('size').int(0, 3);

  const usedNames = new Set<string>();
  const drafts: Draft[] = SQUAD_ORDER.slice(0, size).map((position, i) => {
    const rng = root.fork('player', i);
    const age = Math.round(clamp(rng.normal(26.5, 5.2), PLAYER_MIN_AGE, PLAYER_MAX_AGE - 5));
    const birthYear = Number(season.slice(0, 4)) - age;

    // Rating: the division's band, the club's strength, a few gems, the deeper bench a notch lower.
    let target = mid + strength + rng.normal(0, spread) - (i >= 18 ? 2 : 0);
    if (rng.chance(0.07)) target += rng.range(3, 7);
    target = Math.round(clamp(target, range.min - 4, range.max + 5));

    const archetype = pickWeighted(rng, ARCHETYPES_BY_POSITION[position]);
    const def = ARCHETYPE_DEFS[archetype];
    const body = buildBody(rng.fork('body'), position, archetype, age, target);

    let firstName = '';
    let lastName = '';
    for (let attempt = 0; attempt < 30; attempt++) {
      const names = rng.fork('name', attempt);
      const firsts = FIRST_NAMES[decadeOf(birthYear)];
      const lasts = names.chance(0.68) ? COMMON_SURNAMES : DIVERSE_SURNAMES;
      firstName = firsts[skewed(names, firsts.length)] ?? 'Kévin';
      lastName = lasts[skewed(names, lasts.length)] ?? 'Dupont';
      if (!usedNames.has(`${firstName} ${lastName}`)) break;
    }
    usedNames.add(`${firstName} ${lastName}`);

    const secondary = NEIGHBOURS[position].filter(() => rng.chance(0.3)).slice(0, 2);
    const foot = rng.chance(LEFT_FOOTED.has(position) ? 0.7 : position === 'RB' ? 0.06 : 0.22)
      ? 'left'
      : 'right';
    const weakFoot = clamp(
      pickWeighted(rng, [
        [1, 0.1],
        [2, 0.3],
        [3, 0.35],
        [4, 0.2],
        [5, 0.05],
      ] as const) + (target >= range.max - 3 && rng.chance(0.4) ? 1 : 0),
      1,
      5,
    );
    const skillMoves = clamp(
      1 +
        Math.floor((body.attributes.dribbling - 38) / 12) +
        (rng.chance(0.3) ? 1 : 0) -
        (rng.chance(0.3) ? 1 : 0),
      1,
      5,
    );
    const age$ = ageEffects(age);
    const stamina = Math.round(
      clamp(target + def.stamina + rng.normal(0, 6) + age$.stamina, 25, 97),
    );
    const composure = Math.round(clamp(target + rng.normal(0, 6) + (age - 26) * 0.6, 25, 97));

    return {
      clubId: club.id,
      season,
      firstName,
      lastName,
      birthYear,
      age,
      positions: [position, ...secondary],
      foot,
      weakFoot,
      skillMoves,
      heightCm: rng.int(def.height[0], def.height[1]),
      attributes: body.attributes,
      keeper: body.keeper,
      stamina,
      composure,
      archetype,
      traits: [],
      rating: ratingOf(position, body.attributes, body.keeper),
      tier: tierForRating(ratingOf(position, body.attributes, body.keeper)),
      rarity: rng.chance(0.12) ? 'rare' : 'common',
      appearance: appearanceOf(rng.fork('look'), age),
    };
  });

  // Traits: drawn per player, then the roles only a squad gives (captain, set pieces).
  for (const [i, d] of drafts.entries()) {
    const rng = root.fork('traits', i);
    for (const [trait, prob] of traitCandidates(d, division.level)) {
      if (d.traits.length >= 2) break;
      if (rng.chance(prob)) d.traits.push(trait);
    }
  }
  const outfield = drafts.filter((d) => POSITION_LINE[d.positions[0] ?? 'CM'] !== 'goalkeeper');
  const room = (d: Draft): boolean => d.traits.length < 2;
  const captain = [...drafts]
    .filter((d) => d.age >= 26)
    .sort((a, b) => b.composure - a.composure)[0];
  if (captain && !captain.traits.includes('captain') && root.fork('captain').chance(0.85))
    captain.traits = [...captain.traits.slice(0, 1), 'captain'];
  const takers = [...outfield]
    .sort(
      (a, b) =>
        b.attributes.passing +
        b.attributes.shooting -
        (a.attributes.passing + a.attributes.shooting),
    )
    .slice(0, 2);
  for (const [i, d] of takers.entries())
    if (root.fork('taker', i).chance(0.6) && room(d)) d.traits.push('set-piece-specialist');

  // Traits with a number attached.
  for (const d of drafts) {
    if (d.traits.includes('one-footed')) d.weakFoot = 1;
    if (d.traits.includes('workhorse'))
      d.stamina = Math.max(d.stamina, Math.min(97, d.rating + 12));
    if (d.traits.includes('former-pro')) d.composure = Math.min(97, d.composure + 8);
    if (d.traits.includes('captain')) d.composure = Math.min(97, d.composure + 4);
  }

  // Shirt numbers: the best players get the usual number of their position.
  const numbers = new Set<number>();
  const numbered = new Map<Draft, number>();
  for (const d of [...drafts].sort((a, b) => b.rating - a.rating)) {
    const preferred = PREFERRED_NUMBERS[d.positions[0] ?? 'CM'].find((n) => !numbers.has(n));
    let number = preferred ?? 12;
    while (numbers.has(number)) number++;
    numbers.add(number);
    numbered.set(d, number);
  }

  const players: Player[] = drafts.map((d, i) => ({
    ...d,
    id: `${club.id}-${season}-${String(i + 1).padStart(2, '0')}`,
    number: numbered.get(d) ?? i + 1,
    displayName: `${d.firstName.charAt(0)}. ${d.lastName.toUpperCase()}`,
  }));
  return { clubId: club.id, season, players };
}
