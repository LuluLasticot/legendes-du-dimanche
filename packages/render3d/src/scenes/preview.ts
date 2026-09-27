// Render smoke test: night pitch, goal frame built from the engine dimensions, and shots solved
// by the engine flying on a loop (fixed-step simulation, interpolated display, hit-stop, shake
// and flash on goals). Validates the Stage ↔ engine coupling until the real key-moment scene.

import { moments, physics, Rng } from '@legendes/engine';
import * as THREE from 'three';
import { Stage, type StageOptions, type StageStats } from '../core/stage.ts';

const { BALL, GOAL, PITCH, DEFAULT_PHYSICS, kickedBall, startFlight, stepFlight } = physics;

export interface PreviewHandle {
  readonly stats: Readonly<StageStats>;
  /** Last flight outcome, for the HUD. */
  readonly lastOutcome: string | null;
  dispose(): void;
}

function pitchTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#1d4a2c' : '#22552f';
      ctx.fillRect(i * 32, 0, 32, 32);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildPitch(scene: THREE.Scene): void {
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH.length + 10, PITCH.width + 10),
    new THREE.MeshStandardMaterial({ map: pitchTexture(), roughness: 0.95 }),
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  scene.add(pitch);

  // Chalk lines of the attacked half: goal line, penalty area, six-yard box, penalty spot.
  const x0 = PITCH.goalLineX;
  const y = 0.01;
  const pts: number[] = [];
  const seg = (ax: number, az: number, bx: number, bz: number): void => {
    pts.push(ax, y, az, bx, y, bz);
  };
  seg(x0, -PITCH.width / 2, x0, PITCH.width / 2);
  seg(0, -PITCH.width / 2, 0, PITCH.width / 2);
  for (const [depth, half] of [
    [16.5, 20.16],
    [5.5, 9.16],
  ] as const) {
    seg(x0, -half, x0 - depth, -half);
    seg(x0 - depth, -half, x0 - depth, half);
    seg(x0 - depth, half, x0, half);
  }
  seg(x0 - 11.05, -0.05, x0 - 10.95, 0.05);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xf4f1e8 })));
}

function buildGoal(scene: THREE.Scene): void {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.4,
    emissive: 0x222222,
  });
  const r = GOAL.postRadius;
  const postZ = GOAL.width / 2 + r;
  const barY = GOAL.height + r;
  const postGeometry = new THREE.CylinderGeometry(r, r, barY + r, 16);
  for (const z of [-postZ, postZ]) {
    const post = new THREE.Mesh(postGeometry, material);
    post.position.set(PITCH.goalLineX, (barY + r) / 2, z);
    post.castShadow = true;
    scene.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 2 * postZ, 16), material);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(PITCH.goalLineX, barY, 0);
  bar.castShadow = true;
  scene.add(bar);

  const net = new THREE.Mesh(
    new THREE.BoxGeometry(GOAL.netDepth, GOAL.height, GOAL.width),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.18,
    }),
  );
  net.position.set(PITCH.goalLineX + GOAL.netDepth / 2, GOAL.height / 2, 0);
  scene.add(net);
}

function buildLights(scene: THREE.Scene, shadowMapSize: number): void {
  scene.background = new THREE.Color(0x05100c);
  scene.fog = new THREE.Fog(0x05100c, 60, 160);
  scene.add(new THREE.HemisphereLight(0x9fb8ff, 0x0b2012, 0.55));
  const key = new THREE.DirectionalLight(0xfff1d6, 2.2);
  key.position.set(30, 40, -25);
  key.target.position.set(PITCH.goalLineX - 15, 0, 0);
  key.castShadow = shadowMapSize > 0;
  key.shadow.mapSize.set(shadowMapSize || 512, shadowMapSize || 512);
  key.shadow.camera.left = -30;
  key.shadow.camera.right = 30;
  key.shadow.camera.top = 30;
  key.shadow.camera.bottom = -30;
  scene.add(key, key.target);

  // Floodlight heads: HDR emissive quads, they are what the bloom catches.
  const headMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.4, 4.2) });
  const mastMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2f2c, roughness: 0.8 });
  for (const [x, z, h] of [
    [PITCH.goalLineX + 28, -22, 14],
    [PITCH.goalLineX + 28, 22, 14],
    [PITCH.goalLineX + 6, -PITCH.width / 2 - 6, 22],
    [PITCH.goalLineX + 6, PITCH.width / 2 + 6, 22],
  ] as const) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, h, 8), mastMaterial);
    mast.position.set(x, h / 2, z);
    const head = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.6), headMaterial);
    head.position.set(x, h + 0.5, z);
    head.lookAt(PITCH.goalLineX - 20, 0, 0);
    scene.add(mast, head);
  }
}

const SHOOTER: moments.ShotAttributes = { shotPower: 82, curve: 78, finishing: 80, composure: 75 };

/** Mounts the preview scene on a canvas. */
export function mountPreviewScene(
  canvas: HTMLCanvasElement,
  options: StageOptions = {},
): PreviewHandle {
  const stage = Stage.mount(canvas, { fov: 42, ...options });
  const { scene, camera } = stage;
  buildPitch(scene);
  buildGoal(scene);
  buildLights(scene, stage.profile.shadowMapSize);

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL.radius, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, emissive: 0x333333 }),
  );
  ball.castShadow = true;
  scene.add(ball);

  const rng = Rng.create('preview');
  const profile = moments.shooterProfile(SHOOTER, {
    weakFoot: false,
    weakFootStars: 3,
    pressure: 0.2,
  });
  const context = { params: DEFAULT_PHYSICS, surface: 'grass' as const, rng: null };
  let shotIndex = 0;
  let from = physics.v3(0, 0, 0);
  let flight = startFlight(physics.restingBall(0, 0));
  let previous = flight.ball;
  let restTicks = 0;
  let lastOutcome: string | null = null;

  const newShot = (): void => {
    const shotRng = rng.fork('shot', shotIndex++);
    from = physics.v3(PITCH.goalLineX - shotRng.range(14, 26), BALL.radius, shotRng.range(-12, 12));
    const intent: moments.ShotIntent = {
      target: physics.v3(PITCH.goalLineX, shotRng.range(0.4, 2.1), shotRng.range(-3.2, 3.2)),
      power: shotRng.range(0.7, 1),
      bulge: shotRng.range(-1, 1),
      lob: false,
    };
    const solution = moments.solveShot(from, intent, profile, DEFAULT_PHYSICS, 'grass');
    const struck = moments.applyExecutionError(solution, profile, shotRng.fork('execution'));
    flight = startFlight(kickedBall(from, struck.velocity, struck.spin));
    previous = flight.ball;
    restTicks = 0;
    stage.clock.reset();
  };
  newShot();

  const unsubscribe = stage.onFrame((frame) => {
    for (let i = 0; i < frame.ticks; i++) {
      previous = flight.ball;
      const next = stepFlight(flight, context);
      flight = next.state;
      for (const event of next.events) {
        if (event.type === 'outcome') lastOutcome = event.outcome;
        if (event.type === 'outcome' && event.outcome === 'goal') {
          stage.clock.hitStop(0.06);
          stage.shake.add(0.45);
          stage.postSettings.flash = 0.35;
        }
        if (event.type === 'frame') stage.shake.add(0.3);
      }
      if (flight.outcome !== null && ++restTicks > 150) newShot();
    }

    const a = frame.alpha;
    const p0 = previous.pos;
    const p1 = flight.ball.pos;
    ball.position.set(p0.x + (p1.x - p0.x) * a, p0.y + (p1.y - p0.y) * a, p0.z + (p1.z - p0.z) * a);

    // Behind the shooter, slightly raised, looking at the goal.
    camera.position.set(from.x - 7, 2.2, from.z * 0.85);
    camera.lookAt(PITCH.goalLineX, 1.2, from.z * 0.25);

    const post = stage.postSettings;
    post.flash = Math.max(0, post.flash - frame.wallDt * 2.5);
  });

  return {
    stats: stage.stats,
    get lastOutcome() {
      return lastOutcome;
    },
    dispose() {
      unsubscribe();
      stage.dispose();
    },
  };
}
