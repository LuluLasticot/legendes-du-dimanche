import {
  crestOf,
  divisionLabel,
  getDivision,
  kitsOf,
  type Card,
  type Club,
  type Player,
} from '@legendes/data';
import { POSITION_LINE } from '@legendes/engine/sim/positions';
import { cardNode, lookOf, type CardFace, type CardTuning } from '@legendes/ui/card';
import { useTranslations } from 'next-intl';
import { SvgTree } from '@/components/club/svg-tree';

const OUTFIELD = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical'] as const;
const KEEPER = ['diving', 'handling', 'kicking', 'reflexes', 'speed', 'positioning'] as const;

type StatKey = (typeof OUTFIELD)[number] | (typeof KEEPER)[number];

function statsOf(player: Player, label: (key: StatKey) => string): CardFace['stats'] {
  const keeper = POSITION_LINE[player.positions[0] ?? 'CM'] === 'goalkeeper';
  return keeper
    ? KEEPER.map((k) => ({ label: label(k), value: player.keeper[k] }))
    : OUTFIELD.map((k) => ({ label: label(k), value: player.attributes[k] }));
}

/**
 * A player card (GDD §5.1), drawn from the card and its club. Works in server and client
 * components; the drawing itself is the pure SVG tree of `@legendes/ui/card`.
 */
export function PlayerCard({
  card,
  club,
  tuning,
  className,
}: {
  card: Card;
  club: Club;
  tuning?: CardTuning;
  className?: string;
}) {
  const t = useTranslations('cards');
  const tPos = useTranslations('positions');
  const tAttr = useTranslations('attributes');
  const tTraits = useTranslations('traits');
  const { player } = card;
  const position = player.positions[0] ?? 'CM';
  const division = getDivision(club.divisionId);
  const kits = kitsOf(club);
  const face: CardFace = {
    uid: card.id,
    look: lookOf(card.tier, card.rarity, card.variant),
    rating: player.rating,
    position: tPos(`${position}.short`),
    name: player.displayName,
    division: division ? divisionLabel(division) : '',
    crest: crestOf(club),
    clubColours: club.colours,
    stats: statsOf(player, (k) => tAttr(k)),
    weakFoot: player.weakFoot,
    skillMoves: player.skillMoves,
    labels: { weakFoot: t('weakFoot'), skillMoves: t('skillMoves') },
    trait: player.traits[0] === undefined ? null : tTraits(`${player.traits[0]}.name`),
    promo: card.variant === 'base' ? null : t(`variants.${card.variant}`),
    appearance: player.appearance,
    kit: position === 'GK' ? kits.keeper : kits.home,
  };
  const node = cardNode(face, tuning);
  return (
    <svg
      viewBox={String(node.attrs['viewBox'])}
      className={className}
      role="img"
      aria-label={t('label', {
        name: player.displayName,
        rating: player.rating,
        position: tPos(`${position}.long`),
        club: club.name,
      })}
    >
      {node.children.map((child, i) => (
        <SvgTree key={i} node={child} />
      ))}
    </svg>
  );
}
