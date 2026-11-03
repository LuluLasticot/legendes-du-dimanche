import { GameMatch } from '@/components/game/game-match';
import { requireStage } from '../current';

/** The player's match, full screen (no shell, as in the lab). */
export default async function MatchPage() {
  await requireStage('playing');
  return (
    <main className="flex h-dvh flex-col bg-pitch-950">
      <GameMatch />
    </main>
  );
}
