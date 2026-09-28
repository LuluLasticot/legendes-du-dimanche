// An animated player: a skeleton clone of the shared asset, kit colours, an AnimationMixer with
// cross-fades, and anchoring — after the pose is computed, the root is shifted so that a body
// part (hands, foot) lands exactly where the simulation says it is. The engine decides, the
// animation follows: contacts on screen are the contacts that were simulated.

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterAsset, ClipMeta } from './character-asset.ts';

export interface Kit {
  readonly shirt: number;
  readonly shorts: number;
}

export type BodyPart =
  'hands' | 'leftHand' | 'rightHand' | 'leftToe' | 'rightToe' | 'head' | 'hips';

export interface PlayOptions {
  /** Cross-fade duration in seconds (0 = cut). */
  fade?: number;
  loop?: boolean;
  /** Playback rate (negative plays backwards). */
  timeScale?: number;
  /** Start time within the clip, seconds. */
  startAt?: number;
}

const BONES: Readonly<Record<Exclude<BodyPart, 'hands'>, string>> = {
  leftHand: 'mixamorigLeftHand',
  rightHand: 'mixamorigRightHand',
  leftToe: 'mixamorigLeftToeBase',
  rightToe: 'mixamorigRightToeBase',
  head: 'mixamorigHead',
  hips: 'mixamorigHips',
};

export class Character {
  /** Place/rotate this group; the skinned model lives inside. */
  readonly root = new THREE.Group();
  readonly asset: CharacterAsset;
  private readonly model: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly bones = new Map<string, THREE.Object3D>();
  private current: THREE.AnimationAction | null = null;
  private currentName: string | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly materials: THREE.MeshStandardMaterial[] = [];

  constructor(asset: CharacterAsset, kit: Kit) {
    this.asset = asset;
    this.model = cloneSkinned(asset.scene);
    this.root.add(this.model);
    this.model.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) {
        object.castShadow = true;
        object.frustumCulled = false;
        const joints = /joint/i.test(object.name);
        const material = new THREE.MeshStandardMaterial({
          color: joints ? kit.shorts : kit.shirt,
          roughness: 0.75,
          metalness: 0.05,
        });
        this.materials.push(material);
        object.material = material;
      }
      if ((object as THREE.Bone).isBone) this.bones.set(object.name, object);
    });
    this.mixer = new THREE.AnimationMixer(this.model);
  }

  setKit(kit: Kit): void {
    this.model.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) {
        (object.material as THREE.MeshStandardMaterial).color.setHex(
          /joint/i.test(object.name) ? kit.shorts : kit.shirt,
        );
      }
    });
  }

  /** See-through body (e.g. the keeper seen over his shoulder): 1 = opaque. */
  setOpacity(opacity: number): void {
    const transparent = opacity < 1;
    for (const material of this.materials) {
      if (material.transparent !== transparent) material.needsUpdate = true;
      material.transparent = transparent;
      material.opacity = opacity;
      material.depthWrite = !transparent;
    }
  }

  clipMeta(name: string): ClipMeta | undefined {
    return this.asset.meta.clips[name];
  }

  get playing(): string | null {
    return this.currentName;
  }

  /** Current time in the playing clip (seconds). */
  get time(): number {
    return this.current?.time ?? 0;
  }

  play(name: string, options: PlayOptions = {}): void {
    const clip = this.asset.clips.get(name);
    if (!clip) return;
    let action = this.actions.get(name);
    if (!action) {
      action = this.mixer.clipAction(clip);
      this.actions.set(name, action);
    }
    const loop = options.loop ?? false;
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    action.setEffectiveTimeScale(options.timeScale ?? 1);
    action.setEffectiveWeight(1);
    if (action !== this.current || !loop) {
      action.reset();
      action.time =
        options.startAt ??
        (options.timeScale !== undefined && options.timeScale < 0 ? clip.duration : 0);
      action.play();
      const fade = options.fade ?? 0.15;
      if (this.current && this.current !== action && fade > 0)
        this.current.crossFadeTo(action, fade, false);
      else if (this.current && this.current !== action) this.current.stop();
    }
    this.current = action;
    this.currentName = name;
  }

  /** Plays `name` looping unless it is already the current clip (for continuous states). */
  loop(name: string, fade = 0.2, timeScale = 1): void {
    if (this.currentName === name) {
      this.current?.setEffectiveTimeScale(timeScale);
      return;
    }
    this.play(name, { loop: true, fade, timeScale });
  }

  setTimeScale(timeScale: number): void {
    this.current?.setEffectiveTimeScale(timeScale);
  }

  /** Places the character: feet position on the ground and facing yaw (0 = facing +Z). */
  place(position: THREE.Vector3 | { x: number; y: number; z: number }, yaw: number): void {
    this.root.position.set(position.x, position.y, position.z);
    this.root.rotation.set(0, yaw, 0);
  }

  /** Advances the animation by `dt` seconds and updates the world matrices. */
  update(dt: number): void {
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);
  }

  /** World position of a body part in the current pose. */
  part(part: BodyPart, out = new THREE.Vector3()): THREE.Vector3 {
    if (part === 'hands') {
      this.part('leftHand', this.tmp2);
      return this.part('rightHand', out).add(this.tmp2).multiplyScalar(0.5);
    }
    const bone = this.bones.get(BONES[part]);
    return bone ? bone.getWorldPosition(out) : out.copy(this.root.position);
  }

  /**
   * Shifts the character so that `part` sits at `target`, blended by `weight` (0 = no change,
   * 1 = exactly on target). Call after place() and update(). `vertical` also moves the root up/down.
   */
  anchor(
    part: BodyPart,
    target: { x: number; y: number; z: number },
    weight: number,
    vertical = true,
  ): void {
    if (weight <= 0) return;
    const current = this.part(part, this.tmp);
    const dx = (target.x - current.x) * weight;
    const dy = vertical ? (target.y - current.y) * weight : 0;
    const dz = (target.z - current.z) * weight;
    this.root.position.x += dx;
    this.root.position.y += dy;
    this.root.position.z += dz;
    this.root.updateMatrixWorld(true);
  }

  /** Yaw that makes a +Z-facing character face along (dx, dz). */
  static yawFacing(dx: number, dz: number): number {
    return Math.atan2(dx, dz);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    for (const material of this.materials) material.dispose();
    this.root.removeFromParent();
  }
}
