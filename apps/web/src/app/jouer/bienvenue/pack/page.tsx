import { requireStage } from '../../current';

export default async function PackPage() {
  // "playing" too: once the pack is open, a reload replays the same cards.
  await requireStage('pack', 'playing');
  return null;
}
