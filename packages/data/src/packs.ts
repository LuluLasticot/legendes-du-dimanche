// Packs (GDD §9.4): what a pack holds and the draw of its twelve cards. The draw is a pure function
// of the pack type and a seed: the lab calls it with a random seed, the server will call it in
// Phase 4 (draws are server-side only, rule 2 of CLAUDE.md). The odds are data, so the game shows
// exactly the odds it draws with (rule 5).

import { Rng } from '@legendes/engine/rng';
import { POSITION_LINE, type PositionLine } from '@legendes/engine/sim/positions';
import type { CardTier, Rarity } from '@legendes/shared';
import { cardOf, type Card } from './squad/cards.ts';
import { generateSquad } from './squad/generate.ts';
import type { Player } from './squad/player.ts';
import type { Club } from './schema.ts';
import { clubsOf, WORLD } from './world.ts';

/** Every kind of card a pack can hold, from the most common to the rarest. */
export const CARD_CLASSES = [
  'bronze-common',
  'bronze-rare',
  'silver-common',
  'silver-rare',
  'gold-common',
  'gold-rare',
  'former-pro',
  'weekend',
] as const;
export type CardClass = (typeof CARD_CLASSES)[number];

export function cardClassOf(card: Card): CardClass {
  if (card.variant === 'weekend') return 'weekend';
  if (card.variant === 'former-pro') return 'former-pro';
  const tier: Exclude<CardTier, 'special'> = card.tier === 'special' ? 'gold' : card.tier;
  const rarity: Rarity = card.rarity;
  return `${tier}-${rarity}`;
}

/** Rank of a card for sorting a pack: class first, then rating. */
export const cardValue = (card: Card): number =>
  CARD_CLASSES.indexOf(cardClassOf(card)) * 1000 + card.player.rating;

export const PACK_TYPES = ['bronze', 'silver', 'gold', 'gold-premium'] as const;
export type PackType = (typeof PACK_TYPES)[number];

type Odds = Readonly<Partial<Record<CardClass, number>>>;

export interface PackDef {
  readonly type: PackType;
  /** Price in credits (GDD §9.4), shown in the lab; nothing is sold for real money (rule 5). */
  readonly price: number;
  /** Groups of slots: `count` cards drawn with the same odds. Twelve cards in all. */
  readonly slots: readonly { readonly count: number; readonly odds: Odds }[];
  /** Tier of the players a team-of-the-weekend card is drawn from. */
  readonly weekendTier: Exclude<CardTier, 'special'>;
}

export const PACKS: Readonly<Record<PackType, PackDef>> = {
  bronze: {
    type: 'bronze',
    price: 400,
    weekendTier: 'bronze',
    slots: [
      { count: 11, odds: { 'bronze-common': 0.9, 'bronze-rare': 0.1 } },
      // One rare guaranteed.
      { count: 1, odds: { 'bronze-rare': 0.992, weekend: 0.008 } },
    ],
  },
  silver: {
    type: 'silver',
    price: 2000,
    weekendTier: 'silver',
    slots: [
      { count: 11, odds: { 'silver-common': 0.9, 'silver-rare': 0.1 } },
      { count: 1, odds: { 'silver-rare': 0.985, weekend: 0.015 } },
    ],
  },
  gold: {
    type: 'gold',
    price: 5000,
    weekendTier: 'gold',
    slots: [
      {
        count: 8,
        odds: {
          'bronze-common': 0.3,
          'bronze-rare': 0.05,
          'silver-common': 0.45,
          'silver-rare': 0.08,
          'gold-common': 0.1,
          'gold-rare': 0.02,
        },
      },
      // Three gold cards at least.
      { count: 3, odds: { 'gold-common': 0.86, 'gold-rare': 0.14 } },
      {
        count: 1,
        odds: { 'gold-common': 0.8, 'gold-rare': 0.16, 'former-pro': 0.015, weekend: 0.025 },
      },
    ],
  },
  'gold-premium': {
    type: 'gold-premium',
    price: 10000,
    weekendTier: 'gold',
    slots: [
      { count: 9, odds: { 'gold-common': 0.9, 'gold-rare': 0.1 } },
      // Three rares guaranteed.
      { count: 3, odds: { 'gold-rare': 0.9, 'former-pro': 0.04, weekend: 0.06 } },
    ],
  },
};

export const PACK_SIZE = 12;

export interface PackOdds {
  readonly cardClass: CardClass;
  /** Average number of such cards in a pack. */
  readonly expected: number;
  /** Probability of at least one in a pack. */
  readonly atLeastOne: number;
}

/** The odds of a pack as the game shows them (rule 5), rarest first. */
export function packOdds(type: PackType): PackOdds[] {
  const def = PACKS[type];
  return [...CARD_CLASSES]
    .reverse()
    .map((cardClass) => {
      let expected = 0;
      let none = 1;
      for (const { count, odds } of def.slots) {
        const p = odds[cardClass] ?? 0;
        expected += count * p;
        for (let i = 0; i < count; i++) none *= 1 - p;
      }
      return { cardClass, expected, atLeastOne: 1 - none };
    })
    .filter((o) => o.expected > 0);
}

// ─── Pools ───────────────────────────────────────────────────────────────────────────────────

export interface PackCard {
  readonly card: Card;
  readonly club: Club;
}

interface Entry {
  readonly player: Player;
  readonly club: Club;
}

let pools: Readonly<Record<CardClass, readonly Entry[]>> | null = null;

/** The players of the pilot by card class (base cards), in a stable order. */
function poolsOfPilot(): Readonly<Record<CardClass, readonly Entry[]>> {
  if (pools) return pools;
  const out: Record<CardClass, Entry[]> = {
    'bronze-common': [],
    'bronze-rare': [],
    'silver-common': [],
    'silver-rare': [],
    'gold-common': [],
    'gold-rare': [],
    'former-pro': [],
    weekend: [],
  };
  for (const club of [...WORLD.clubs].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const player of generateSquad(club).players) {
      const entry = { player, club };
      out[cardClassOf(cardOf(player))].push(entry);
      if (player.traits.includes('former-pro')) out['former-pro'].push(entry);
    }
  }
  pools = out;
  return out;
}

function candidates(def: PackDef, cardClass: CardClass): readonly Entry[] {
  const p = poolsOfPilot();
  if (cardClass === 'weekend') {
    return [...p[`${def.weekendTier}-common`], ...p[`${def.weekendTier}-rare`]];
  }
  return p[cardClass];
}

export interface OpenedPack {
  readonly type: PackType;
  readonly seed: string;
  /** Twelve cards, the least valuable first: the last one is the pack's best card. */
  readonly cards: readonly PackCard[];
}

/** Draws a pack. Deterministic: the same type and seed give the same twelve cards. */
export function openPack(type: PackType, seed: string): OpenedPack {
  const def = PACKS[type];
  const rng = Rng.create(`pack:${type}:${seed}`);
  const taken = new Set<string>();
  const cards: PackCard[] = [];
  let slot = 0;
  for (const { count, odds } of def.slots) {
    const classes = CARD_CLASSES.filter((c) => (odds[c] ?? 0) > 0);
    const weights = classes.map((c) => odds[c] ?? 0);
    for (let i = 0; i < count; i++, slot++) {
      const draw = rng.fork('slot', slot);
      const cardClass = classes[draw.weightedIndex(weights)] as CardClass;
      const pool = candidates(def, cardClass);
      if (pool.length === 0) throw new Error(`No ${cardClass} card in the pilot`);
      // A player appears once per pack.
      let entry = pool[draw.int(0, pool.length - 1)] as Entry;
      for (let tries = 0; taken.has(entry.player.id) && tries < 20; tries++) {
        entry = pool[draw.int(0, pool.length - 1)] as Entry;
      }
      taken.add(entry.player.id);
      const variant =
        cardClass === 'weekend' ? 'weekend' : cardClass === 'former-pro' ? 'former-pro' : 'base';
      cards.push({ card: cardOf(entry.player, variant), club: entry.club });
    }
  }
  cards.sort((a, b) => cardValue(a.card) - cardValue(b.card) || a.card.id.localeCompare(b.card.id));
  return { type, seed, cards };
}

// ─── Starter pack ────────────────────────────────────────────────────────────────────────────
// What a new player opens first (GDD §3.5): random players, most of them from the club he chose,
// bronze and a couple of silver at most — no big rare, like the first pack of the genre.

export const STARTER_PACK_SIZE = 18;
/** Cards from the chosen club; the rest comes from the other clubs of its district. */
export const STARTER_CLUB_CARDS = 11;
export const STARTER_MAX_SILVER = 2;

/** Per line: how many cards from the club, how many from the others (2 + 6 + 6 + 4 in all). */
const STARTER_SLOTS: readonly { line: PositionLine; own: number; others: number }[] = [
  { line: 'goalkeeper', own: 1, others: 1 },
  { line: 'defence', own: 4, others: 2 },
  { line: 'midfield', own: 4, others: 2 },
  { line: 'attack', own: 2, others: 2 },
];

const STARTER_CLASSES: ReadonlySet<CardClass> = new Set([
  'bronze-common',
  'bronze-rare',
  'silver-common',
  'silver-rare',
]);

export interface StarterPack {
  readonly type: 'starter';
  readonly seed: string;
  readonly clubId: string;
  /** Eighteen cards, the least valuable first. */
  readonly cards: readonly PackCard[];
}

interface StarterEntry extends Entry {
  readonly cardClass: CardClass;
}

const starterPools = new Map<string, readonly StarterEntry[]>();

/** The district's players whose base card is bronze or silver, in a stable order. */
function starterEntries(districtId: string): readonly StarterEntry[] {
  const cached = starterPools.get(districtId);
  if (cached) return cached;
  const entries: StarterEntry[] = [];
  for (const club of [...clubsOf({ districtId })].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const player of generateSquad(club).players) {
      const cardClass = cardClassOf(cardOf(player));
      if (STARTER_CLASSES.has(cardClass)) entries.push({ player, club, cardClass });
    }
  }
  starterPools.set(districtId, entries);
  return entries;
}

/** Draws the starter pack of a club. Deterministic: the same club and seed give the same cards. */
export function openStarterPack(club: Club, seed: string): StarterPack {
  const rng = Rng.create(`starter:${club.id}:${seed}`);
  const entries = starterEntries(club.districtId);
  const taken = new Set<string>();
  const cards: PackCard[] = [];
  let silver = 0;
  let slot = 0;

  const draw = (line: PositionLine, fromClub: boolean): void => {
    const fits = (e: StarterEntry): boolean =>
      POSITION_LINE[e.player.positions[0] ?? 'CM'] === line &&
      !taken.has(e.player.id) &&
      !(silver >= STARTER_MAX_SILVER && e.cardClass.startsWith('silver'));
    const preferred = entries.filter((e) => fits(e) && (e.club.id === club.id) === fromClub);
    // A club short of a profile is completed from the rest of the district (and back).
    const pool = preferred.length > 0 ? preferred : entries.filter(fits);
    if (pool.length === 0)
      throw new Error(`No ${line} card left for the starter pack of ${club.id}`);
    const entry = rng.fork('slot', slot++).pick(pool);
    taken.add(entry.player.id);
    if (entry.cardClass.startsWith('silver')) silver++;
    cards.push({ card: cardOf(entry.player), club: entry.club });
  };

  for (const { line, own, others } of STARTER_SLOTS) {
    for (let i = 0; i < own; i++) draw(line, true);
    for (let i = 0; i < others; i++) draw(line, false);
  }
  cards.sort((a, b) => cardValue(a.card) - cardValue(b.card) || a.card.id.localeCompare(b.card.id));
  return { type: 'starter', seed, clubId: club.id, cards };
}
