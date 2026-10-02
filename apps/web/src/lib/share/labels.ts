// Everything the public pages and the share images print about a card or a club, translated on
// the server (the same strings the game shows).

import { divisionLabel, getDivision, identityOf, type Card, type Club } from '@legendes/data';
import type { CardFace, CardShareLabels, ClubShareLabels } from '@legendes/ui/card';
import { getTranslations } from 'next-intl/server';
import { cardFaceOf, type FaceTranslators } from '@/components/card/player-card';

export async function serverFaceTranslators(): Promise<FaceTranslators> {
  const [cards, positions, attributes, traits] = await Promise.all([
    getTranslations('cards'),
    getTranslations('positions'),
    getTranslations('attributes'),
    getTranslations('traits'),
  ]);
  return { cards, positions, attributes, traits };
}

export async function cardShare(
  card: Card,
  club: Club,
): Promise<{ face: CardFace; labels: CardShareLabels; title: string; description: string }> {
  const tr = await serverFaceTranslators();
  const t = await getTranslations('share');
  const tiers = await getTranslations('tiers');
  const rarities = await getTranslations('rarities');
  const face = cardFaceOf(card, club, tr);
  const { player } = card;
  const position = tr.positions(`${player.positions[0] ?? 'CM'}.long`);
  const division = getDivision(club.divisionId);
  const eyebrow =
    card.variant === 'base'
      ? `${tiers(card.tier)} ${rarities(card.rarity).toLowerCase()}`
      : tr.cards(`variants.${card.variant}`);
  const labels: CardShareLabels = {
    eyebrow,
    line: t('cardLine', { rating: player.rating, position, number: player.number }),
    club: club.name,
    clubLine: t('clubLine', { division: division ? divisionLabel(division) : '', city: club.city }),
    brand: t('brand'),
    footnote: t('fictional'),
  };
  return {
    face,
    labels,
    title: t('cardTitle', { name: `${player.firstName} ${player.lastName}`, club: club.name }),
    description: t('cardDescription', {
      eyebrow,
      rating: player.rating,
      position,
      club: club.name,
    }),
  };
}

export async function clubShare(
  club: Club,
): Promise<{ labels: ClubShareLabels; title: string; description: string }> {
  const t = await getTranslations('share');
  const division = getDivision(club.divisionId);
  const divisionName = division ? divisionLabel(division) : '';
  const identity = identityOf(club);
  return {
    labels: {
      eyebrow: divisionName,
      name: club.name,
      line: t('clubPlace', { city: club.city, stadium: club.stadium.name }),
      brand: t('brand'),
      footnote: t('clubFootnote'),
    },
    title: t('clubTitle', { club: club.name }),
    description: t('clubDescription', {
      club: club.name,
      division: divisionName,
      city: club.city,
      sponsor: identity.sponsors[0]?.name ?? '',
    }),
  };
}
