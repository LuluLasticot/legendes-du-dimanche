// Kit viewer (/lab/kits): a club's players in their home, away and goalkeeper kits, side by side
// in a studio, turned by a drag. It is where the kit shader is tuned (`KitShape`). Without the
// real character asset, the stand-in mannequin wears the kits.

import * as THREE from 'three';
import { BACKDROP_FS, BACKDROP_VS } from '../cards/shaders.ts';
import { Spring } from '../core/easing.ts';
import { Stage, type StageOptions, type StageStats } from '../core/stage.ts';
import { Character } from '../players/character.ts';
import { loadCharacterAsset, type CharacterAsset } from '../players/character-asset.ts';
import { setKitShape, type CharacterLook, type KitShape } from '../players/kit-material.ts';
import { createMannequinAsset } from '../players/mannequin.ts';

export interface KitViewerOptions extends StageOptions {
  /** Base URL of the converted character asset (player.glb + player.meta.json). */
  readonly characterAssetsUrl?: string;
  /** Skip the real asset and dress the mannequin (tests, comparisons). */
  readonly mannequin?: boolean;
}

export interface KitViewerInfo {
  /** True with the real character, false with the stand-in mannequin. */
  readonly real: boolean;
  /** Clips the character can play. */
  readonly clips: readonly string[];
}

export interface KitViewerHandle {
  readonly stats: Readonly<StageStats>;
  /** Who stands in the studio, left to right (one to four players). */
  setLooks(looks: readonly CharacterLook[]): void;
  setShape(shape: Readonly<KitShape>): void;
  /** Loops a clip on every player (unknown names are ignored). */
  setClip(name: string): void;
  /** Turns the players to show their front (0) or their back (π). */
  turnTo(yaw: number): void;
  onReady(callback: (info: KitViewerInfo) => void): void;
  dispose(): void;
}

/** Distance between two players: closer on a phone held upright. */
const spacing = (aspect: number): number => (aspect < 1 ? 0.78 : 1.05);

export function mountKitViewer(
  canvas: HTMLCanvasElement,
  options: KitViewerOptions = {},
): KitViewerHandle {
  const stage = Stage.mount(canvas, { fov: 30, ...options });
  const { scene, camera } = stage;
  const post = stage.postSettings;
  post.exposure = 1.05;
  post.filmic = 0.6;
  post.bloom = 0.2;
  post.bloomThreshold = 1.4;
  post.vignette = 0.45;

  const backdropUniforms = {
    uTime: { value: 0 },
    uTint: { value: new THREE.Color(0x9fd8b8) },
    uPower: { value: 0.35 },
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

  // Studio: a dark floor that takes the shadows, a key light, a cool fill and a rim.
  // The floor fades into the backdrop: no edge, whatever the framing.
  const fade = document.createElement('canvas');
  fade.width = fade.height = 128;
  const fadeContext = fade.getContext('2d');
  if (fadeContext) {
    const gradient = fadeContext.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.35, '#ffffff');
    gradient.addColorStop(1, '#000000');
    fadeContext.fillStyle = gradient;
    fadeContext.fillRect(0, 0, 128, 128);
  }
  const fadeTexture = new THREE.CanvasTexture(fade);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(7, 64),
    new THREE.MeshStandardMaterial({
      color: 0x0d1612,
      roughness: 0.9,
      alphaMap: fadeTexture,
      transparent: true,
      depthWrite: false,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x1a1410, 0.9));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
  key.position.set(2.5, 5, 4);
  key.castShadow = stage.profile.shadowMapSize > 0;
  key.shadow.mapSize.setScalar(Math.max(512, stage.profile.shadowMapSize));
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -1;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fd8ff, 2.2);
  rim.position.set(-3, 3, -4);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(-4, 2, 3);
  scene.add(fill);

  const turntable = new THREE.Group();
  scene.add(turntable);
  let asset: CharacterAsset | null = null;
  let looks: readonly CharacterLook[] = [];
  let clip = 'player_idle';
  const characters: Character[] = [];
  const readyCallbacks: ((info: KitViewerInfo) => void)[] = [];
  let info: KitViewerInfo | null = null;
  let disposed = false;

  const yaw = new Spring(0, 40, 12);
  let drag: { x: number; start: number } | null = null;
  let lastInput = -10;
  let now = 0;

  const frame = (): void => {
    const count = Math.max(1, looks.length);
    const width = (count - 1) * spacing(camera.aspect) + 0.9;
    // Fit the players' height (2 m) and the row's width in the view.
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const distH = 2.15 / 2 / Math.tan(vFov / 2);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const distW = width / 2 / Math.tan(hFov / 2);
    const distance = Math.max(distH, distW) + 0.6;
    camera.position.set(0, 1.15, distance);
    camera.lookAt(0, 0.98, 0);
    characters.forEach((character, i) => {
      character.root.position.x = (i - (characters.length - 1) / 2) * spacing(camera.aspect);
    });
  };

  const play = (character: Character, index: number): void => {
    const name = character.asset.clips.has(clip) ? clip : 'player_idle';
    const duration = character.asset.clips.get(name)?.duration ?? 1;
    character.play(name, { loop: true, fade: 0.2, startAt: ((index * 0.37) % 1) * duration });
  };

  const sync = (): void => {
    if (!asset) return;
    while (characters.length > looks.length) characters.pop()?.dispose();
    looks.forEach((look, i) => {
      let character = characters[i];
      if (!character) {
        character = new Character(asset!, look);
        turntable.add(character.root);
        characters.push(character);
        play(character, i);
      } else character.setKit(look);
      character.place({ x: (i - (looks.length - 1) / 2) * spacing(camera.aspect), y: 0, z: 0 }, 0);
    });
    frame();
  };

  const ready = (loaded: CharacterAsset, real: boolean): void => {
    if (disposed) return;
    asset = loaded;
    info = { real, clips: [...loaded.clips.keys()].sort() };
    sync();
    for (const callback of readyCallbacks) callback(info);
  };
  if (options.mannequin) ready(createMannequinAsset(), false);
  else {
    void loadCharacterAsset(options.characterAssetsUrl ?? '/assets/characters/').then((loaded) =>
      ready(loaded ?? createMannequinAsset(), loaded !== null),
    );
  }

  const onDown = (event: PointerEvent): void => {
    drag = { x: event.clientX, start: yaw.target };
    canvas.setPointerCapture(event.pointerId);
  };
  const onMove = (event: PointerEvent): void => {
    if (!drag) return;
    const rect = canvas.getBoundingClientRect();
    yaw.target = drag.start + ((event.clientX - drag.x) / rect.width) * Math.PI * 2;
    lastInput = now;
  };
  const onUp = (): void => {
    drag = null;
    lastInput = now;
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  const unsubscribe = stage.onFrame((f) => {
    now = f.time;
    const dt = f.wallDt;
    // Idle: a slow turn, so the back (number) shows too.
    if (!drag && now - lastInput > 4) yaw.target += dt * 0.35;
    yaw.step(Math.min(dt, 0.1));
    // Every player turns on the spot.
    for (const character of characters) {
      character.root.rotation.y = yaw.value;
      character.update(dt);
    }
    backdropUniforms.uTime.value = now;
    backdropUniforms.uRes.value.set(stage.stats.width, stage.stats.height);
    frame();
  });

  return {
    stats: stage.stats,
    setLooks(next) {
      looks = next.slice(0, 4);
      sync();
    },
    setShape(shape) {
      setKitShape(shape);
    },
    setClip(name) {
      clip = name;
      characters.forEach(play);
    },
    turnTo(target) {
      // Shortest way round to the asked side.
      const turns = Math.round((yaw.target - target) / (Math.PI * 2));
      yaw.target = target + turns * Math.PI * 2;
      lastInput = now;
    },
    onReady(callback) {
      if (info) callback(info);
      else readyCallbacks.push(callback);
    },
    dispose() {
      disposed = true;
      unsubscribe();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      for (const character of characters) character.dispose();
      characters.length = 0;
      fadeTexture.dispose();
      stage.dispose();
    },
  };
}
