// The look of a player's 3D character (Phase 3, step 6), from the same data as his card: skin
// and hair from the avatar's palette, the club kit, his shirt number. The renderer adds the
// team's print texture (crest, sponsor, digits).

import type { KitSpec, Player } from '@legendes/data';
import { HAIR_COLOURS, SKIN_TONES } from './avatar.ts';

export interface PlayerLook {
  readonly kit: KitSpec;
  readonly skin: string;
  /** Null: shaved head (the 3D body has no hair volume, only its colour on the scalp). */
  readonly hair: string | null;
  readonly number: number;
  /** Goalkeeper gloves (and long sleeves), or null. */
  readonly gloves: string | null;
  readonly boots: string;
}

/** Boot colours: black most of the time, then white and the bright colours of today's boots. */
const BOOTS: readonly (readonly [string, number])[] = [
  ['#16181b', 0.45],
  ['#eeeeea', 0.2],
  ['#2b6fe0', 0.13],
  ['#c6f432', 0.12],
  ['#ff6a2b', 0.1],
];

/** FNV-1a: a stable pick from the player's identifier (no randomness, no engine needed). */
function unit(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x100000000;
}

export function bootsOf(playerId: string): string {
  let r = unit(`boots:${playerId}`);
  for (const [colour, weight] of BOOTS) {
    if (r < weight) return colour;
    r -= weight;
  }
  return BOOTS[0]![0];
}

/** `kit`: the club's home or away kit, or its goalkeeper kit for a goalkeeper. */
export function playerLook(
  player: Player,
  kit: KitSpec,
  keeper = player.positions[0] === 'GK',
): PlayerLook {
  const { appearance } = player;
  return {
    kit,
    skin: SKIN_TONES[appearance.skin - 1] ?? SKIN_TONES[2]!,
    hair: appearance.hair === 'bald' ? null : HAIR_COLOURS[appearance.hairColour],
    number: player.number,
    gloves: keeper ? '#f4f1e8' : null,
    boots: bootsOf(player.id),
  };
}
