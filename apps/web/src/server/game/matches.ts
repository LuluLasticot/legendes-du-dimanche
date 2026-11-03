// Matches (spec §8): the server freezes the setup, the player plays it, the server replays his
// inputs and pays on the replay, never on what the client says (rule 2).

import { randomInt } from 'node:crypto';
import {
  generateSquad,
  getClub,
  getDivision,
  matchKits,
  toMatchTeam,
  toMatchTeamFromSheet,
  WORLD,
  type Club,
} from '@legendes/data';
import { sim } from '@legendes/engine';
import type { CompetitionLevel, Json } from '@legendes/shared';
import { z } from 'zod';
import { GameError, gameErrorFrom } from './errors.ts';
import type { PlayerState } from './player.ts';
import { savedSheet } from './squads.ts';
import type { GameDb } from './wallet.ts';

/** The player is at home and plays the key moments; the coach's break at half-time. */
export const MATCH_OPTIONS: sim.MatchOptions = { userSide: 0, pauseAtHalfTime: true };

const WIN: Readonly<Record<CompetitionLevel, number>> = {
  district: 300,
  regional: 600,
  national: 900,
};
const PER_MOMENT = 25;
/** No real match is over this fast (two minutes at the top speed): faster is a script (D-044). */
const MIN_MATCH_SECONDS = 60;
/** The first match: its first key moment comes before 3:00 (spec §8, "match guidé"). */
const GUIDED_BEFORE = 3 * 60;
const SURFACE = { grass: 'grass', artificial: 'artificial', stabilized: 'dirt' } as const;

/** Credits for a played match (GDD §9.2): a win by level, half a draw, a quarter a defeat. */
export function matchReward(
  level: CompetitionLevel,
  score: readonly [number, number],
  won: number,
): number {
  const win = WIN[level];
  const base = score[0] > score[1] ? win : score[0] === score[1] ? win / 2 : win / 4;
  return Math.round(base) + PER_MOMENT * won;
}

/** Key moments won by the player: a goal when he shoots, no goal when he keeps. */
export const momentsWon = (played: readonly sim.PlayedMoment[]): number =>
  played.filter((m) => (m.kind === 'keeper' ? m.outcome !== 'goal' : m.outcome === 'goal')).length;

/** Matchday N's opponent: the N-th other club of the division by id, round and round. */
export function opponentOf(club: Club, matchday: number): Club {
  const others = WORLD.clubs
    .filter((c) => c.divisionId === club.divisionId && c.id !== club.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  return others[(matchday - 1) % others.length] ?? club;
}

/** The first seed whose first key moment for the player comes early (the engine is untouched). */
function guidedSeed(setup: Omit<sim.MatchSetup, 'seed'>): number {
  for (let seed = 1; seed <= 400; seed++) {
    const match = new sim.MatchSim({ ...setup, seed }, MATCH_OPTIONS);
    while (match.step() && !match.waiting);
    const first = match.pendingMoment;
    if (first && first.half === 1 && first.t < GUIDED_BEFORE) return seed;
  }
  return 1;
}

const matchRow = z.object({ id: z.uuid(), setup: z.unknown() });

/** Starts the player's next match, or gives back the one he has not finished. */
export async function startMatch(
  db: GameDb,
  player: PlayerState,
  requestId: string,
): Promise<{ matchId: string; setup: sim.MatchSetup }> {
  const open = await db
    .from('matches')
    .select('id, setup')
    .eq('user_id', player.userId)
    .eq('status', 'created')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open.error) throw gameErrorFrom(open.error);
  if (open.data) {
    const row = matchRow.parse(open.data);
    return { matchId: row.id, setup: row.setup as sim.MatchSetup };
  }

  const club = getClub(player.clubId ?? '');
  if (!club) throw new GameError('club_not_chosen');
  const played = await db
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', player.userId)
    // Rejected matches count too: a bad result does not buy a new first-match seed.
    .neq('status', 'created');
  if (played.error) throw gameErrorFrom(played.error);
  const matchday = (played.count ?? 0) + 1;
  const opponent = opponentOf(club, matchday);
  const kits = matchKits(club, opponent);
  const base: Omit<sim.MatchSetup, 'seed'> = {
    home: toMatchTeamFromSheet(club, await savedSheet(db, player), { kit: kits.home }),
    away: toMatchTeam(opponent, generateSquad(opponent), { kit: kits.away }),
    conditions: {
      surface: SURFACE[club.stadium.surface],
      rain: false,
      windSpeed: 0,
      windDirection: 0,
    },
  };
  const seed = matchday === 1 ? guidedSeed(base) : randomInt(1, 2 ** 31 - 1);
  const setup: sim.MatchSetup = { ...base, seed };
  const { data, error } = await db.rpc('create_match', {
    p_user: player.userId,
    p_seed: seed,
    p_setup: setup as unknown as Json,
    p_options: MATCH_OPTIONS as unknown as Json,
    p_request: requestId,
  });
  if (error) throw gameErrorFrom(error);
  const matchId = z.uuid().parse(data);
  // Another tab may have stored its own match first: play the stored one, whatever this call built.
  const stored = await db.from('matches').select('setup').eq('id', matchId).single();
  if (stored.error) throw gameErrorFrom(stored.error);
  return { matchId, setup: stored.data.setup as unknown as sim.MatchSetup };
}

const OUTCOMES = ['goal', 'save-catch', 'save-parry', 'block', 'post', 'miss', 'offside'] as const;
const STYLES = [
  'balanced',
  'possession',
  'counter',
  'long-ball',
  'high-press',
  'low-block',
] as const;
const scale = z.number().min(1).max(5);
/** Only the player's own side can be changed (side 0): never the opponent's. */
const change = z.discriminatedUnion('type', [
  z.object({
    phase: z.number().int().min(0),
    type: z.literal('tactic'),
    side: z.literal(0),
    tactic: z.object({
      mentality: z.union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)]),
      style: z.enum(STYLES),
      width: scale,
      lineHeight: scale,
      pressing: scale,
      takers: z.object({
        penalty: z.string().optional(),
        freeKick: z.string().optional(),
        corner: z.string().optional(),
      }),
    }),
  }),
  z.object({
    phase: z.number().int().min(0),
    type: z.literal('sub'),
    side: z.literal(0),
    out: z.string(),
    in: z.string(),
  }),
]);
const claimedSchema = z.object({
  moments: z.array(z.enum(OUTCOMES)).max(12),
  // The half-time panel records each click: well above what a coach does, still bounded.
  changes: z.array(change).max(200),
  score: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
});

/**
 * The player's inputs replayed on the frozen setup. Mirrors `replayMatch` with the public
 * `MatchSim` API, to read the key moments played as well as the score.
 */
function replay(setup: sim.MatchSetup, inputs: sim.MatchInputs) {
  // ponytail: a copy of replayMatch's loop; move it to the engine (with playedMoments) when touched.
  const match = new sim.MatchSim(setup, MATCH_OPTIONS);
  let moment = 0;
  let next = 0;
  for (;;) {
    while (
      next < inputs.changes.length &&
      (inputs.changes[next]?.phase ?? Infinity) <= match.phaseIndex
    ) {
      const c = inputs.changes[next++] as sim.MatchChange;
      if (c.type === 'tactic') match.setTactic(c.side, c.tactic);
      else match.substitute(c.side, c.out, c.in);
    }
    if (match.waiting === 'half-time') {
      match.resumeSecondHalf();
      continue;
    }
    if (!match.step()) break;
    if (match.pendingMoment) {
      const outcome = inputs.moments[moment++];
      if (outcome === undefined) throw new Error('Missing key-moment outcome');
      match.resolveMoment(outcome);
    }
  }
  if (moment !== inputs.moments.length) throw new Error('Extra key-moment outcomes');
  return { result: match.result(), played: match.playedMoments };
}

export interface MatchVerdict {
  readonly status: 'validated' | 'rejected';
  readonly reward: number;
  readonly score: readonly [number, number] | null;
}

/** Checks a played match by replaying it, and pays it once. Asked again, gives the same verdict. */
export async function finishMatch(
  db: GameDb,
  userId: string,
  matchId: string,
  claimed: unknown,
  { minSeconds = MIN_MATCH_SECONDS }: { minSeconds?: number } = {},
): Promise<MatchVerdict> {
  const found = await db
    .from('matches')
    .select('setup, status, reward, score, created_at')
    .eq('id', matchId)
    .eq('user_id', userId)
    .maybeSingle();
  if (found.error) throw gameErrorFrom(found.error);
  if (!found.data) throw new GameError('match_not_found');
  const row = found.data;
  if (row.status !== 'created') {
    return {
      status: row.status === 'validated' ? 'validated' : 'rejected',
      reward: row.reward ?? 0,
      score: row.score ? [row.score[0] ?? 0, row.score[1] ?? 0] : null,
    };
  }

  // Trusted JSON: written by startMatch, never by the client.
  const setup = row.setup as unknown as sim.MatchSetup;
  const parsed = claimedSchema.safeParse(claimed);
  let verdict: { valid: boolean; score: [number, number]; won: number } = {
    valid: false,
    score: [0, 0],
    won: 0,
  };
  const elapsed = (Date.now() - new Date(row.created_at).getTime()) / 1000;
  if (parsed.success && elapsed >= minSeconds) {
    try {
      const { result, played } = replay(setup, parsed.data);
      const score: [number, number] = [result.score[0], result.score[1]];
      verdict = {
        valid: score[0] === parsed.data.score[0] && score[1] === parsed.data.score[1],
        score,
        won: momentsWon(played),
      };
    } catch {
      // Inputs that do not replay this match: rejected below.
    }
  }

  const club = getClub(setup.home.id);
  const level = (club && getDivision(club.divisionId)?.level) ?? 'district';
  const reward = verdict.valid ? matchReward(level, verdict.score, verdict.won) : 0;
  const { error } = await db.rpc('record_match', {
    p_user: userId,
    p_match: matchId,
    p_valid: verdict.valid,
    p_score: verdict.score,
    p_moments_won: verdict.won,
    p_reward: reward,
  });
  if (error) throw gameErrorFrom(error);
  return verdict.valid
    ? { status: 'validated', reward, score: verdict.score }
    : { status: 'rejected', reward: 0, score: null };
}
