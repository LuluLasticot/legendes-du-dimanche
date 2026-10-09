import { requireStage } from '../../current';

export default async function ClubPage() {
  await requireStage('club');
  return null;
}
