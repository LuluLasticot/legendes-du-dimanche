// A player card in 3D (D-035): two faces and an edge, textured from the card's SVG. The scene that
// holds it drives its state (glow, flash, sweep…) for idle, tilt and reveal animations.

import * as THREE from 'three';
import { edgeGeometry, faceGeometry, shapeFromPath } from './outline.ts';
import { CARD_COMMON, CARD_FS, CARD_VS, EDGE_FS, EDGE_VS } from './shaders.ts';

export const CARD3D_WIDTH = 2.5;
export const CARD3D_HEIGHT = 3.5;
const THICKNESS = 0.018;

/** How the shader treats a template (mirrors `CardFinish` of @legendes/ui). */
export interface Card3DFinish {
  readonly metal: string;
  readonly foil: number;
  readonly glitter: number;
  readonly goldHolo: boolean;
  readonly glow: string;
}

export interface Card3DSources {
  /** SVG path of the card's outline in its 250 × 350 box. */
  readonly outline: string;
  readonly face: TexImageSource;
  readonly faceMask: TexImageSource;
  readonly back: TexImageSource;
  readonly backMask: TexImageSource;
  readonly finish: Card3DFinish;
}

/**
 * Textures shared by several cards (the backs of a pack's cards of the same tier): one upload per
 * source. Owned and disposed by the scene; a card never disposes a cached texture.
 */
export class TextureCache {
  private readonly textures = new Map<TexImageSource, THREE.Texture>();
  constructor(private readonly anisotropy = 8) {}

  get(source: TexImageSource, srgb: boolean): THREE.Texture {
    let t = this.textures.get(source);
    if (!t) {
      t = texture(source, srgb, this.anisotropy);
      this.textures.set(source, t);
    }
    return t;
  }

  dispose(): void {
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
  }
}

function texture(source: TexImageSource, srgb: boolean, anisotropy: number): THREE.Texture {
  const t = new THREE.Texture(source);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

function sizeOf(source: TexImageSource): { width: number; height: number } {
  const s = source as { width?: number; height?: number };
  return { width: s.width ?? 1024, height: s.height ?? 1434 };
}

export class Card3D {
  readonly group = new THREE.Group();
  /** Halo from the edges, in the finish's glow colour (0 to 1+). */
  glow = 0;
  /** White added to the whole card. */
  flash = 0;
  /** Darkening (cards waiting their turn). */
  dim = 0;
  /** Position of the light sweep across the card (−3 = off). */
  sweep = -3;
  /** Holographic strength multiplier. */
  holo = 1;
  /**
   * World-space plane (normal, offset): the card is only drawn where `n·p + w ≥ 0`. The default
   * keeps everything; a pack uses it to hide the cards below its torn edge.
   */
  readonly clip = new THREE.Vector4(0, 0, 0, 1);

  private readonly textures: THREE.Texture[];
  private readonly materials: THREE.ShaderMaterial[];
  private readonly geometries: THREE.BufferGeometry[];
  private readonly frontUniforms: Record<string, THREE.IUniform>;
  private readonly backUniforms: Record<string, THREE.IUniform>;
  private readonly edgeUniforms: Record<string, THREE.IUniform>;

  /** The two faces, for picking a card under the pointer. */
  readonly pickable: THREE.Object3D[];

  constructor(sources: Card3DSources, anisotropy = 8, cache?: TextureCache) {
    const shape = shapeFromPath(sources.outline, 250, 350);
    const front = faceGeometry(shape, 250, 350);
    const edge = edgeGeometry(shape, THICKNESS);
    this.geometries = [front, edge];

    const f = sources.finish;
    const glowColour = new THREE.Color(f.glow);
    const faceTex = texture(sources.face, true, anisotropy);
    const faceMask = texture(sources.faceMask, false, anisotropy);
    const backTex = cache ? cache.get(sources.back, true) : texture(sources.back, true, anisotropy);
    const backMask = cache
      ? cache.get(sources.backMask, false)
      : texture(sources.backMask, false, anisotropy);
    this.textures = cache ? [faceTex, faceMask] : [faceTex, faceMask, backTex, backMask];

    const surface = (
      layout: THREE.Texture,
      mask: THREE.Texture,
      source: TexImageSource,
      foil: number,
    ): Record<string, THREE.IUniform> => {
      const { width, height } = sizeOf(source);
      return {
        uLayout: { value: layout },
        uMask: { value: mask },
        uTexel: { value: new THREE.Vector2(1 / width, 1 / height) },
        uAspect: { value: CARD3D_WIDTH / CARD3D_HEIGHT },
        uMetal: { value: new THREE.Color(f.metal) },
        uFoil: { value: foil },
        uGlitter: { value: f.glitter },
        uGoldHolo: { value: f.goldHolo ? 1 : 0 },
        uGlow: { value: 0 },
        uGlowCol: { value: glowColour },
        uFlash: { value: 0 },
        uDim: { value: 0 },
        uHolo: { value: 1 },
        uSweep: { value: -3 },
        uTime: { value: 0 },
        uClip: { value: this.clip },
      };
    };
    this.frontUniforms = surface(faceTex, faceMask, sources.faceMask, f.foil);
    // The back shimmers less: its promise is in the frame's metal.
    this.backUniforms = surface(backTex, backMask, sources.backMask, f.foil * 0.35);
    this.edgeUniforms = {
      uEdge: { value: new THREE.Color(f.metal) },
      uFoil: { value: f.foil },
      uGlow: { value: 0 },
      uGlowCol: { value: glowColour },
      uDim: { value: 0 },
      uClip: { value: this.clip },
    };
    const material = (uniforms: Record<string, THREE.IUniform>, fs: string, vs: string) =>
      new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: CARD_COMMON + fs });
    const frontMat = material(this.frontUniforms, CARD_FS, CARD_VS);
    const backMat = material(this.backUniforms, CARD_FS, CARD_VS);
    const edgeMat = material(this.edgeUniforms, EDGE_FS, EDGE_VS);
    this.materials = [frontMat, backMat, edgeMat];

    const frontMesh = new THREE.Mesh(front, frontMat);
    frontMesh.position.z = THICKNESS / 2;
    // Turned half a turn, the same face shows the back the right way round.
    const backMesh = new THREE.Mesh(front, backMat);
    backMesh.rotation.y = Math.PI;
    backMesh.position.z = -THICKNESS / 2;
    this.group.add(frontMesh, backMesh, new THREE.Mesh(edge, edgeMat));
    this.pickable = [frontMesh, backMesh];
  }

  /** Pushes the animation state to the shaders. */
  update(time: number): void {
    for (const u of [this.frontUniforms, this.backUniforms]) {
      (u['uTime'] as THREE.IUniform).value = time;
      (u['uGlow'] as THREE.IUniform).value = this.glow;
      (u['uFlash'] as THREE.IUniform).value = this.flash;
      (u['uDim'] as THREE.IUniform).value = this.dim;
      (u['uSweep'] as THREE.IUniform).value = this.sweep;
      (u['uHolo'] as THREE.IUniform).value = this.holo;
    }
    (this.edgeUniforms['uGlow'] as THREE.IUniform).value = this.glow;
    (this.edgeUniforms['uDim'] as THREE.IUniform).value = this.dim;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const t of this.textures) t.dispose();
    for (const m of this.materials) m.dispose();
    for (const g of this.geometries) g.dispose();
  }
}
