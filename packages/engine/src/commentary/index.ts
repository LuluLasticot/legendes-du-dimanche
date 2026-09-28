// Commentary of a match (GDD §7.5): the club speaker's lines, chosen from templates. The engine
// decides *which* template and with which parameters, deterministically (same match → same
// commentary, never the same line twice in a row); the words live in the French message file
// (apps/web/messages/fr.json → commentary.<category>.<n>), so the text can be changed or
// translated without touching the engine.

import { Rng } from '../rng/index.ts';
import type { MatchAction, MatchEvent, MatchResult, MatchSetup, Side } from '../sim/index.ts';

/** Number of variants of each template category: keys are "<category>.<0…count−1>". */
export const COMMENTARY_TEMPLATES = {
  kickoff: 4,
  'kickoff-second': 3,
  goal: 6,
  'goal-opener': 5,
  'goal-equaliser': 5,
  'goal-late': 5,
  'goal-longrange': 4,
  'goal-header': 4,
  'goal-penalty': 4,
  'goal-freekick': 4,
  save: 8,
  miss: 8,
  post: 6,
  block: 5,
  foul: 7,
  yellow: 6,
  red: 5,
  injury: 5,
  'free-kick': 5,
  penalty: 6,
  corner: 6,
  offside: 6,
  'throw-in': 5,
  'goal-kick': 5,
  sub: 5,
  'half-time': 5,
  'full-time-win': 4,
  'full-time-draw': 4,
  'full-time-goalless': 3,
  spell: 5,
  fatigue: 3,
  rain: 3,
} as const;

export type CommentCategory = keyof typeof COMMENTARY_TEMPLATES;

/** Placeholders a template may use. */
export const COMMENTARY_PARAMS = [
  'player',
  'other',
  'keeper',
  'team',
  'opponent',
  'minute',
  'score',
] as const;

export interface CommentLine {
  /** Match clock (seconds; the second half restarts at 45:00) and half, like events. */
  readonly t: number;
  readonly half: 1 | 2;
  readonly category: CommentCategory;
  /** Message key under `commentary`: "<category>.<n>". */
  readonly key: string;
  readonly params: Readonly<Record<string, string | number>>;
}

/** How many consecutive actions by one side make a spell of possession worth a remark. */
const SPELL_ACTIONS = 16;
/** Minimum seconds between two remarks of the same ambient kind. */
const SPELL_GAP = 4 * 60;

const clockKey = (half: 1 | 2, t: number): number => (half === 1 ? t : 1e5 + t);

export function commentate(setup: MatchSetup, result: MatchResult): CommentLine[] {
  const rng = Rng.create(setup.seed).fork('commentary');
  const teams = [setup.home, setup.away] as const;
  const recent = new Map<CommentCategory, number[]>();
  const lines: { line: CommentLine; seq: number }[] = [];

  const surname = (id: string | null): string => {
    if (!id) return '';
    for (const team of teams) {
      const p = team.players.find((x) => x.id === id);
      if (p) return p.name.split(' ').slice(1).join(' ') || p.name;
    }
    return '';
  };
  const other = (side: Side): Side => (side === 0 ? 1 : 0);
  const keeperOf = (side: Side): string => surname(teams[side].lineup[0] ?? null);

  const say = (
    category: CommentCategory,
    at: { t: number; half: 1 | 2 },
    params: Record<string, string | number>,
  ): void => {
    const count = COMMENTARY_TEMPLATES[category];
    const history = recent.get(category) ?? [];
    // Never the last few variants of the category again.
    const avoid = history.slice(-Math.min(count - 1, 3));
    const r = rng.fork(category, lines.length);
    let n = r.int(0, count - 1);
    for (let guard = 0; avoid.includes(n) && guard < count; guard++) n = (n + 1) % count;
    history.push(n);
    recent.set(category, history);
    lines.push({
      seq: lines.length,
      line: {
        t: at.t,
        half: at.half,
        category,
        key: `${category}.${n}`,
        params: { minute: Math.floor(at.t / 60) + 1, ...params },
      },
    });
  };

  // ─── Events ────────────────────────────────────────────────────────────────
  // Successful shots by clock, to know how a goal came about (penalty, free kick, header).
  const shotAt = new Map<string, number>();
  result.actions.forEach((a, i) => {
    if (a.kind === 'shot' && a.success) shotAt.set(`${a.half}:${a.t}`, i);
  });
  const before = (e: MatchEvent): MatchAction | null => {
    const i = shotAt.get(`${e.half}:${e.t}`);
    return i === undefined ? null : (result.actions[i - 1] ?? null);
  };

  let kickoffs = 0;
  for (const e of result.events) {
    const at = { t: e.t, half: e.half };
    const side = e.team;
    const team = teams[side].name;
    const opponent = teams[other(side)].name;
    const score = `${e.score[0]}-${e.score[1]}`;
    const player = surname(e.player);
    const second = surname(e.other);
    switch (e.kind) {
      case 'kickoff':
        say(kickoffs++ === 0 ? 'kickoff' : 'kickoff-second', at, { team, opponent });
        break;
      case 'goal': {
        const previous = before(e);
        const total = e.score[0] + e.score[1];
        let category: CommentCategory = 'goal';
        if (previous?.kind === 'penalty') category = 'goal-penalty';
        else if (previous?.kind === 'free-kick') category = 'goal-freekick';
        else if (previous?.kind === 'cross' && previous.success) category = 'goal-header';
        else if (total === 1) category = 'goal-opener';
        else if (e.score[0] === e.score[1]) category = 'goal-equaliser';
        else if (Math.floor(e.t / 60) + 1 >= 80) category = 'goal-late';
        else if ((e.xg ?? 1) < 0.08) category = 'goal-longrange';
        say(category, at, { player, team, opponent, keeper: keeperOf(other(side)), score });
        break;
      }
      case 'save':
        // Event team is the keeper's; the shooter is `other`.
        say('save', at, { keeper: player, player: second, team, opponent, score });
        break;
      case 'miss':
        say('miss', at, { player, team, opponent, keeper: keeperOf(other(side)) });
        break;
      case 'post':
        say('post', at, { player, team, opponent, keeper: keeperOf(other(side)) });
        break;
      case 'block':
        say('block', at, { player, other: second, team, opponent });
        break;
      case 'foul':
        say('foul', at, { player, other: second, team, opponent });
        break;
      case 'yellow':
        say('yellow', at, { player, team, opponent });
        break;
      case 'red':
        say('red', at, { player, team, opponent });
        break;
      case 'injury':
        say('injury', at, { player, team, opponent });
        break;
      case 'free-kick':
        say('free-kick', at, { player, team, opponent });
        break;
      case 'penalty':
        say('penalty', at, { player, team, opponent, keeper: keeperOf(other(side)) });
        break;
      case 'corner':
        say('corner', at, { player, team, opponent });
        break;
      case 'offside':
        say('offside', at, { player, team, opponent });
        break;
      case 'sub':
        // Event: player = the one coming on, other = the one going off.
        say('sub', at, { player, other: second, team, opponent });
        break;
      case 'half-time':
        say('half-time', at, { score });
        break;
      case 'full-time': {
        const [a, b] = e.score;
        if (a === b) {
          say(a === 0 ? 'full-time-goalless' : 'full-time-draw', at, {
            team: setup.home.name,
            opponent: setup.away.name,
            score,
          });
        } else {
          const winner: Side = a > b ? 0 : 1;
          say('full-time-win', at, {
            team: teams[winner].name,
            opponent: teams[other(winner)].name,
            score: `${Math.max(a, b)}-${Math.min(a, b)}`,
          });
        }
        break;
      }
      default:
        // 'chance' is folded into the outcome that follows it.
        break;
    }
  }

  // ─── Actions: stops, spells of possession, weather, fatigue ────────────────
  let streak = 0;
  let streakSide: Side | null = null;
  let lastSpell = -Infinity;
  let tired = false;
  let rained = false;
  result.actions.forEach((a, i) => {
    const at = { t: a.t, half: a.half };
    const team = teams[a.team].name;
    const opponent = teams[other(a.team)].name;
    if (!rained && setup.conditions.rain && i === 0) {
      rained = true;
      say('rain', at, {});
    }
    if (a.kind === 'throw-in' || a.kind === 'goal-kick') {
      // Only some of the stops get a remark: the speaker does not comment on everything.
      if (rng.fork('stop', i).chance(0.35))
        say(a.kind, at, { player: surname(a.from), team, opponent });
      streak = 0;
      streakSide = null;
      return;
    }
    if (!tired && a.half === 2 && a.t >= 70 * 60) {
      tired = true;
      say('fatigue', at, {});
    }
    if (streakSide === a.team) streak++;
    else {
      streakSide = a.team;
      streak = 1;
    }
    if (streak >= SPELL_ACTIONS && clockKey(a.half, a.t) - lastSpell >= SPELL_GAP) {
      lastSpell = clockKey(a.half, a.t);
      streak = 0;
      say('spell', at, { team, opponent });
    }
  });

  // In match order; at the same instant the final whistle has the last word.
  const rank = (c: CommentCategory): number => (c.startsWith('full-time') ? 1 : 0);
  lines.sort(
    (x, y) =>
      clockKey(x.line.half, x.line.t) - clockKey(y.line.half, y.line.t) ||
      rank(x.line.category) - rank(y.line.category) ||
      x.seq - y.seq,
  );
  return lines.map((x) => x.line);
}
