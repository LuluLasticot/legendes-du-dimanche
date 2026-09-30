// Pack opening (GDD §12.4, D-036): tear the foil along the dotted line, the cards come out, the
// pack's best card gets its reveal — a full "walkout" for the great ones (the floodlights switch
// on one by one, the league, the club's crest, the position, then the card in a halo), a short
// one for the good ones, a joke now and then for the small ones — then the eleven others are
// dealt face down and turned over one by one. Every duration and intensity is a setting.
//
// Imperative scene (mount → handle → dispose). What the player reads (the clues, the buttons)
// is drawn by React from the steps this scene announces.

import * as THREE from 'three';
import { PackAudio } from '../audio/pack-audio.ts';
import {
  Card3D,
  CARD3D_HEIGHT,
  CARD3D_WIDTH,
  TextureCache,
  type Card3DSources,
} from '../cards/card3d.ts';
import { Flare, Particles, Rays } from '../cards/fx.ts';
import { Pack3D, PACK3D_HEIGHT, PACK3D_WIDTH, type Pack3DSources } from '../cards/pack3d.ts';
import { BACKDROP_FS, BACKDROP_VS } from '../cards/shaders.ts';
import { prefersReducedMotion } from '../core/device.ts';
import { clamp01, ease, Spring, type Ease } from '../core/easing.ts';
import { Stage, type StageOptions, type StageStats } from '../core/stage.ts';

export interface PackCardAssets extends Card3DSources {
  /** 0 (bronze common) to 7 (top promo). */
  readonly rank: number;
}

export interface PackOpeningAssets {
  readonly pack: Pack3DSources;
  /** The twelve cards, least valuable first: the last one is the best. */
  readonly cards: readonly PackCardAssets[];
  /** Crest of the best card's club (shown during its walkout). */
  readonly crest: TexImageSource;
  /** The club's colours, for the confetti of the promos. */
  readonly clubColours: readonly [string, string];
}

/** Settings of the feel, exposed in /lab/pack. */
export interface PackTuning {
  /** Lowest rank that gets the full walkout (4 = gold). */
  walkoutRank: number;
  /** Seconds between two floodlights switching on. */
  lightsGap: number;
  /** Seconds each clue stays on screen. */
  clueHold: number;
  /** Seconds of tension before the impact. */
  tension: number;
  /** Multipliers of the flash, the shake and the particles. */
  flash: number;
  shake: number;
  particles: number;
  /** Chance of a joke when the best card is a bronze one. */
  gagChance: number;
  /** Global speed (1 = normal). */
  speed: number;
}

export const DEFAULT_PACK_TUNING: PackTuning = {
  walkoutRank: 4,
  lightsGap: 0.42,
  clueHold: 1.25,
  tension: 1.5,
  flash: 1,
  shake: 1,
  particles: 1,
  gagChance: 0.4,
  speed: 1,
};

export type PackStep =
  | 'idle'
  | 'tearing'
  | 'opening'
  | 'lights'
  | 'league'
  | 'club'
  | 'position'
  | 'tension'
  | 'impact'
  | 'gag-flicker'
  | 'gag-dog'
  | 'hero'
  | 'grid'
  | 'summary';

export interface PackOpeningOptions extends StageOptions {
  readonly tuning?: PackTuning;
  /** A new step of the opening (React shows the matching clue or buttons). */
  readonly onStep?: (step: PackStep) => void;
  /** A card of the grid has been turned over (its index in the pack). */
  readonly onReveal?: (index: number) => void;
  /** Random source for the jokes (the lab's; cosmetic only). */
  readonly random?: () => number;
}

export interface PackOpeningHandle {
  readonly stats: Readonly<StageStats>;
  /** Tears the pack by itself (button, keyboard). */
  tear(): void;
  /** Fast-forwards to the best card. */
  skip(): void;
  /** From the best card to the grid of the others. */
  next(): void;
  /** Turns every card of the grid over, one after the other. */
  revealAll(): void;
  setMuted(muted: boolean): void;
  setTuning(tuning: PackTuning): void;
  dispose(): void;
}

interface Tween {
  readonly start: number;
  readonly duration: number;
  readonly run: (t: number) => void;
  readonly init?: () => void;
  readonly done: () => void;
  begun: boolean;
}

interface Pose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  s: number;
}

class Actor {
  readonly pose: Pose = { x: 0, y: 0, z: 0, rx: 0, ry: Math.PI, rz: 0, s: 1 };
  readonly tiltX = new Spring(0, 70, 13);
  readonly tiltY = new Spring(0, 70, 13);
  /** Wobble amplitude (0 = still), for a card on display. */
  autoTilt = 0;
  shiver = 0;
  faceUp = false;
  private readonly phase: number;

  constructor(
    readonly card: Card3D,
    readonly rank: number,
    readonly index: number,
  ) {
    this.phase = index * 1.37;
  }

  apply(now: number, dt: number): void {
    this.tiltX.step(dt);
    this.tiltY.step(dt);
    const p = this.pose;
    const t = now + this.phase;
    const a = this.autoTilt;
    const jitter = (): number => (this.shiver ? (Math.random() - 0.5) * this.shiver : 0);
    const g = this.card.group;
    g.position.set(p.x, p.y + Math.sin(t * 1.1) * 0.03 * a, p.z);
    g.rotation.set(
      p.rx + this.tiltX.value + Math.sin(t * 0.72) * 0.08 * a + jitter(),
      p.ry + this.tiltY.value + Math.sin(t * 0.61 + 2) * 0.22 * a,
      p.rz + jitter() * 0.6,
      'ZXY',
    );
    g.scale.setScalar(p.s);
    this.card.update(now);
  }
}

const TEAR_ZONE = 0.12;

/** Haptics, only after the player has touched the page (browsers refuse them before). */
function vibrate(pattern: number | number[]): void {
  const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
  if (nav.userActivation && !nav.userActivation.hasBeenActive) return;
  nav.vibrate?.(pattern);
}

/** The keys of an object whose values are numbers (what a tween can animate). */
type NumericKeys<T> = { [P in keyof T]-?: T[P] extends number ? P : never }[keyof T];

export function mountPackOpening(
  canvas: HTMLCanvasElement,
  assets: PackOpeningAssets,
  options: PackOpeningOptions = {},
): PackOpeningHandle {
  const stage = Stage.mount(canvas, { fov: 32, ...options });
  const { scene, camera } = stage;
  const reduced = prefersReducedMotion();
  const random = options.random ?? Math.random;
  let tuning: PackTuning = { ...(options.tuning ?? DEFAULT_PACK_TUNING) };
  const audio = new PackAudio();
  const post = stage.postSettings;
  post.filmic = 0.3;
  post.exposure = 1;
  const REST_BLOOM = 0.4;
  post.bloom = REST_BLOOM;
  post.bloomThreshold = 1.3;
  post.vignette = 0.55;
  camera.position.set(0, 0, 11);
  camera.lookAt(0, 0, 0);

  // ─── Scene objects ────────────────────────────────────────────────────────────────────────
  const best = assets.cards[assets.cards.length - 1];
  if (!best) throw new Error('A pack holds at least one card');
  const bestColour = new THREE.Color(best.finish.glow);

  const backdropUniforms = {
    uTime: { value: 0 },
    uTint: { value: new THREE.Color(assets.pack.tint) },
    uPower: { value: 0.3 },
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
  backdrop.renderOrder = -2;
  scene.add(backdrop);

  const pack = new Pack3D(assets.pack);
  scene.add(pack.group);
  const packTilt = { x: new Spring(0, 60, 10), y: new Spring(0, 60, 10), z: new Spring(0, 60, 10) };
  const packPose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1, idle: 1 };

  const cache = new TextureCache(Math.min(8, stage.renderer.capabilities.getMaxAnisotropy()));
  const actors = assets.cards.map((c, i) => {
    const card = new Card3D(c, i === assets.cards.length - 1 ? 8 : 4, cache);
    card.group.visible = false;
    scene.add(card.group);
    return new Actor(card, c.rank, i);
  });
  const hero = actors[actors.length - 1] as Actor;
  const others = actors.slice(0, -1);

  const particleBudget = (): number =>
    stage.profile.particles * tuning.particles * (reduced ? 0.35 : 1);
  const particles = new Particles(3200);
  scene.add(particles.points);
  const heroRays = new Rays(16, 0);
  heroRays.mesh.position.z = -1.2;
  scene.add(heroRays.mesh);
  const packRays = new Rays(12, 0.9);
  scene.add(packRays.mesh);
  const flare = new Flare();
  scene.add(flare.mesh);
  const floodlights = [0, 1, 2, 3].map(() => {
    const light = new Flare();
    const beam = new Rays(9, 0.28);
    beam.colour.setRGB(1, 0.93, 0.78);
    scene.add(light.mesh, beam.mesh);
    return { light, beam };
  });
  const crestTexture = new THREE.Texture(assets.crest);
  crestTexture.colorSpace = THREE.SRGBColorSpace;
  crestTexture.needsUpdate = true;
  const crest = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.92),
    new THREE.MeshBasicMaterial({ map: crestTexture, transparent: true, depthWrite: false }),
  );
  crest.visible = false;
  crest.renderOrder = 15;
  scene.add(crest);

  // ─── Time: tweens and waits on the scene's clock (speed and skip scale it) ────────────────
  let now = 0;
  let boost = 1;
  let skipping = false;
  let disposed = false;
  const tweens: Tween[] = [];
  const tween = (
    duration: number,
    run: (t: number) => void,
    delay = 0,
    init?: () => void,
  ): Promise<void> =>
    new Promise((done) => {
      tweens.push({
        start: now + delay,
        duration: Math.max(0.001, duration),
        run,
        init,
        done,
        begun: false,
      });
    });
  const wait = (seconds: number): Promise<void> => tween(seconds, () => undefined);
  function to<T, K extends NumericKeys<T>>(
    target: T,
    props: { [P in K]?: number },
    duration: number,
    curve: Ease = ease.cubicInOut,
    delay = 0,
  ): Promise<void> {
    const values = target as unknown as Record<K, number>;
    const keys = Object.keys(props) as K[];
    const from = {} as Record<K, number>;
    return tween(
      duration,
      (t) => {
        const e = curve(t);
        for (const k of keys) values[k] = from[k] + ((props[k] as number) - from[k]) * e;
      },
      delay,
      () => {
        for (const k of keys) from[k] = values[k];
      },
    );
  }

  // ─── Layout ───────────────────────────────────────────────────────────────────────────────
  const view = { h: 1, w: 1 };
  const layout = (): void => {
    view.h = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    view.w = view.h * camera.aspect;
  };
  layout();
  const packScale = (): number =>
    Math.min((view.h * 0.66) / PACK3D_HEIGHT, (view.w * 0.72) / PACK3D_WIDTH);
  const heroScale = (): number =>
    Math.min((view.h * 0.66) / CARD3D_HEIGHT, (view.w * 0.78) / CARD3D_WIDTH);
  const grid = (): { cols: number; s: number; pos: (i: number) => { x: number; y: number } } => {
    const aspect = camera.aspect;
    const cols = aspect < 0.8 ? 3 : aspect < 1.45 ? 4 : 6;
    const rows = Math.ceil(actors.length / cols);
    // Room for the page's top bar and bottom buttons.
    const s = Math.min(
      (view.h * 0.74) / (rows * CARD3D_HEIGHT * 1.08),
      (view.w * 0.94) / (cols * CARD3D_WIDTH * 1.08),
    );
    const cw = CARD3D_WIDTH * s * 1.08;
    const ch = CARD3D_HEIGHT * s * 1.08;
    return {
      cols,
      s,
      pos: (i) => ({
        x: ((i % cols) - (cols - 1) / 2) * cw,
        y: ((rows - 1) / 2 - Math.floor(i / cols)) * ch + view.h * 0.01,
      }),
    };
  };

  // ─── Steps ────────────────────────────────────────────────────────────────────────────────
  let step: PackStep = 'idle';
  const announce = (next: PackStep): void => {
    step = next;
    options.onStep?.(next);
  };
  const sound = (play: () => void): void => {
    if (!skipping) play();
  };
  const shake = (amount: number): void => {
    if (!reduced) stage.shake.add(amount * tuning.shake);
  };
  const flash = (amount: number, colour: THREE.Color): void => {
    post.flashColor.copy(colour).lerp(new THREE.Color(1, 1, 1), 0.45);
    post.flash = Math.max(post.flash, amount * tuning.flash);
  };
  const burst = (
    x: number,
    y: number,
    z: number,
    colours: readonly THREE.Color[],
    count: number,
    speed: number,
    opts: { grav?: number; life?: number; size?: number; drag?: number } = {},
  ): void => {
    const n = Math.round(count * particleBudget());
    for (let i = 0; i < n; i++) {
      const a = random() * Math.PI * 2;
      const e = (random() - 0.5) * Math.PI;
      const v = speed * (0.25 + random() * 0.9);
      const c = colours[i % colours.length] as THREE.Color;
      const k = 1.4 + random() * 2.4;
      particles.emit({
        x,
        y,
        z,
        vx: Math.cos(a) * Math.cos(e) * v,
        vy: Math.sin(a) * Math.cos(e) * v,
        vz: Math.sin(e) * v * 0.6,
        c: [c.r * k, c.g * k, c.b * k],
        life: (opts.life ?? 1.6) * (0.5 + random()),
        drag: opts.drag ?? 1.6,
        grav: opts.grav ?? 1.2,
        s0: (opts.size ?? 0.09) * (0.6 + random()),
        s1: 0,
      });
    }
  };
  const rainbow = [0, 0.15, 0.3, 0.55, 0.75].map((h) => new THREE.Color().setHSL(h, 0.9, 0.6));
  const coloursOf = (rank: number, colour: THREE.Color): THREE.Color[] =>
    rank >= 7
      ? [colour, new THREE.Color(1, 0.85, 0.4), new THREE.Color(1, 1, 1)]
      : rank >= 5
        ? [colour, ...rainbow.slice(0, 2)]
        : [colour];

  // ─── Idle and tear ────────────────────────────────────────────────────────────────────────
  const placePack = (): void => {
    const s = packScale();
    packPose.s = s;
    packPose.y = view.h * 0.02;
  };
  placePack();
  packPose.y += view.h;
  void to(packPose, { y: view.h * 0.02 }, 0.9, ease.backOut(1.1));
  announce('idle');

  let pointer: {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    t: number;
    inZone: boolean;
  } | null = null;
  let hapticAcc = 0;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();

  /** The pointer in the pack's own coordinates: u across (0–1), v up (0–1). */
  const packUv = (clientX: number, clientY: number): { u: number; v: number } | null => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    pack.inner.updateWorldMatrix(true, false);
    const local = pack.inner.worldToLocal(hit.clone());
    return { u: local.x / PACK3D_WIDTH + 0.5, v: local.y / PACK3D_HEIGHT + 0.5 };
  };

  const completeTear = (): void => {
    if (pack.done) return;
    audio.tearStop();
    audio.rip();
    try {
      vibrate([12, 30, 20]);
    } catch {
      // Refused.
    }
    const vx = pointer ? pointer.vx : pack.tearDirection * 4;
    const vy = pointer ? pointer.vy : 2;
    pack.fling(vx * 0.6, vy * 0.6);
    void opening();
  };

  const tearFrame = (dt: number): void => {
    const du = pack.step(dt);
    if (!pack.started || pack.done) return;
    const speed = du / Math.max(dt, 1e-3);
    const front = pack.frontWorld(new THREE.Vector3());
    audio.tearUpdate(speed, front.x / (view.w / 2));
    pack.leakAmount +=
      (Math.min(1, pack.progress * 1.6) - pack.leakAmount) * (1 - Math.exp(-6 * dt));
    packTilt.z.target = pack.tearDirection * 0.05 * Math.min(1, pack.progress * 2);
    packTilt.y.target = pack.tearDirection * 0.1 * Math.sin(pack.progress * Math.PI);
    if (du > 0) {
      const n = Math.min(14, 1 + Math.floor(du * 420 * particleBudget()));
      for (let i = 0; i < n; i++) {
        const leak = random() < 0.35;
        const c = leak ? bestColour : new THREE.Color(assets.pack.tint);
        particles.emit({
          x: front.x,
          y: front.y,
          z: front.z + 0.1,
          vx: (random() - 0.5) * 1.4 - pack.tearDirection * 0.6,
          vy: 0.6 + random() * 2.2,
          vz: random() * 1.2,
          c: [c.r * 2.6, c.g * 2.6, c.b * 2.6],
          life: 0.5 + random() * 0.7,
          drag: 2.2,
          grav: 3.5,
          s0: 0.035 + random() * 0.05,
          s1: 0,
        });
      }
      hapticAcc += du;
      if (hapticAcc > 0.07) {
        hapticAcc = 0;
        try {
          vibrate(6);
        } catch {
          // Refused.
        }
      }
    }
    if (pack.progress >= 0.9) completeTear();
  };

  const onDown = (event: PointerEvent): void => {
    audio.unlock();
    if (step === 'idle') {
      const uv = packUv(event.clientX, event.clientY);
      const inZone =
        uv !== null &&
        uv.u > -0.05 &&
        uv.u < 1.05 &&
        Math.abs(uv.v - assets.pack.tearV) < TEAR_ZONE;
      pointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        vx: 0,
        vy: 0,
        t: now,
        inZone,
      };
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (step === 'hero') {
      handle.next();
      return;
    }
    if (step === 'grid') {
      const rect = canvas.getBoundingClientRect();
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(
        actors.flatMap((a) => a.card.pickable),
        false,
      );
      const first = hits[0];
      if (!first) return;
      const actor = actors.find((a) => a.card.pickable.includes(first.object));
      if (actor && !actor.faceUp) void revealInGrid(actor);
    }
  };
  const onMove = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    if (step === 'hero') {
      hero.tiltY.target = nx * 0.34;
      hero.tiltX.target = ny * 0.34;
    }
    if (!pointer || event.pointerId !== pointer.id) {
      if (step === 'idle' || step === 'tearing') {
        packTilt.x.target = ny * 0.12;
        packTilt.y.target = nx * 0.16;
      }
      return;
    }
    const dt = Math.max(1 / 240, now - pointer.t);
    const worldPerPx = view.h / rect.height;
    pointer.vx = ((event.clientX - pointer.x) * worldPerPx) / dt;
    pointer.vy = (-(event.clientY - pointer.y) * worldPerPx) / dt;
    const dx = event.clientX - pointer.x;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.t = now;
    const uv = packUv(event.clientX, event.clientY);
    if (!uv || !pointer.inZone) return;
    if (!pack.started && Math.abs(dx) > 1) {
      pack.startTear(dx > 0 ? 1 : -1);
      audio.tearStart();
      announce('tearing');
    }
    pack.pull(uv.u, uv.v - assets.pack.tearV);
  };
  const onUp = (): void => {
    pointer = null;
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.style.touchAction = 'none';

  // ─── Opening ──────────────────────────────────────────────────────────────────────────────
  const deck = { y: 0, z: -0.02, s: 0.92, visible: 0 };
  const opening = async (): Promise<void> => {
    announce('opening');
    pack.leakColour.copy(bestColour);
    void to(
      pack as unknown as Record<'leakAmount', number>,
      { leakAmount: 2.6 },
      0.22,
      ease.quadOut,
    );
    const top = pack.inner.localToWorld(
      new THREE.Vector3(0, (assets.pack.tearV - 0.5) * PACK3D_HEIGHT, 0.2),
    );
    packRays.mesh.position.set(top.x, top.y, 0.4);
    packRays.mesh.scale.setScalar(packPose.s);
    packRays.colour.copy(bestColour);
    void to(packRays, { intensity: 1.2 + 0.1 * best.rank }, 0.3, ease.quadOut);
    flash(0.14 + 0.03 * best.rank, bestColour);
    shake(0.3);
    audio.boom(0.55, 120, 40, 0.9);
    audio.shimmer(5, 0.05, 0.05, 3);
    for (let i = 0; i < 160 * particleBudget(); i++) {
      const u = random();
      const p = pack.inner.localToWorld(
        new THREE.Vector3(
          (u - 0.5) * PACK3D_WIDTH * 0.9,
          (assets.pack.tearV - 0.5) * PACK3D_HEIGHT,
          0.1,
        ),
      );
      const k = 1.5 + random() * 2.5;
      particles.emit({
        x: p.x,
        y: p.y,
        z: p.z,
        vx: (random() - 0.5) * 2,
        vy: 1.5 + random() * 4.5,
        vz: (random() - 0.3) * 1.5,
        c: [bestColour.r * k, bestColour.g * k, bestColour.b * k],
        life: 0.8 + random() * 1.2,
        drag: 1.6,
        grav: 1.4,
        s0: 0.05 + random() * 0.07,
        s1: 0,
      });
    }
    await wait(0.18);
    // The cards rise out of the pack while the pack falls away.
    audio.whoosh(0.9, 250, 2200, 0.22);
    deck.y = packPose.y;
    deck.s = packPose.s * 0.9;
    deck.visible = 1;
    void to(packPose, { idle: 0 }, 0.6);
    void to(
      packPose,
      { y: packPose.y - view.h * 1.1, rx: 0.3, rz: 0.2 * -pack.tearDirection },
      1.1,
      ease.cubicIn,
      0.35,
    );
    await to(deck, { y: packPose.y + PACK3D_HEIGHT * packPose.s * 0.62 }, 0.8, ease.cubicOut);
    void to(pack, { leakAmount: 0 }, 0.6);
    void to(packRays, { intensity: 0 }, 0.7);
    // The deck comes to the centre; the others step back, the best card takes the stage.
    await to(deck, { y: 0, z: 0.4, s: heroScale() * 0.8 }, 0.6, ease.cubicInOut);
    pack.group.visible = false;
    // From here each card moves on its own.
    deck.visible = 0;
    for (const a of others) {
      void to(a.pose, { y: -view.h, z: -1 }, 0.5, ease.cubicIn, 0.05 * a.index);
    }
    await wait(0.25);
    for (const a of others) a.card.group.visible = false;
    // The best card leaves the stage too: it comes back, face down, for the tension.
    await to(hero.pose, { z: -3, s: hero.pose.s * 0.6 }, 0.3, ease.cubicIn);
    hero.card.group.visible = false;
    if (best.rank >= tuning.walkoutRank) await walkout(true);
    else if (best.rank >= 2) await walkout(false);
    else await smallReveal();
  };

  // ─── The best card ────────────────────────────────────────────────────────────────────────
  const darken = async (amount: number): Promise<void> => {
    audio.droneStart();
    audio.startMurmur();
    void to(backdropUniforms.uPower, { value: 0.02 }, 0.6);
    void to(
      post,
      { vignette: 0.55 + 0.3 * amount, bars: (camera.aspect < 1 ? 0.06 : 0.085) * amount },
      0.7,
      ease.cubicInOut,
    );
    await wait(0.5);
  };

  const lightsOn = async (count: number): Promise<void> => {
    announce('lights');
    const spots = [-0.42, 0.42, -0.15, 0.15];
    for (let i = 0; i < count; i++) {
      const { light, beam } = floodlights[i] as { light: Flare; beam: Rays };
      const x = (spots[i] ?? 0) * view.w;
      // Below the page's top bar, a little lower on a phone held upright.
      const y = view.h * (camera.aspect < 1 ? 0.36 : 0.42);
      light.mesh.position.set(x, y, -0.5);
      light.colour.setRGB(1, 0.95, 0.85);
      beam.mesh.position.set(x, y, -1.5);
      beam.mesh.rotation.z = Math.PI + Math.atan2(x, y + view.h * 0.2) * -1;
      light.size = 1.6;
      sound(() => audio.floodlight(x / (view.w / 2)));
      void to(light, { intensity: 1.5 }, 0.08, ease.quadOut);
      void to(beam, { intensity: 0.55 }, 0.25, ease.quadOut);
      void to(backdropUniforms.uPower, { value: 0.06 + 0.07 * (i + 1) }, 0.3);
      shake(0.05);
      await wait(tuning.lightsGap);
    }
    sound(() => audio.whistle(0.55));
    await wait(0.35);
  };

  const lightsOff = (): void => {
    for (const { light, beam } of floodlights) {
      void to(light, { intensity: 0 }, 0.6);
      void to(beam, { intensity: 0.12 }, 0.8);
    }
  };

  const showCrest = async (): Promise<void> => {
    announce('club');
    crest.visible = true;
    crest.position.set(0, view.h * 0.08, 0.5);
    crest.scale.setScalar(0.01);
    flare.mesh.position.set(0, view.h * 0.08, 0.2);
    flare.colour.copy(bestColour).lerp(new THREE.Color(1, 1, 1), 0.4);
    flare.size = 0.5;
    void to(flare, { intensity: 1.1, size: 4 }, 0.5, ease.cubicOut);
    sound(() => {
      audio.boom(0.35, 80, 40, 0.8);
      audio.bell(880, 0.12, 1.6);
    });
    const s = Math.min(1.3, view.h * 0.2);
    await tween(0.7, (t) => {
      crest.scale.setScalar(Math.max(0.01, s * ease.backOut(1.6)(t)));
      crest.rotation.y = (1 - ease.cubicOut(t)) * Math.PI * 2;
    });
  };

  const hideCrest = async (): Promise<void> => {
    void to(flare, { intensity: 0.2, size: 2 }, 0.4);
    const s0 = crest.scale.x;
    await tween(0.35, (t) => {
      crest.scale.setScalar(Math.max(0.01, s0 * (1 - ease.cubicIn(t))));
    });
    crest.visible = false;
  };

  /** The card rises face down, trembling, pulled by the light: the tension before the turn. */
  const tension = async (seconds: number, strength: number): Promise<void> => {
    announce('tension');
    const s = heroScale();
    hero.card.group.visible = true;
    Object.assign(hero.pose, {
      x: 0,
      y: -view.h * 0.6,
      z: 0,
      rx: 0.2,
      ry: Math.PI,
      rz: 0,
      s: s * 0.9,
    });
    hero.card.glow = 0;
    hero.card.dim = 0.3;
    sound(() => {
      audio.riser(seconds, 0.3);
      audio.droneSwell(3000, seconds);
    });
    if (!reduced) void to(post, { zoomBlur: 0.45 * strength }, seconds, ease.quadIn);
    void to(flare, { intensity: 1.6 + strength, size: 3 + 3 * strength }, seconds, ease.cubicIn);
    flare.mesh.position.set(0, view.h * 0.02, -0.4);
    const converge = window.setInterval(() => {
      if (disposed || step !== 'tension') return;
      for (let i = 0; i < 8 * particleBudget(); i++) {
        const a = random() * Math.PI * 2;
        const r = view.h * (0.4 + random() * 0.3);
        const k = 1.4 + random() * 1.6;
        particles.emit({
          x: Math.cos(a) * r,
          y: Math.sin(a) * r,
          z: 0.4,
          vx: -Math.cos(a) * 2,
          vy: -Math.sin(a) * 2,
          c: [bestColour.r * k, bestColour.g * k, bestColour.b * k],
          life: 1.1,
          drag: 0.2,
          attract: 9 + 5 * strength,
          spin: 1.5 + 3 * strength,
          s0: 0.05,
          s1: 0.02,
        });
      }
    }, 30);
    await tween(seconds, (t) => {
      const e = ease.cubicOut(clamp01(t * 1.6));
      hero.pose.y = -view.h * 0.6 * (1 - e) + view.h * 0.02 * e;
      hero.pose.rx = 0.2 * (1 - e);
      hero.card.glow = (0.4 + 1.1 * strength) * ease.quadIn(t);
      hero.card.dim = 0.3 * (1 - t);
      hero.shiver = reduced ? 0 : t * t * 0.06 * strength;
    });
    window.clearInterval(converge);
    hero.shiver = 0;
    audio.droneStop(0.06);
  };

  /** The turn: flash, shockwave, sparks; confetti and fireworks for the promos. */
  const impact = async (strength: number): Promise<void> => {
    announce('impact');
    const rank = hero.rank;
    const s = heroScale();
    post.zoomBlur = 0;
    flare.intensity = 0;
    flash(1.2 + 2.6 * strength, bestColour);
    if (!reduced) {
      post.shock.set(0.5, 0.5, 0, 0.6 + 0.6 * strength);
      post.chromatic = 0.02 * strength;
    }
    shake(0.25 + 0.5 * strength);
    post.bloom = REST_BLOOM + 0.8 + 1.4 * strength;
    try {
      vibrate([30, 40, 70]);
    } catch {
      // Refused.
    }
    audio.impact(rank);
    burst(
      0,
      view.h * 0.02,
      0.6,
      coloursOf(rank, bestColour),
      180 + 340 * strength,
      4 + 3.5 * strength,
      { grav: 0.5, life: 2.2, drag: 1.2, size: 0.1 },
    );
    heroRays.colour.copy(bestColour);
    heroRays.prism = rank >= 7 ? 0.5 : rank >= 5 ? 0.25 : 0;
    heroRays.mesh.position.set(0, view.h * 0.02, -1.2);
    heroRays.mesh.scale.setScalar(Math.max(1, s * 1.2));
    heroRays.intensity = 1.8;
    void to(heroRays, { intensity: 0.3 + 0.25 * strength }, 1.8, ease.quadOut);
    hero.card.flash = 0.6;
    hero.card.glow = 1.6;
    hero.faceUp = true;
    const spins = rank >= 6 ? 2 : 1;
    void tween(1.05, (t) => {
      const e = ease.expoOut(t);
      hero.pose.ry = Math.PI * (1 + 2 * spins) * (1 - e);
      hero.pose.s = s * (1.3 - 0.3 * e);
      hero.pose.z = 0.6 * (1 - e) + 0.2 * e;
    });
    void to(hero.card, { glow: 0.14, flash: 0 }, 1.4, ease.quadOut);
    void tween(0.9, (t) => (hero.card.sweep = -1.2 + 4 * ease.quadInOut(t)), 0.5);
    void to(post, { bars: 0, vignette: 0.55 }, 1.2, ease.cubicInOut, 0.5);
    void to(backdropUniforms.uPower, { value: 0.35 + 0.25 * strength }, 1.2);
    backdropUniforms.uTint.value.copy(bestColour);
    if (rank >= 6) void celebrate();
    await wait(1.2);
  };

  const celebrate = async (): Promise<void> => {
    const [c1, c2] = assets.clubColours.map((c) => new THREE.Color(c)) as [
      THREE.Color,
      THREE.Color,
    ];
    // Confetti in the club's colours, falling slowly and fluttering.
    for (let i = 0; i < 260 * particleBudget(); i++) {
      const c = i % 2 ? c1 : c2;
      particles.emit({
        x: (random() - 0.5) * view.w,
        y: view.h * (0.55 + random() * 0.2),
        z: 0.8 + random(),
        vx: (random() - 0.5) * 1.2,
        vy: -random() * 0.5,
        vz: 0,
        c: [c.r * 1.3, c.g * 1.3, c.b * 1.3],
        life: 3 + random() * 1.5,
        drag: 1.2,
        grav: 1.1,
        s0: 0.07 + random() * 0.05,
        s1: 0.05,
      });
    }
    // Fireworks around the card.
    for (let k = 0; k < 6; k++) {
      await wait(0.22 + random() * 0.25);
      if (disposed) return;
      const x = (random() - 0.5) * view.w * 0.8;
      const y = view.h * (0.1 + random() * 0.3);
      const c = k % 2 ? bestColour : new THREE.Color().setHSL(random(), 0.9, 0.6);
      burst(x, y, -0.5, [c, new THREE.Color(1, 1, 1)], 90, 3.2, {
        grav: 1.6,
        life: 1.4,
        size: 0.07,
      });
      sound(() => audio.firework(x / (view.w / 2)));
    }
  };

  const walkout = async (full: boolean): Promise<void> => {
    const strength = clamp01((best.rank - 1) / 6);
    await darken(full ? 1 : 0.6);
    await lightsOn(full ? 4 : 2);
    if (full) {
      announce('league');
      sound(() => {
        audio.boom(0.35, 90, 40, 0.7);
        audio.bell(587.33, 0.12, 1.8);
      });
      await wait(tuning.clueHold);
    }
    await showCrest();
    await wait(tuning.clueHold * (full ? 1 : 0.7));
    if (full) {
      announce('position');
      sound(() => audio.bell(739.99, 0.12, 1.8));
      await wait(tuning.clueHold * 0.9);
    }
    await hideCrest();
    lightsOff();
    await tension(full ? tuning.tension : tuning.tension * 0.55, strength);
    skipping = false;
    boost = 1;
    await impact(strength);
    enterHero();
  };

  /** A bronze card: a quick turn — and now and then, the ground plays a joke first. */
  const smallReveal = async (): Promise<void> => {
    const joke = random() < tuning.gagChance ? (random() < 0.5 ? 'gag-flicker' : 'gag-dog') : null;
    if (joke === 'gag-flicker') {
      announce('gag-flicker');
      await darken(0.4);
      const { light } = floodlights[0] as { light: Flare; beam: Rays };
      light.mesh.position.set(0, view.h * 0.4, -0.5);
      light.size = 1.4;
      sound(() => audio.flicker());
      await tween(1.4, (t) => {
        light.intensity = Math.sin(t * 40 + Math.sin(t * 13) * 3) > 0.3 ? 1.2 * (1 - t) : 0;
      });
      light.intensity = 0;
      await wait(0.3);
    } else if (joke === 'gag-dog') {
      announce('gag-dog');
      await wait(1.6);
      sound(() => audio.metal(0.5));
      shake(0.08);
      await wait(0.7);
    }
    await tension(0.6, 0);
    await impact(0);
    enterHero();
  };

  const enterHero = (): void => {
    boost = 1;
    skipping = false;
    hero.autoTilt = 0.8;
    announce('hero');
  };

  // ─── The grid ─────────────────────────────────────────────────────────────────────────────
  const toGrid = async (): Promise<void> => {
    announce('grid');
    lightsOff();
    const g = grid();
    hero.autoTilt = 0;
    hero.tiltX.target = 0;
    hero.tiltY.target = 0;
    void to(heroRays, { intensity: 0 }, 0.6);
    void to(backdropUniforms.uPower, { value: 0.3 }, 0.8);
    const heroCell = g.pos(actors.length - 1);
    void to(
      hero.pose,
      { x: heroCell.x, y: heroCell.y, z: 0, s: g.s, rx: 0, ry: 0, rz: 0 },
      0.7,
      ease.cubicInOut,
    );
    hero.card.glow = 0.25;
    audio.whoosh(0.6, 1800, 300, 0.16);
    for (const a of others) {
      const cell = g.pos(a.index);
      a.card.group.visible = true;
      a.faceUp = false;
      Object.assign(a.pose, {
        x: cell.x,
        y: -view.h * 0.8,
        z: 0,
        rx: 0.3,
        ry: Math.PI,
        rz: (random() - 0.5) * 0.3,
        s: g.s,
      });
      void to(a.pose, { y: cell.y, rx: 0, rz: 0 }, 0.5, ease.cubicOut, 0.2 + a.index * 0.05);
    }
    await wait(0.9);
  };

  const revealInGrid = async (a: Actor): Promise<void> => {
    if (a.faceUp) return;
    a.faceUp = true;
    const s = a.pose.s;
    audio.flip(a.rank);
    void to(a.pose, { z: 0.6 }, 0.14, ease.quadOut);
    await tween(0.5, (t) => {
      const e = ease.cubicInOut(t);
      a.pose.ry = Math.PI * (1 - e) + (a.rank >= 3 ? Math.PI * 2 * (1 - e) : 0);
      a.pose.s = s * (1 + Math.sin(Math.PI * t) * 0.12);
    });
    void to(a.pose, { z: 0 }, 0.3);
    audio.reveal(a.rank);
    a.card.sweep = -1.2;
    void to(a.card, { sweep: 2.8 }, 0.8, ease.quadInOut);
    if (a.rank >= 1) {
      const colour = new THREE.Color(assets.cards[a.index]?.finish.glow ?? '#ffffff');
      burst(
        a.pose.x,
        a.pose.y,
        0.4,
        coloursOf(a.rank, colour),
        30 + 30 * a.rank,
        2 + 0.4 * a.rank,
        { grav: 0.8, life: 1 },
      );
      if (a.rank >= 3) flash(0.1 + 0.04 * a.rank, colour);
      a.card.glow = 0.3 + 0.1 * a.rank;
      void to(a.card, { glow: a.rank >= 3 ? 0.15 : 0 }, 1);
    }
    options.onReveal?.(a.index);
    if (actors.every((x) => x.faceUp)) announce('summary');
  };

  // ─── Frame ────────────────────────────────────────────────────────────────────────────────
  const unsubscribe = stage.onFrame((frame) => {
    const dt = frame.wallDt * tuning.speed * boost;
    now += dt;
    layout();
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i] as Tween;
      if (now < tw.start) continue;
      if (!tw.begun) {
        tw.begun = true;
        tw.init?.();
      }
      const t = clamp01((now - tw.start) / tw.duration);
      tw.run(t);
      if (t >= 1) {
        tweens.splice(i, 1);
        tw.done();
      }
    }
    if (step === 'idle' || step === 'tearing') tearFrame(dt);

    // Pack pose: idle float and the tilt of the tear.
    packTilt.x.step(dt);
    packTilt.y.step(dt);
    packTilt.z.step(dt);
    const w = packPose.idle;
    pack.group.position.set(packPose.x, packPose.y + Math.sin(now * 0.9) * 0.05 * w, packPose.z);
    pack.group.rotation.set(
      packPose.rx + Math.sin(now * 0.63) * 0.04 * w,
      packPose.ry + Math.sin(now * 0.47 + 1) * 0.07 * w,
      packPose.rz,
      'ZXY',
    );
    pack.group.scale.setScalar(packPose.s);
    pack.inner.rotation.set(packTilt.x.value, packTilt.y.value, packTilt.z.value);
    pack.gleam = ((now * 0.35) % 3) - 1;
    pack.update(now, dt);

    // The deck, while it comes out: cards stacked face down.
    if (deck.visible && step === 'opening') {
      for (const a of actors) {
        a.card.group.visible = true;
        const k = actors.length - 1 - a.index;
        Object.assign(a.pose, {
          x: 0,
          y: deck.y + k * 0.004,
          z: deck.z + (a.index - actors.length) * 0.006,
          rx: 0,
          ry: Math.PI,
          rz: (k % 3) * 0.004,
          s: deck.s,
        });
      }
    }
    for (const a of actors) a.apply(now, dt);

    particles.pixelScale = canvas.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    particles.update(dt);
    heroRays.update(now);
    packRays.update(now);
    flare.update(camera);
    for (const { light, beam } of floodlights) {
      light.update(camera);
      beam.update(now);
    }
    backdropUniforms.uTime.value = now;
    backdropUniforms.uRes.value.set(canvas.width, canvas.height);
    // A flash hits hard and fades fast (a white-out must not linger).
    post.flash = Math.max(0, post.flash * Math.exp(-5 * frame.wallDt) - frame.wallDt * 0.3);
    post.chromatic = Math.max(0, post.chromatic - frame.wallDt * 0.04);
    post.shock.w = Math.max(0, post.shock.w - frame.wallDt * 1.3);
    if (post.shock.w > 0) post.shock.z += frame.wallDt * 0.9;
    post.bloom = REST_BLOOM + (post.bloom - REST_BLOOM) * Math.exp(-1.6 * frame.wallDt);
  });

  const handle: PackOpeningHandle = {
    stats: stage.stats,
    tear: () => {
      if (step !== 'idle' || pack.started) return;
      audio.unlock();
      pack.startTear(1);
      audio.tearStart();
      announce('tearing');
      void tween(1.05, (t) => pack.pull(ease.quadInOut(t) * 1.02, Math.sin(t * 5) * 0.012));
    },
    skip: () => {
      if (
        step === 'hero' ||
        step === 'grid' ||
        step === 'summary' ||
        step === 'idle' ||
        step === 'tearing'
      )
        return;
      skipping = true;
      boost = 6;
    },
    next: () => {
      if (step === 'hero') void toGrid();
    },
    revealAll: () => {
      if (step !== 'grid') return;
      others
        .filter((a) => !a.faceUp)
        .forEach((a, k) => {
          void wait(k * 0.16).then(() => revealInGrid(a));
        });
    },
    setMuted: (muted) => audio.setEnabled(!muted),
    setTuning: (next) => {
      tuning = { ...next };
    },
    dispose: () => {
      disposed = true;
      unsubscribe();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      audio.tearStop();
      audio.droneStop();
      audio.stopMurmur();
      audio.dispose();
      for (const a of actors) a.card.dispose();
      cache.dispose();
      pack.dispose();
      particles.dispose();
      heroRays.dispose();
      packRays.dispose();
      flare.dispose();
      for (const { light, beam } of floodlights) {
        light.dispose();
        beam.dispose();
      }
      crestTexture.dispose();
      stage.dispose();
    },
  };
  return handle;
}
