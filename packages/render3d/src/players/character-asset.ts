// Character asset (converted from Mixamo by scripts/convert-mixamo.mjs): one GLB with the
// skinned mesh and every clip, plus a metadata JSON validated with Zod at the network boundary.
// Missing asset (e.g. a deployment without it) → null, and scenes fall back to greybox figures.

import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { z } from 'zod';

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

export const characterMetaSchema = z.object({
  version: z.literal(1),
  facing: z.literal('+Z'),
  triangles: z.number(),
  clips: z.record(
    z.string(),
    z.object({
      duration: z.number().positive(),
      /** Horizontal root travel removed from the clip (character-local x, z, metres). */
      rootTravel: z.tuple([z.number(), z.number()]),
      rest: z.object({ hands: vec3, head: vec3, hips: vec3 }),
      contact: z
        .object({
          time: z.number(),
          foot: z.enum(['left', 'right']),
          position: vec3,
          footSpeed: z.number(),
        })
        .optional(),
      extension: z.object({ time: z.number(), hands: vec3 }).optional(),
      apex: z.object({ time: z.number(), head: vec3 }).optional(),
    }),
  ),
});
export type CharacterMeta = z.infer<typeof characterMetaSchema>;
export type ClipMeta = CharacterMeta['clips'][string];

export interface CharacterAsset {
  readonly scene: THREE.Object3D;
  readonly clips: ReadonlyMap<string, THREE.AnimationClip>;
  readonly meta: CharacterMeta;
}

const cache = new Map<string, Promise<CharacterAsset | null>>();

/** Loads (once) the character asset from `baseUrl` (e.g. "/assets/characters/"). */
export function loadCharacterAsset(baseUrl: string): Promise<CharacterAsset | null> {
  const cached = cache.get(baseUrl);
  if (cached) return cached;
  const promise = (async (): Promise<CharacterAsset | null> => {
    try {
      const response = await fetch(`${baseUrl}player.meta.json`);
      if (!response.ok) return null;
      const meta = characterMetaSchema.parse(await response.json());
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(`${baseUrl}player.glb`);
      const clips = new Map(gltf.animations.map((clip) => [clip.name, clip] as const));
      return { scene: gltf.scene, clips, meta };
    } catch (error) {
      console.warn('[characters] asset unavailable, using greybox figures', error);
      return null;
    }
  })();
  cache.set(baseUrl, promise);
  return promise;
}
