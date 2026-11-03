// The player's season, derived from his validated matches (no table): record and season XP.

const XP_PER_MATCH = 100;
const XP_PER_WIN = 50;
const XP_PER_LEVEL = 500;

export interface Season {
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  readonly xp: number;
  readonly level: number;
  readonly nextLevelXp: number;
}

export function seasonOf(
  matches: readonly { status: string; score: readonly number[] | null }[],
): Season {
  let [wins, draws, losses] = [0, 0, 0];
  for (const m of matches) {
    if (m.status !== 'validated' || !m.score) continue;
    const [home = 0, away = 0] = m.score;
    if (home > away) wins++;
    else if (home === away) draws++;
    else losses++;
  }
  const xp = (wins + draws + losses) * XP_PER_MATCH + wins * XP_PER_WIN;
  const level = 1 + Math.floor(xp / XP_PER_LEVEL);
  return { wins, draws, losses, xp, level, nextLevelXp: level * XP_PER_LEVEL };
}
