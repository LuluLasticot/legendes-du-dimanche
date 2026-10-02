import { getClub, identityOf } from '@legendes/data';
import { clubShareNode, SHARE_SIZE } from '@legendes/ui/card';
import { clubShare } from '@/lib/share/labels';
import { imageResponse, renderPng, toJpeg } from '@/lib/share/render';

export const size = SHARE_SIZE;
export const contentType = 'image/jpeg';
export const alt = 'Club — Légendes du Dimanche';

/** The club as a link preview (1200 × 630): its crest, its name and its kits. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const club = getClub((await params).id);
  if (!club) return new Response('Not found', { status: 404 });
  const identity = identityOf(club);
  const { labels } = await clubShare(club);
  const node = clubShareNode(
    { id: club.id, crest: identity.crest, colour: club.colours.primary },
    [identity.kits.home, identity.kits.away, identity.kits.keeper],
    labels,
  );
  return imageResponse(await toJpeg(await renderPng(node)), contentType);
}
