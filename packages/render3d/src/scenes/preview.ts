// Render smoke test: night pitch, goal frame built from the engine dimensions, and shots solved
// by the engine flying on a loop (fixed-step simulation, interpolated display, hit-stop, shake
// and flash on goals). Validates the Stage ↔ engine coupling until the real key-moment scene.

import { moments, physics, Rng } from '@legendes/engine';
import * as THREE from 'three';
import { Stage, type StageOptions, type StageStats } from '../core/stage.ts';
import { buildNightPitch } from './environment.ts';

const { BALL, PITCH, DEFAULT_PHYSICS, kickedBall, startFlight, stepFlight } = physics;

export interface PreviewHandle {
  readonly stats: Readonly<StageStats>;
  /** Last flight outcome, for the HUD. */
  readonly lastOutcome: string | null;
  dispose(): void;
}

const SHOOTER: moments.ShotAttributes = { shotPower: 82, curve: 78, finishing: 80, composure: 75 };

/** Mounts the preview scene on a canvas. */
export function mountPreviewScene(
  canvas: HTMLCanvasElement,
  options: StageOptions = {},
): PreviewHandle {
  const stage = Stage.mount(canvas, { fov: 42, ...options });
  const { scene, camera } = stage;
  buildNightPitch(scene, stage.profile.shadowMapSize);

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
