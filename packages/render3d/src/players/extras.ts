// The idle players around a key moment: the rest of an 11 v 11 match, standing (and breathing)
// where the engine puts them, so the pitch is not empty behind the shooter or the keeper. They
// do not play a part: no shadow, one looping idle clip, started at a different point each.

import type * as THREE from 'three';
import type { moments } from '@legendes/engine';
import { Character, type Kit } from './character.ts';
import type { CharacterAsset } from './character-asset.ts';

export class PitchExtras {
  private readonly characters: Character[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly asset: CharacterAsset,
  ) {}

  /** Puts the players in place, facing `look`; reuses the characters it already has. */
  set(
    players: readonly moments.BackgroundPlayer[],
    look: { x: number; z: number },
    kits: { readonly attack: Kit; readonly defend: Kit },
  ): void {
    while (this.characters.length > players.length) this.characters.pop()?.dispose();
    const idle = this.asset.clips.get('player_idle')?.duration ?? 10;
    players.forEach((player, i) => {
      let character = this.characters[i];
      if (!character) {
        character = new Character(this.asset, kits[player.side]);
        character.setShadows(false);
        this.scene.add(character.root);
        this.characters.push(character);
      }
      character.setKit(kits[player.side]);
      character.place(
        player.feet,
        Character.yawFacing(look.x - player.feet.x, look.z - player.feet.z),
      );
      // Out of step with each other, and never at the start of the clip.
      character.play('player_idle', { loop: true, startAt: ((i * 2.37) % 1) * idle, fade: 0 });
    });
  }

  update(dt: number): void {
    for (const character of this.characters) character.update(dt);
  }

  dispose(): void {
    for (const character of this.characters) character.dispose();
    this.characters.length = 0;
  }
}
