import { getClub } from '@legendes/data';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { GameShell } from '@/components/shell/game-shell';
import { sessionClient } from '@/lib/supabase/session';
import { seasonOf } from '@/server/game/season';
import { STAGE_PATH } from '@/server/game/stage';
import { requireStage } from '../current';

/** The game's shell, once the welcome is done. */
export default async function GameLayout({ children }: { children: ReactNode }) {
  const player = await requireStage('playing');
  const club = getClub(player.clubId ?? '');
  if (!club) redirect(STAGE_PATH.club);
  const db = await sessionClient();
  const { data } = await db.from('matches').select('status, score').eq('user_id', player.userId);
  const season = seasonOf(data ?? []);
  return (
    <GameShell
      player={{
        club,
        credits: player.credits,
        record: { wins: season.wins, draws: season.draws, losses: season.losses },
        level: season.level,
        xp: season.xp,
        nextLevelXp: season.nextLevelXp,
        packsWaiting: player.packs.length,
      }}
    >
      {children}
    </GameShell>
  );
}
