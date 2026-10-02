import { findCard } from '@legendes/data';
import { cardStoryNode } from '@legendes/ui/card';
import { cardShare } from '@/lib/share/labels';
import { imageResponse, renderPng } from '@/lib/share/render';

/** The card as a story image (1080 × 1920), to download or share from the card's page. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const found = findCard(id);
  if (!found) return new Response('Not found', { status: 404 });
  const { face, labels } = await cardShare(found.card, found.club);
  return imageResponse(await renderPng(cardStoryNode(face, labels)), 'image/png', `${id}.png`);
}
