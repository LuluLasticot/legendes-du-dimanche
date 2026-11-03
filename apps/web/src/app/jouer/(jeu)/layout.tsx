import { getClub } from '@legendes/data';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { GameShell } from '@/components/shell/game-shell';
import { STAGE_PATH } from '@/server/game/stage';
import { requireStage } from '../current';

/** The game's shell, once the welcome is done. */
export default async function GameLayout({ children }: { children: ReactNode }) {
  const player = await requireStage('playing');
  const club = getClub(player.clubId ?? '');
  if (!club) redirect(STAGE_PATH.club);
  return (
    <GameShell
      player={{
        club,
        credits: player.credits,
        // Record and season XP come with the matches (plan C).
        record: { wins: 0, draws: 0, losses: 0 },
        level: 1,
        xp: 0,
        nextLevelXp: 500,
        packsWaiting: player.packs.length,
      }}
    >
      {children}
    </GameShell>
  );
}
