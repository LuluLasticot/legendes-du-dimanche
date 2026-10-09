import { requireStage } from './current';

export default async function HomePage() {
  await requireStage('playing');
  return null;
}
