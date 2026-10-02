import { findCard } from '@legendes/data';
import { cardShareNode, SHARE_SIZE } from '@legendes/ui/card';
import { cardShare } from '@/lib/share/labels';
import { imageResponse, renderPng, toJpeg } from '@/lib/share/render';

export const size = SHARE_SIZE;
export const contentType = 'image/jpeg';
export const alt = 'Carte de joueur — Légendes du Dimanche';

/** The card as a link preview (1200 × 630), drawn from the card of the game. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const found = findCard((await params).id);
  if (!found) return new Response('Not found', { status: 404 });
  const { face, labels } = await cardShare(found.card, found.club);
  return imageResponse(await toJpeg(await renderPng(cardShareNode(face, labels))), contentType);
}
