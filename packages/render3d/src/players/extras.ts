// The idle players around a key moment: the rest of an 11 v 11 match, standing (and breathing)
// where the engine puts them, so the pitch is not empty behind the shooter or the keeper. They
// do not play a part: no shadow, one looping idle clip, started at a different point each.

import type * as THREE from 'three';
import type { moments } from '@legendes/engine';
import { Character, type Kit } from './character.ts';
import type { CharacterAsset } from './character-asset.ts';
import type { CharacterLook } from './kit-material.ts';

type Look = Kit | CharacterLook;

export class PitchExtras {
  private readonly characters: Character[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly asset: CharacterAsset,
  ) {}

  /**
   * Puts the players in place, facing `look`; reuses the characters it already has. `kits`
   * gives the n-th player of each side his kit.
   */
  set(
    players: readonly moments.BackgroundPlayer[],
    look: { x: number; z: number },
    kits: { readonly attack: (index: number) => Look; readonly defend: (index: number) => Look },
  ): void {
    while (this.characters.length > players.length) this.characters.pop()?.dispose();
    const idle = this.asset.clips.get('player_idle')?.duration ?? 10;
    const counts = { attack: 0, defend: 0 };
    players.forEach((player, i) => {
      const kit = kits[player.side](counts[player.side]++);
      let character = this.characters[i];
      if (!character) {
        character = new Character(this.asset, kit);
        character.setShadows(false);
        this.scene.add(character.root);
        this.characters.push(character);
      }
      character.setKit(kit);
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
