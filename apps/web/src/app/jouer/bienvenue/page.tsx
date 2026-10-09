import { redirect } from 'next/navigation';
import { STAGE_PATH, stageOf } from '@/server/game/stage';
import { currentPlayer } from '../current';

export default async function WelcomePage() {
  const stage = stageOf(await currentPlayer());
  if (stage !== 'start') redirect(STAGE_PATH[stage]);
  return null;
}
