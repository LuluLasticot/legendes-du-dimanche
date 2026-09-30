// The 3D card viewer (Phase 3, D-035): one card under a floodlight, tilted by the mouse, the
// finger or the phone's gyroscope, turned over by a drag or a tap, and revealed with a sequence
// whose intensity grows with the card's rarity — the building block of pack opening (GDD §12.4).

import * as THREE from 'three';
import { Card3D, CARD3D_HEIGHT, type Card3DSources } from '../cards/card3d.ts';
import { BACKDROP_FS, BACKDROP_VS } from '../cards/shaders.ts';
import { Sparks } from '../cards/sparks.ts';
import { prefersReducedMotion } from '../core/device.ts';
import { clamp01, ease, Spring } from '../core/easing.ts';
import { Stage, type StageOptions, type StageStats } from '../core/stage.ts';

export interface CardViewerOptions extends StageOptions {
  /** 0 (bronze common) to 7 (top promo): intensity of the reveal (`CardFinish.rank`). */
  readonly rank: number;
  /** Start face down (for a reveal). */
  readonly faceDown?: boolean;
}

export interface CardViewerHandle {
  readonly stats: Readonly<StageStats>;
  /** Turns the card over. */
  flip(): void;
  /** Plays the reveal from face down. Resolves when the card has settled. */
  reveal(): Promise<void>;
  /** Follows the phone's orientation (call after the iOS permission is granted). */
  enableGyro(): void;
  dispose(): void;
}

interface Tween {
  readonly start: number;
  readonly duration: number;
  readonly run: (t: number) => void;
}

const MAX_TILT = 0.34;

export function mountCardViewer(
  canvas: HTMLCanvasElement,
  sources: Card3DSources,
  options: CardViewerOptions,
): CardViewerHandle {
  const stage = Stage.mount(canvas, { fov: 30, ...options });
  const { scene, camera } = stage;
  const reduced = prefersReducedMotion();
  const k = clamp01(options.rank / 7);
  camera.position.set(0, 0, 8.4);
  camera.lookAt(0, 0, 0);
  const post = stage.postSettings;
  post.exposure = 1;
  // Mostly flat artwork: keep the design's colours, let the filmic curve tame only the highlights.
  post.filmic = 0.3;
  // Bloom only on real highlights (sparks, flash, glitter): a haze would grey the dark cards.
  const REST_BLOOM = 0.35;
  post.bloom = REST_BLOOM;
  post.bloomThreshold = 1.35;
  post.vignette = 0.5;

  const glowColour = new THREE.Color(sources.finish.glow);
  const backdropUniforms = {
    uTime: { value: 0 },
    uTint: { value: glowColour.clone() },
    uPower: { value: 0.25 },
    uRes: { value: new THREE.Vector2(1, 1) },
  };
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: BACKDROP_VS,
      fragmentShader: BACKDROP_FS,
      uniforms: backdropUniforms,
      depthWrite: false,
      depthTest: false,
    }),
  );
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -1;
  scene.add(backdrop);

  const card = new Card3D(sources, Math.min(8, stage.renderer.capabilities.getMaxAnisotropy()));
  const pivot = new THREE.Group();
  pivot.add(card.group);
  scene.add(pivot);
  const sparks = new Sparks(Math.round(420 * stage.profile.particles));
  scene.add(sparks.points);

  // Pose: the flip (rotation y) and the tilt follow springs; drag adds to the flip.
  let face = options.faceDown ? 1 : 0; // 0 = front, 1 = back
  const turn = new Spring(face * Math.PI, 90, 15);
  const tiltX = new Spring(0, 70, 13);
  const tiltY = new Spring(0, 70, 13);
  let dragOffset = 0;
  let depth = 0;
  let scale = 1;
  let shiver = 0;
  let lastPointer = -10;
  let gyro: { beta: number; gamma: number } | null = null;
  let gyroBase: { beta: number; gamma: number } | null = null;
  const tweens: Tween[] = [];
  let now = 0;
  let revealing = false;

  const fit = (): void => {
    // The card fills about 80 % of the height (and of the width in a narrow window).
    const visibleH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const visibleW = visibleH * camera.aspect;
    const s = Math.min(1, (visibleH * 0.8) / CARD3D_HEIGHT, (visibleW * 0.84) / 2.5);
    pivot.scale.setScalar(s);
  };

  const play = (duration: number, run: (t: number) => void, delay = 0): void => {
    tweens.push({ start: now + delay, duration: Math.max(0.001, duration), run });
  };

  const flip = (): void => {
    turn.target += Math.PI;
    face = 1 - face;
  };

  // Pointer: hover tilts, drag turns, tap flips.
  let down: { x: number; y: number; t: number } | null = null;
  const onMove = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    tiltY.target = nx * MAX_TILT;
    tiltX.target = ny * MAX_TILT;
    lastPointer = now;
    if (down) dragOffset = ((event.clientX - down.x) / rect.width) * Math.PI * 1.4;
  };
  const onDown = (event: PointerEvent): void => {
    if (revealing) return;
    down = { x: event.clientX, y: event.clientY, t: now };
    canvas.setPointerCapture(event.pointerId);
  };
  const onUp = (event: PointerEvent): void => {
    if (!down) return;
    const tap =
      Math.hypot(event.clientX - down.x, event.clientY - down.y) < 6 && now - down.t < 0.3;
    const dragged = dragOffset;
    const base = Math.round(turn.target / Math.PI);
    // The drag is kept in the pose, then the spring finishes the turn (or brings the card back).
    turn.value += dragged;
    dragOffset = 0;
    down = null;
    if (tap || Math.abs(dragged) > Math.PI / 3) {
      turn.target = (base + (dragged < 0 ? -1 : 1)) * Math.PI;
      face = ((Math.round(turn.target / Math.PI) % 2) + 2) % 2;
    }
  };
  const onLeave = (): void => {
    tiltX.target = 0;
    tiltY.target = 0;
  };
  const onOrientation = (event: DeviceOrientationEvent): void => {
    if (event.beta === null || event.gamma === null) return;
    gyro = { beta: event.beta, gamma: event.gamma };
    gyroBase ??= gyro;
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.style.touchAction = 'none';

  const unsubscribe = stage.onFrame((frame) => {
    const dt = frame.wallDt;
    now = frame.time;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i] as Tween;
      if (now < tw.start) continue;
      const t = clamp01((now - tw.start) / tw.duration);
      tw.run(t);
      if (t >= 1) tweens.splice(i, 1);
    }

    if (gyro && gyroBase && now - lastPointer > 1) {
      // Held in the hand: tilt relative to the pose when the viewer started, slowly re-centred.
      tiltX.target = THREE.MathUtils.clamp((gyro.beta - gyroBase.beta) / 40, -1, 1) * MAX_TILT;
      tiltY.target = THREE.MathUtils.clamp((gyro.gamma - gyroBase.gamma) / 40, -1, 1) * MAX_TILT;
      gyroBase.beta += (gyro.beta - gyroBase.beta) * Math.min(1, dt * 0.15);
      gyroBase.gamma += (gyro.gamma - gyroBase.gamma) * Math.min(1, dt * 0.15);
    } else if (now - lastPointer > 2.5 && !reduced) {
      // Left alone, the card breathes and turns a little to catch the light.
      tiltX.target = Math.sin(now * 0.7) * 0.08;
      tiltY.target = Math.sin(now * 0.53 + 1) * 0.16;
    }
    turn.step(dt);
    tiltX.step(dt);
    tiltY.step(dt);

    const bob = reduced ? 0 : Math.sin(now * 1.1) * 0.03;
    card.group.position.set(0, bob, depth);
    card.group.rotation.set(
      tiltX.value + (shiver ? (Math.random() - 0.5) * shiver : 0),
      turn.value + dragOffset + tiltY.value,
      shiver ? (Math.random() - 0.5) * shiver * 0.6 : 0,
      'ZXY',
    );
    card.group.scale.setScalar(scale);
    card.update(now);
    sparks.update(dt);
    sparks.scale = canvas.height;
    backdropUniforms.uTime.value = now;
    backdropUniforms.uRes.value.set(canvas.width, canvas.height);
    post.flash = Math.max(0, post.flash - dt * 2.2);
    post.bloom = REST_BLOOM + (post.bloom - REST_BLOOM) * Math.exp(-1.6 * dt);
    post.shock.w = Math.max(0, post.shock.w - dt * 1.4);
    if (post.shock.w > 0) post.shock.z += dt * 0.9;
    fit();
  });

  const reveal = (): Promise<void> =>
    new Promise((resolve) => {
      if (revealing) return resolve();
      revealing = true;
      tweens.length = 0;
      face = 1;
      turn.value = turn.target = Math.PI;
      card.glow = 0;
      card.flash = 0;
      card.sweep = -3;
      card.dim = 0.35;
      depth = -2.2;
      scale = 1;
      backdropUniforms.uPower.value = 0.1;

      // 1. Build-up: the card comes forward face down, its frame glowing more and more.
      const build = reduced ? 0.5 : 0.9 + 1.3 * k;
      play(build, (t) => {
        const e = ease.cubicOut(t);
        depth = -2.2 * (1 - e);
        card.dim = 0.35 * (1 - e);
        const pulse = 0.5 + 0.5 * Math.sin(t * t * 40);
        card.glow = e * (0.35 + 0.9 * k) * (0.7 + 0.3 * pulse);
        backdropUniforms.uPower.value = 0.1 + e * (0.25 + 0.5 * k);
        shiver = reduced ? 0 : t * t * 0.05 * k;
      });
      if (!reduced && k >= 0.5) {
        // Rare cards: the ground trembles before they turn.
        play(0.01, () => stage.shake.add(0.25 + 0.35 * k), build * 0.7);
      }

      // 2. Turn: a quick flip with a flash, a light sweep, sparks for the rarest.
      const turnAt = build;
      play(
        0.55,
        (t) => {
          shiver = 0;
          const e = ease.backOut(1.4)(t);
          turn.value = turn.target = Math.PI * (1 - e);
          scale = 1 + Math.sin(Math.PI * t) * (0.08 + 0.1 * k);
          if (t > 0.45 && face === 1) {
            face = 0;
            card.flash = 0.35 + 0.5 * k;
            post.flash = 0.25 + 0.7 * k;
            post.bloom = REST_BLOOM + 0.6 + 1.2 * k;
            post.flashColor.copy(glowColour).lerp(new THREE.Color(1, 1, 1), 0.5);
            if (!reduced && k >= 0.6) {
              post.shock.set(0.5, 0.5, 0.02, 0.8 * k);
              sparks.burst(
                Math.round((120 + 260 * k) * stage.profile.particles),
                glowColour,
                4 + 3 * k,
              );
            } else if (k >= 0.25) {
              sparks.burst(Math.round(60 * stage.profile.particles), glowColour, 3);
            }
          }
        },
        turnAt,
      );
      play(0.9, (t) => (card.sweep = -1 + 4.5 * ease.quadOut(t)), turnAt + 0.3);
      play(
        1.4,
        (t) => {
          card.flash = (0.35 + 0.5 * k) * (1 - ease.quadOut(Math.min(1, t * 2.5)));
          card.glow = (0.35 + 0.9 * k) * (1 - t) + 0.12 * k * t;
          backdropUniforms.uPower.value = 0.1 + (0.35 + 0.5 * k) * (1 - 0.4 * t);
        },
        turnAt + 0.28,
      );
      play(
        0.01,
        () => {
          revealing = false;
          resolve();
        },
        turnAt + 1.7,
      );
    });

  if (options.faceDown) void reveal();

  return {
    stats: stage.stats,
    flip: () => {
      if (!revealing) flip();
    },
    reveal,
    enableGyro: () => {
      window.addEventListener('deviceorientation', onOrientation);
    },
    dispose: () => {
      unsubscribe();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('deviceorientation', onOrientation);
      card.dispose();
      sparks.dispose();
      stage.dispose();
    },
  };
}
