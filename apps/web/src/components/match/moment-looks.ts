// Who wears what in a key moment (Phase 3, step 6): the two clubs' kits of the match, each
// player with his own skin, hair and number, and the team prints (crest, sponsor, digits).
// Browser only (the prints are drawn on canvases).

import {
  generateSquad,
  identityOf,
  kitPrintNode,
  matchKits,
  type Club,
  type KitSpec,
  type Player,
} from '@legendes/data';
import type { sim } from '@legendes/engine';
import type * as Render3D from '@legendes/render3d';
import type { CharacterLook, MomentLooks } from '@legendes/render3d';
import { playerLook } from '@legendes/ui/card';
import { CARD_FONT_FILES, rasterize } from '@/components/card/card-assets';
import { clubOf } from './match-config';

interface Side {
  readonly team: sim.MatchTeam;
  readonly club: Club;
  readonly kit: KitSpec;
  readonly players: ReadonlyMap<string, Player>;
}

export async function momentLooks(
  render3d: typeof Render3D,
  setup: sim.MatchSetup,
  request: sim.MomentRequest,
): Promise<MomentLooks> {
  const clubs = [clubOf(setup.home.id), clubOf(setup.away.id)] as const;
  const kits = matchKits(clubs[0], clubs[1]);
  const side = (i: 0 | 1): Side => ({
    team: i === 0 ? setup.home : setup.away,
    club: clubs[i],
    kit: i === 0 ? kits.home : kits.away,
    players: new Map(generateSquad(clubs[i]).players.map((p) => [p.id, p] as const)),
  });
  const attack = side(request.attacking);
  const defend = side(request.attacking === 0 ? 1 : 0);
  const keeperKit = identityOf(defend.club).kits.keeper;

  const css = await render3d.cardFontCss(CARD_FONT_FILES);
  const print = (club: Club, kit: KitSpec, sponsor: boolean): Promise<HTMLCanvasElement> => {
    const identity = identityOf(club);
    return rasterize(
      render3d,
      kitPrintNode(kit, {
        uid: `${club.id}-moment-print`,
        crest: identity.crest,
        sponsor: sponsor ? identity.sponsors[0]?.label : undefined,
      }),
      1024,
      css,
    );
  };
  const [attackPrints, defendPrints, keeperPrints] = await Promise.all([
    print(attack.club, attack.kit, true),
    print(defend.club, defend.kit, true),
    print(defend.club, keeperKit, false),
  ]);

  const dress = (s: Side, prints: HTMLCanvasElement, ids: readonly string[]): CharacterLook[] =>
    ids.flatMap((id) => {
      const player = s.players.get(id);
      return player ? [{ ...playerLook(player, s.kit, false), prints }] : [];
    });
  const outfield = (s: Side, except: string): string[] =>
    s.team.lineup.filter((id) => id !== except && s.players.get(id)?.positions[0] !== 'GK');
  const keeper = defend.players.get(request.keeper.id);
  return {
    attack: dress(attack, attackPrints, [
      request.shooter.id,
      ...outfield(attack, request.shooter.id),
    ]),
    defend: dress(defend, defendPrints, outfield(defend, request.keeper.id)),
    keeper: keeper
      ? { ...playerLook(keeper, keeperKit, true), prints: keeperPrints }
      : render3d.plainLook(0xd4ff3a, 0x1b1f24),
  };
}
