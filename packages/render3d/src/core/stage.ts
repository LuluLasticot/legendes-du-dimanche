// Stage: owns the WebGL renderer, the render loop, the post chain, quality and the frame clock.
// Imperative API (mount → onFrame → dispose): React only mounts a canvas and hands it over,
// it never touches Three.js objects.

import * as THREE from 'three';
import { AdaptiveResolution } from './adaptive.ts';
import { prefersReducedMotion, probeDevice } from './device.ts';
import { FrameClock, type FrameAdvance } from './frame-clock.ts';
import { PostPipeline, type PostSettings } from './post.ts';
import {
  detectQuality,
  QUALITY_PROFILES,
  type DeviceInfo,
  type QualityChoice,
  type QualityLevel,
  type QualityProfile,
} from './quality.ts';
import { CameraShake } from './shake.ts';

export interface StageOptions {
  /** 'auto' (default) picks a level from the device. */
  readonly quality?: QualityChoice;
  /** Adapt resolution, then quality, to hold the frame rate (default true). */
  readonly adaptive?: boolean;
  readonly fov?: number;
  readonly near?: number;
  readonly far?: number;
  /** Called when the quality level changes (setting or automatic downgrade). */
  readonly onQualityChange?: (level: QualityLevel) => void;
}

export interface StageFrame extends FrameAdvance {
  /** Real seconds since the stage started. */
  readonly time: number;
  /**
   * Unclamped real seconds since the previous frame. Use it for cosmetic decays (flash, UI),
   * never for the simulation (use `ticks`).
   */
  readonly wallDt: number;
}

export type FrameCallback = (frame: StageFrame) => void;

export interface StageStats {
  fps: number;
  frameMs: number;
  /** Draw calls of the scene pass (budget: < 150 in key moments). */
  drawCalls: number;
  /** Triangles of the scene pass (budget: < 300 000). */
  triangles: number;
  /** Dynamic resolution factor (1 = full). */
  resolution: number;
  pixelRatio: number;
  quality: QualityLevel;
  width: number;
  height: number;
}

export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly clock = new FrameClock();
  readonly shake: CameraShake;
  readonly device: DeviceInfo;
  readonly renderer: THREE.WebGLRenderer;
  readonly stats: StageStats;
  profile: QualityProfile;

  private readonly canvas: HTMLCanvasElement;
  private readonly post: PostPipeline;
  private readonly adaptive: AdaptiveResolution | null;
  private readonly callbacks = new Set<FrameCallback>();
  private readonly resizeObserver: ResizeObserver;
  private readonly onQualityChange: ((level: QualityLevel) => void) | undefined;
  private raf = 0;
  private lastTimestamp = -1;
  private time = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private running = false;
  private disposed = false;

  private constructor(canvas: HTMLCanvasElement, options: StageOptions) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    // Tonemapping and sRGB conversion happen in the composite pass.
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setClearColor(0x000000, 1);

    this.device = probeDevice(this.renderer);
    const choice = options.quality ?? 'auto';
    const level = choice === 'auto' ? detectQuality(this.device) : choice;
    this.profile = QUALITY_PROFILES[level];
    this.applyShadows();

    this.camera = new THREE.PerspectiveCamera(
      options.fov ?? 40,
      1,
      options.near ?? 0.1,
      options.far ?? 600,
    );
    this.shake = new CameraShake({ reducedMotion: prefersReducedMotion() });
    this.post = new PostPipeline(this.profile);
    this.adaptive = options.adaptive === false ? null : new AdaptiveResolution();
    this.onQualityChange = options.onQualityChange;
    this.stats = {
      fps: 0,
      frameMs: 0,
      drawCalls: 0,
      triangles: 0,
      resolution: 1,
      pixelRatio: 1,
      quality: level,
      width: 1,
      height: 1,
    };

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    this.resize();
  }

  /** Creates a stage on a canvas and starts the render loop. Throws if WebGL 2 is unavailable. */
  static mount(canvas: HTMLCanvasElement, options: StageOptions = {}): Stage {
    const stage = new Stage(canvas, options);
    stage.start();
    return stage;
  }

  get postSettings(): PostSettings {
    return this.post.settings;
  }

  /** Registers a per-frame callback (simulation stepping, animation). Returns an unsubscribe. */
  onFrame(callback: FrameCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastTimestamp = -1;
    this.raf = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  setQuality(level: QualityLevel): void {
    if (level === this.profile.level) return;
    this.profile = QUALITY_PROFILES[level];
    this.stats.quality = level;
    if (this.adaptive) this.adaptive.resolution = 1;
    this.post.buildTargets(this.profile);
    this.applyShadows();
    this.resize();
    this.onQualityChange?.(level);
  }

  /** Converts a client (CSS pixel) position to normalised device coordinates. */
  toNdc(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.callbacks.clear();
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.scene.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Line ||
        object instanceof THREE.Points
      ) {
        (object.geometry as THREE.BufferGeometry).dispose();
        const materials = ([] as THREE.Material[]).concat(
          object.material as THREE.Material | THREE.Material[],
        );
        for (const material of materials) material.dispose();
      }
    });
    this.post.dispose();
    this.renderer.dispose();
  }

  private applyShadows(): void {
    this.renderer.shadowMap.enabled = this.profile.shadowMapSize > 0;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
  }

  private resize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const resolution = this.adaptive?.resolution ?? 1;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.profile.maxDpr) * resolution;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.post.setSize(
      Math.max(1, Math.round(width * pixelRatio)),
      Math.max(1, Math.round(height * pixelRatio)),
    );
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    Object.assign(this.stats, { width, height, pixelRatio, resolution });
  }

  private readonly loop = (timestamp: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = this.lastTimestamp < 0 ? 1 / 60 : (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    this.time += dt;

    const advance = this.clock.advance(dt);
    const frame: StageFrame = { ...advance, time: this.time, wallDt: dt };
    for (const callback of this.callbacks) callback(frame);

    // Shake on top of whatever the scene/director did to the camera, then restore.
    const offset = this.shake.update(advance.realDt);
    const position = this.camera.position.clone();
    const quaternion = this.camera.quaternion.clone();
    this.camera.translateX(offset.x);
    this.camera.translateY(offset.y);
    this.camera.rotateZ(offset.roll);
    const pass = this.post.render(this.renderer, this.scene, this.camera, this.time);
    this.camera.position.copy(position);
    this.camera.quaternion.copy(quaternion);

    this.stats.drawCalls = pass.drawCalls;
    this.stats.triangles = pass.triangles;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.stats.fps = this.fpsFrames / this.fpsAcc;
      this.stats.frameMs = (this.fpsAcc / this.fpsFrames) * 1000;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }

    if (this.adaptive) {
      const decision = this.adaptive.sample(dt, this.profile.level, this.profile.minRes);
      if (decision.type === 'resolution') this.resize();
      else if (decision.type === 'quality') this.setQuality(decision.level);
    }
  };

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.stop();
  };

  private readonly onContextRestored = (): void => {
    this.post.buildTargets(this.profile);
    this.resize();
    this.start();
  };
}
