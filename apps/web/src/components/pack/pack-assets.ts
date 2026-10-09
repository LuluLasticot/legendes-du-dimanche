// The textures of a pack opening (pack foil, cards, crest, the walkout player's kit), drawn from
// the same SVG trees as everywhere else. Shared by the lab and the game.

import {
  crestNode,
  crestOf,
  identityOf,
  kitNameNode,
  kitPrintNode,
  type PackCard,
} from '@legendes/data';
import type * as Render3D from '@legendes/render3d';
import type { PackOpeningAssets } from '@legendes/render3d';
import {
  CARD_FINISHES,
  PACK_LOOKS,
  PACK_TEAR_V,
  packMaskNode,
  packNode,
  playerLook,
  type PackArtType,
  type PackLabels,
} from '@legendes/ui/card';
import { CARD_FONT_FILES, cardSources, rasterize } from '@/components/card/card-assets';
import { cardFaceOf, type FaceTranslators } from '@/components/card/player-card';

/** A club's pitch as the 3D stadium paints it. */
const SURFACE_KEY = { grass: 'grass', artificial: 'artificial', stabilized: 'dirt' } as const;

export async function buildPackAssets(
  render3d: typeof Render3D,
  opened: { readonly type: PackArtType; readonly cards: readonly PackCard[] },
  tr: FaceTranslators,
  labels: PackLabels,
): Promise<PackOpeningAssets> {
  const css = await render3d.cardFontCss(CARD_FONT_FILES);
  const backs = new Map<string, Promise<readonly [HTMLCanvasElement, HTMLCanvasElement]>>();
  const last = opened.cards.length - 1;
  const cards = await Promise.all(
    opened.cards.map(async ({ card, club }, i) => {
      const face = cardFaceOf(card, club, tr);
      const sources = await cardSources(
        render3d,
        face,
        i === last ? 1024 : 512,
        css,
        i === last ? undefined : backs,
      );
      return { ...sources, rank: CARD_FINISHES[face.look].rank };
    }),
  );
  const bestClub = opened.cards[last]?.club;
  if (!bestClub) throw new Error('Empty pack');
  const type = opened.type;
  const look = PACK_LOOKS[type];
  // The best card's player walks out in his club's home kit (his keeper's kit for a keeper),
  // with its prints and his name above his number.
  const player = opened.cards[last]?.card.player;
  const identity = identityOf(bestClub);
  const keeper = player?.positions[0] === 'GK';
  const kit = keeper ? identity.kits.keeper : identity.kits.home;
  const [front, frontMask, back, backMask, crest, prints, backName] = await Promise.all([
    rasterize(render3d, packNode(type, labels, 'pack'), 580, css),
    rasterize(render3d, packMaskNode(type, labels, 'pack'), 290, css),
    rasterize(render3d, packNode(type, labels, 'pack-back', true), 580, css),
    rasterize(render3d, packMaskNode(type, labels, 'pack-back', true), 290, css),
    rasterize(render3d, crestNode(crestOf(bestClub), 'crest-best'), 400, css),
    rasterize(
      render3d,
      kitPrintNode(kit, {
        uid: `${bestClub.id}-walkout-print`,
        crest: identity.crest,
        sponsor: keeper ? undefined : identity.sponsors[0]?.label,
      }),
      1024,
      css,
    ),
    player ? rasterize(render3d, kitNameNode(kit, player.lastName), 512, css) : null,
  ]);
  return {
    pack: {
      front,
      frontMask,
      back,
      backMask,
      tint: look.tint,
      holo: look.holo,
      tearV: PACK_TEAR_V,
    },
    cards,
    crest,
    clubColours: [bestClub.colours.primary, bestClub.colours.secondary],
    surface: SURFACE_KEY[bestClub.stadium.surface],
    player: player ? { ...playerLook(player, kit, keeper), prints, backName } : undefined,
  };
}
