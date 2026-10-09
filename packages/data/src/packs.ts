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
import { WORLD } from './world.ts';

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
// What a new player opens first (GDD §3.5): random players, the biggest group from the club he
// chose (any club of the pilot, District 5 to National 2), the rest from all over the pilot, and
// the same strength for everyone — bronze, silver and gold, no big rare, like the first pack of
// the genre. A strong club's cards are made up for by weaker other cards.

export const STARTER_PACK_SIZE = 18;
/** Cards from the chosen club; the rest comes from the other clubs of the pilot. */
export const STARTER_CLUB_CARDS = 8;
/** Cards of each tier in the whole pack, whatever the club (a strong club may go over). */
export const STARTER_MIX: Readonly<Record<StarterTier, number>> = { bronze: 8, silver: 6, gold: 4 };

type StarterTier = Exclude<CardTier, 'special'>;
const STARTER_TIERS: readonly StarterTier[] = ['bronze', 'silver', 'gold'];

/** Per line: how many cards from the club, how many from the others (2 + 6 + 6 + 4 in all). */
const STARTER_SLOTS: readonly { line: PositionLine; own: number; others: number }[] = [
  { line: 'goalkeeper', own: 1, others: 1 },
  { line: 'defence', own: 3, others: 3 },
  { line: 'midfield', own: 2, others: 4 },
  { line: 'attack', own: 2, others: 2 },
];

/** No big rare: no rare gold, no promo. */
const STARTER_CLASSES: ReadonlySet<CardClass> = new Set([
  'bronze-common',
  'bronze-rare',
  'silver-common',
  'silver-rare',
  'gold-common',
]);

export interface StarterPack {
  readonly type: 'starter';
  readonly seed: string;
  readonly clubId: string;
  /** Eighteen cards, the least valuable first. */
  readonly cards: readonly PackCard[];
}

interface StarterEntry extends Entry {
  readonly line: PositionLine;
  readonly tier: StarterTier;
}

let starterPool: readonly StarterEntry[] | null = null;

/** The pilot's players a starter pack may hold, in a stable order. */
function starterEntries(): readonly StarterEntry[] {
  if (starterPool) return starterPool;
  const p = poolsOfPilot();
  starterPool = [...STARTER_CLASSES].flatMap((cardClass) =>
    p[cardClass].map((e) => ({
      ...e,
      line: POSITION_LINE[e.player.positions[0] ?? 'CM'],
      tier: cardClass.split('-')[0] as StarterTier,
    })),
  );
  return starterPool;
}

/** Tiers of the cards from other clubs: what the club's cards leave of the mix, weakest kept. */
function othersTiers(own: readonly StarterEntry[], count: number): StarterTier[] {
  const quota = STARTER_TIERS.map((t) =>
    Math.max(0, STARTER_MIX[t] - own.filter((e) => e.tier === t).length),
  );
  // A club over the mix leaves more than `count`: the strongest tiers give way first.
  for (
    let i = STARTER_TIERS.length - 1, extra = quota.reduce((a, b) => a + b, 0) - count;
    extra > 0;
    i--
  ) {
    const cut = Math.min(extra, quota[i] ?? 0);
    quota[i] = (quota[i] ?? 0) - cut;
    extra -= cut;
  }
  return STARTER_TIERS.flatMap((t, i) => Array.from({ length: quota[i] ?? 0 }, () => t));
}

/** Draws the starter pack of a club. Deterministic: the same club and seed give the same cards. */
export function openStarterPack(club: Club, seed: string): StarterPack {
  const rng = Rng.create(`starter:${club.id}:${seed}`);
  const entries = starterEntries();
  const taken = new Set<string>();
  const picked: StarterEntry[] = [];
  let slot = 0;

  const draw = (pool: readonly StarterEntry[], what: string): void => {
    const free = pool.filter((e) => !taken.has(e.player.id));
    if (free.length === 0)
      throw new Error(`No ${what} card left for the starter pack of ${club.id}`);
    const entry = rng.fork('slot', slot++).pick(free);
    taken.add(entry.player.id);
    picked.push(entry);
  };

  // The club's cards; a club short of a profile is completed from clubs of its division.
  for (const { line, own } of STARTER_SLOTS) {
    const mine = entries.filter((e) => e.line === line && e.club.id === club.id);
    const near = entries.filter(
      (e) => e.line === line && e.club.id !== club.id && e.club.divisionId === club.divisionId,
    );
    for (let i = 0; i < own; i++)
      draw(mine.some((e) => !taken.has(e.player.id)) ? mine : near, line);
  }

  // The others, from the rest of the pilot, at the tiers that keep the mix.
  const others = STARTER_SLOTS.flatMap(({ line, others: n }) =>
    Array.from({ length: n }, () => line),
  );
  const tiers = rng.fork('tiers').shuffle(othersTiers(picked, others.length));
  others.forEach((line, i) => {
    const tier = tiers[i] ?? 'bronze';
    draw(
      entries.filter((e) => e.line === line && e.tier === tier && e.club.id !== club.id),
      `${tier} ${line}`,
    );
  });

  const cards = picked.map((e) => ({ card: cardOf(e.player), club: e.club }));
  cards.sort((a, b) => cardValue(a.card) - cardValue(b.card) || a.card.id.localeCompare(b.card.id));
  return { type: 'starter', seed, clubId: club.id, cards };
}
