// HDR post-processing: the scene is rendered into a half-float target, then a Kawase dual-filter
// bloom and a composite pass (ACES tonemapping, vignette, grain, flash…) write to the screen.
// Ported from Carte du Ciel (render/engine.ts), wrapped in a disposable class.

import * as THREE from 'three';
import {
  COMPOSITE_FS,
  FULLSCREEN_VS,
  GLSL_COMMON,
  KAWASE_DOWN_FS,
  KAWASE_UP_FS,
} from '../shaders/post.ts';
import type { QualityProfile } from './quality.ts';

/** Artistic post settings, mutated freely by scenes and the camera director. */
export interface PostSettings {
  exposure: number;
  /** Overall bloom strength. */
  bloom: number;
  /** Luminance above which pixels bloom. */
  bloomThreshold: number;
  vignette: number;
  grain: number;
  /** Chromatic aberration. */
  chromatic: number;
  /** Additive flash (0–1+), coloured by flashColor. */
  flash: number;
  readonly flashColor: THREE.Color;
  /** Letterbox bars height (0–0.5 of the screen). */
  bars: number;
  zoomBlur: number;
  saturation: number;
  /** Shockwave: centre (x, y in UV), radius, strength. */
  readonly shock: THREE.Vector4;
}

export function defaultPostSettings(): PostSettings {
  return {
    exposure: 1,
    bloom: 0.8,
    bloomThreshold: 1,
    vignette: 0.55,
    grain: 0.025,
    chromatic: 0,
    flash: 0,
    flashColor: new THREE.Color(1, 1, 1),
    bars: 0,
    zoomBlur: 0,
    saturation: 1,
    shock: new THREE.Vector4(0.5, 0.5, 0, 0),
  };
}

function fullscreenMaterial(
  fragmentShader: string,
  uniforms: Record<string, THREE.IUniform>,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VS,
    fragmentShader: GLSL_COMMON + fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
}

export class PostPipeline {
  readonly settings: PostSettings = defaultPostSettings();
  private sceneTarget!: THREE.WebGLRenderTarget;
  private readonly down: THREE.WebGLRenderTarget[] = [];
  private readonly up: THREE.WebGLRenderTarget[] = [];
  private readonly geometry = new THREE.BufferGeometry();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly fsScene = new THREE.Scene();
  private readonly downMat = fullscreenMaterial(KAWASE_DOWN_FS, {
    tSrc: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uThreshold: { value: 1 },
    uPrefilter: { value: 1 },
  });
  private readonly upMat = fullscreenMaterial(KAWASE_UP_FS, {
    tSrc: { value: null },
    tAdd: { value: null },
    uTexel: { value: new THREE.Vector2() },
  });
  private readonly compMat = fullscreenMaterial(COMPOSITE_FS, {
    tScene: { value: null },
    tBloom: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uExposure: { value: 1 },
    uBloomK: { value: 1 },
    uVig: { value: 0.6 },
    uGrain: { value: 0.03 },
    uCA: { value: 0 },
    uFlash: { value: 0 },
    uFlashCol: { value: new THREE.Color() },
    uBars: { value: 0 },
    uZoomBlur: { value: 0 },
    uSat: { value: 1 },
    uShock: { value: new THREE.Vector4() },
    uLens: { value: new THREE.Vector4() },
  });

  constructor(profile: QualityProfile) {
    // One oversized triangle covering the screen.
    this.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
    this.quad = new THREE.Mesh(this.geometry, this.downMat);
    this.quad.frustumCulled = false;
    this.fsScene.add(this.quad);
    this.buildTargets(profile);
  }

  /** (Re)creates render targets for a quality profile (MSAA, bloom depth). */
  buildTargets(profile: QualityProfile): void {
    this.disposeTargets();
    this.sceneTarget = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      samples: profile.msaa,
      depthBuffer: true,
    });
    for (let i = 0; i < profile.bloomLevels; i++) {
      this.down.push(
        new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false }),
      );
    }
    for (let i = 0; i < profile.bloomLevels - 1; i++) {
      this.up.push(
        new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false }),
      );
    }
  }

  setSize(width: number, height: number): void {
    this.sceneTarget.setSize(width, height);
    for (let i = 0; i < this.down.length; i++) {
      const w = Math.max(1, width >> (i + 1));
      const h = Math.max(1, height >> (i + 1));
      this.down[i]?.setSize(w, h);
      this.up[i]?.setSize(w, h);
    }
  }

  private draw(
    renderer: THREE.WebGLRenderer,
    material: THREE.ShaderMaterial,
    target: THREE.WebGLRenderTarget | null,
  ): void {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.fsScene, this.camera);
  }

  /**
   * Renders the scene through the post chain to the screen. Returns the draw calls and triangles
   * of the scene pass alone (the budgets of CLAUDE.md apply to it, not to the fullscreen passes).
   */
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    time: number,
  ): { drawCalls: number; triangles: number } {
    renderer.setRenderTarget(this.sceneTarget);
    renderer.clear(true, true, false);
    renderer.info.reset();
    renderer.render(scene, camera);
    const drawCalls = renderer.info.render.calls;
    const triangles = renderer.info.render.triangles;

    const s = this.settings;
    let src = this.sceneTarget.texture;
    let sw = this.sceneTarget.width;
    let sh = this.sceneTarget.height;
    const du = this.downMat.uniforms;
    for (let i = 0; i < this.down.length; i++) {
      const target = this.down[i] as THREE.WebGLRenderTarget;
      (du.tSrc as THREE.IUniform).value = src;
      ((du.uTexel as THREE.IUniform).value as THREE.Vector2).set(1 / sw, 1 / sh);
      (du.uPrefilter as THREE.IUniform).value = i === 0 ? 1 : 0;
      (du.uThreshold as THREE.IUniform).value = s.bloomThreshold;
      this.draw(renderer, this.downMat, target);
      src = target.texture;
      sw = target.width;
      sh = target.height;
    }
    let low = this.down[this.down.length - 1] as THREE.WebGLRenderTarget;
    const uu = this.upMat.uniforms;
    for (let i = this.up.length - 1; i >= 0; i--) {
      const target = this.up[i] as THREE.WebGLRenderTarget;
      (uu.tSrc as THREE.IUniform).value = low.texture;
      ((uu.uTexel as THREE.IUniform).value as THREE.Vector2).set(1 / low.width, 1 / low.height);
      (uu.tAdd as THREE.IUniform).value = (this.down[i] as THREE.WebGLRenderTarget).texture;
      this.draw(renderer, this.upMat, target);
      low = target;
    }

    const u = this.compMat.uniforms as Record<string, THREE.IUniform>;
    const set = (name: string, value: unknown): void => {
      (u[name] as THREE.IUniform).value = value;
    };
    set('tScene', this.sceneTarget.texture);
    set('tBloom', (this.up[0] ?? low).texture);
    ((u.uRes as THREE.IUniform).value as THREE.Vector2).set(
      this.sceneTarget.width,
      this.sceneTarget.height,
    );
    set('uTime', time);
    set('uExposure', s.exposure);
    set('uBloomK', s.bloom / Math.max(1, this.down.length));
    set('uVig', s.vignette);
    set('uGrain', s.grain);
    set('uCA', s.chromatic);
    set('uFlash', s.flash);
    ((u.uFlashCol as THREE.IUniform).value as THREE.Color).copy(s.flashColor);
    set('uBars', s.bars);
    set('uZoomBlur', s.zoomBlur);
    set('uSat', s.saturation);
    ((u.uShock as THREE.IUniform).value as THREE.Vector4).copy(s.shock);
    this.draw(renderer, this.compMat, null);
    return { drawCalls, triangles };
  }

  private disposeTargets(): void {
    // `sceneTarget` is unset only before the first build.
    (this.sceneTarget as THREE.WebGLRenderTarget | undefined)?.dispose();
    for (const t of [...this.down, ...this.up]) t.dispose();
    this.down.length = 0;
    this.up.length = 0;
  }

  dispose(): void {
    this.disposeTargets();
    this.geometry.dispose();
    this.downMat.dispose();
    this.upMat.dispose();
    this.compMat.dispose();
  }
}
