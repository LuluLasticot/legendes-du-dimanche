// Ball sandbox (/lab/ball): trace a shot with the finger or the mouse, see the predicted path
// while tracing, strike with the shooter's execution error, watch it fly, replay it in slow
// motion by re-simulation. Every feel parameter comes from SandboxSettings (tuning panel).

import { moments, physics, Rng, TICK_DT, TICK_RATE } from '@legendes/engine';
import * as THREE from 'three';
import { Stage, type StageOptions, type StageStats } from '../core/stage.ts';
import { Stadium } from '../stadium/stadium.ts';
import { KEEPER_KIT, OPPONENT_KIT, PlayerFigure } from '../players/player-figure.ts';
import {
  toDefenderSetups,
  toDefenderTuning,
  toKeeperAttributes,
  toKeeperTuning,
  toPhysicsParams,
  toShotTuning,
  type SandboxSettings,
} from './sandbox-settings.ts';

const { BALL, PITCH, kickedBall, restingBall, simulateFlight } = physics;

export interface ShotReport {
  readonly index: number;
  readonly replay: boolean;
  /** Gesture power in [0, 1] and bow in [−1, 1]. */
  readonly power: number;
  readonly bulge: number;
  readonly speedKmh: number;
  /** Sidespin, revolutions per second (+ = curls left). */
  readonly spinRps: number;
  /** Angle between the ideal strike and the executed one, degrees. */
  readonly errorDeg: number;
  readonly solverMiss: number;
  readonly solverIterations: number;
  readonly outcome: moments.MomentOutcome | null;
  /** Last touch: caught or parried by the keeper, or blocked by a defender. */
  readonly save: 'catch' | 'parry' | 'block' | null;
}

export interface SandboxHandle {
  readonly stats: Readonly<StageStats>;
  setSettings(settings: SandboxSettings): void;
  /** Replays the last shot (same initial state, same seed) in slow motion. */
  replay(): void;
  /** Puts the ball back on its spot. */
  reset(): void;
  /** Current trace (viewport-height units) for the 2D overlay, or null when there is none. */
  onGesture(callback: (points: readonly moments.GesturePoint[] | null) => void): () => void;
  onShot(callback: (report: ShotReport) => void): () => void;
  dispose(): void;
}

type Phase = 'aiming' | 'tracing' | 'flying';

interface StoredShot {
  readonly initial: physics.BallState;
  readonly momentSeed: number;
  readonly report: ShotReport;
}

const MAX_LINE_POINTS = 1200;
/** Seconds the result stays on screen before the ball goes back to its spot. */
const RESULT_HOLD = 1.6;

function makeLine(color: number, opacity: number): THREE.Line {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(MAX_LINE_POINTS * 3), 3),
  );
  geometry.setDrawRange(0, 0);
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
  line.frustumCulled = false;
  return line;
}

function setLine(line: THREE.Line, points: readonly physics.BallState[], step = 1): void {
  const attribute = line.geometry.getAttribute('position') as THREE.BufferAttribute;
  const array = attribute.array as Float32Array;
  let n = 0;
  for (let i = 0; i < points.length && n < MAX_LINE_POINTS; i += step) {
    const p = (points[i] as physics.BallState).pos;
    array[n * 3] = p.x;
    array[n * 3 + 1] = p.y;
    array[n * 3 + 2] = p.z;
    n++;
  }
  attribute.needsUpdate = true;
  line.geometry.setDrawRange(0, n);
}

function length3(v: physics.Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function mountBallSandbox(
  canvas: HTMLCanvasElement,
  initialSettings: SandboxSettings,
  options: StageOptions = {},
): SandboxHandle {
  const stage = Stage.mount(canvas, { fov: 50, ...options });
  const { scene, camera } = stage;
  const stadium = new Stadium(scene, {
    surface: initialSettings.pitch.surface,
    profile: stage.profile,
  });
  /** Simulated seconds since mount: drives the net animation (slow motion slows it too). */
  let simTime = 0;

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL.radius, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, emissive: 0x333333 }),
  );
  ball.castShadow = true;
  scene.add(ball);

  const prediction = makeLine(0xffd166, 0.9);
  const trail = makeLine(0xf4f1e8, 0.35);
  scene.add(prediction, trail);

  const targetMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.16, 0.22, 32),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(3, 2.4, 1),
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  targetMarker.rotation.y = Math.PI / 2;
  targetMarker.visible = false;
  scene.add(targetMarker);

  const velocityArrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(),
    1,
    0x7fd4ff,
  );
  const spinArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(),
    1,
    0xff7fbf,
  );
  velocityArrow.visible = false;
  spinArrow.visible = false;
  scene.add(velocityArrow, spinArrow);

  let settings = initialSettings;
  let params = toPhysicsParams(settings);
  let tuning = toShotTuning(settings);
  let profile = moments.shooterProfile(settings.shooter, settings.shooter, tuning);
  let spot = physics.v3(0, 0, 0);

  const keeperFigure = new PlayerFigure(KEEPER_KIT);
  scene.add(keeperFigure.group);
  const defenderFigures: PlayerFigure[] = [];
  /** One figure per defender of the current setup (rebuilt when the count changes). */
  const syncDefenderFigures = (count: number): void => {
    while (defenderFigures.length > count) {
      const figure = defenderFigures.pop();
      if (figure) scene.remove(figure.group);
    }
    while (defenderFigures.length < count) {
      const figure = new PlayerFigure(
        OPPONENT_KIT,
        defenderFigures.length % 2 === 0 ? 0x8d5a3b : 0xd8a47f,
      );
      scene.add(figure.group);
      defenderFigures.push(figure);
    }
  };

  let phase: Phase = 'aiming';
  /** Moment for a ball at rest (keeper set, nothing flies) until a shot is taken. */
  const restingMoment = (
    at: physics.BallState,
  ): { context: moments.ShotMomentContext; state: moments.ShotMomentState } =>
    moments.startShotMoment({
      ball: at,
      physics: params,
      surface: settings.pitch.surface,
      keeper: settings.keeper.enabled
        ? { attributes: toKeeperAttributes(settings), tuning: toKeeperTuning(settings) }
        : null,
      defenders: toDefenderSetups(settings, at.pos),
      defenderTuning: toDefenderTuning(settings),
      seed: 0,
    });
  let { context: momentContext, state: moment } = restingMoment(restingBall(0, 0));
  let previousMoment = moment;
  let heldAfterOutcome = 0;
  let replaying = false;
  let shotIndex = 0;
  let lastShot: StoredShot | null = null;
  let currentReport: ShotReport | null = null;
  const samples: physics.BallState[] = [];

  const gestureListeners = new Set<(points: readonly moments.GesturePoint[] | null) => void>();
  const shotListeners = new Set<(report: ShotReport) => void>();
  let points: moments.GesturePoint[] = [];
  let gestureStart = 0;
  let predictionDirty = false;
  let pointerId: number | null = null;

  const raycaster = new THREE.Raycaster();
  const goalPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), PITCH.goalLineX);
  const hit = new THREE.Vector3();

  const emitGesture = (): void => {
    for (const listener of gestureListeners) listener(points.length > 0 ? points : null);
  };
  const emitShot = (report: ShotReport): void => {
    for (const listener of shotListeners) listener(report);
  };

  const placeCamera = (): void => {
    const goalCentre = new THREE.Vector3(PITCH.goalLineX, 0, 0);
    const toGoal = new THREE.Vector3(goalCentre.x - spot.x, 0, goalCentre.z - spot.z).normalize();
    // Behind and above the ball: the ball sits in the lower third, the whole goal is visible.
    camera.position.set(spot.x - toGoal.x * 4.5, 1.9, spot.z - toGoal.z * 4.5);
    camera.lookAt(PITCH.goalLineX, 0.2, spot.z * 0.35);
    // Raycasts (gesture → target) must not depend on a frame having been rendered.
    camera.updateMatrixWorld();
  };

  const placeBall = (): void => {
    spot = physics.v3(PITCH.goalLineX - settings.spot.distance, BALL.radius, settings.spot.offset);
    ({ context: momentContext, state: moment } = restingMoment(restingBall(spot.x, spot.z)));
    previousMoment = moment;
    keeperFigure.group.visible = settings.keeper.enabled;
    syncDefenderFigures(moment.defenders.length);
    ball.position.set(spot.x, spot.y, spot.z);
    phase = 'aiming';
    replaying = false;
    stage.clock.setTimeScale(settings.debug.timeScale);
    stage.clock.reset();
    velocityArrow.visible = false;
    spinArrow.visible = false;
    placeCamera();
  };

  /** Shot intent from the current trace, or null if the trace is not a gesture yet. */
  const currentIntent = (): {
    intent: moments.ShotIntent;
    features: moments.GestureFeatures;
  } | null => {
    const features = moments.analyzeGesture(points, settings.gesture);
    const last = points[points.length - 1];
    if (!features || !last) return null;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((last.u * rect.height) / rect.width) * 2 - 1, -last.v * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.ray.direction.x <= 1e-3 || !raycaster.ray.intersectPlane(goalPlane, hit))
      return null;
    const target = physics.v3(
      PITCH.goalLineX,
      THREE.MathUtils.clamp(hit.y, 0.12, 6),
      THREE.MathUtils.clamp(hit.z, -14, 14),
    );
    return {
      features,
      intent: { target, power: features.power, bulge: features.bulge, lob: settings.shot.lob },
    };
  };

  const updatePrediction = (): void => {
    const current = currentIntent();
    if (!current || !settings.debug.prediction) {
      prediction.geometry.setDrawRange(0, 0);
      targetMarker.visible = false;
      return;
    }
    const solution = moments.solveShot(
      spot,
      current.intent,
      profile,
      params,
      settings.pitch.surface,
      { tuning },
    );
    const predicted = simulateFlight(
      kickedBall(spot, solution.velocity, solution.spin),
      {
        params,
        surface: settings.pitch.surface,
        rng: null,
      },
      { maxTicks: 480 },
    );
    setLine(prediction, predicted.samples, 2);
    targetMarker.visible = true;
    targetMarker.position.set(
      PITCH.goalLineX - 0.02,
      current.intent.target.y,
      current.intent.target.z,
    );
  };

  const launch = (
    initial: physics.BallState,
    momentSeed: number,
    report: ShotReport,
    replay: boolean,
  ): void => {
    ({ context: momentContext, state: moment } = moments.startShotMoment({
      ball: initial,
      physics: params,
      surface: settings.pitch.surface,
      keeper: settings.keeper.enabled
        ? { attributes: toKeeperAttributes(settings), tuning: toKeeperTuning(settings) }
        : null,
      defenders: toDefenderSetups(settings, initial.pos),
      defenderTuning: toDefenderTuning(settings),
      seed: momentSeed,
    }));
    previousMoment = moment;
    samples.length = 0;
    samples.push(initial);
    heldAfterOutcome = 0;
    replaying = replay;
    phase = 'flying';
    currentReport = report;
    stage.clock.reset();
    stage.clock.setTimeScale(replay ? settings.debug.replayScale : settings.debug.timeScale);

    const v = initial.vel;
    const speed = length3(v);
    velocityArrow.visible = settings.debug.vectors;
    velocityArrow.position.set(initial.pos.x, initial.pos.y, initial.pos.z);
    velocityArrow.setDirection(new THREE.Vector3(v.x, v.y, v.z).normalize());
    velocityArrow.setLength(Math.max(0.3, speed * 0.12), 0.25, 0.12);
    const w = initial.spin;
    const spin = length3(w);
    spinArrow.visible = settings.debug.vectors && spin > 1e-3;
    if (spin > 1e-3) {
      spinArrow.position.set(initial.pos.x, initial.pos.y, initial.pos.z);
      spinArrow.setDirection(new THREE.Vector3(w.x, w.y, w.z).normalize());
      spinArrow.setLength(Math.max(0.3, spin * 0.02), 0.2, 0.1);
    }
    emitShot(report);
  };

  const shoot = (): void => {
    const current = currentIntent();
    points = [];
    emitGesture();
    prediction.geometry.setDrawRange(0, 0);
    targetMarker.visible = false;
    if (!current) {
      phase = 'aiming';
      return;
    }
    const index = shotIndex++;
    const shotRng = Rng.create(settings.debug.seed).fork('shot', index);
    const solution = moments.solveShot(
      spot,
      current.intent,
      profile,
      params,
      settings.pitch.surface,
      { tuning },
    );
    const struck = moments.applyExecutionError(
      solution,
      profile,
      shotRng.fork('execution'),
      tuning,
    );
    const ideal = new THREE.Vector3(solution.velocity.x, solution.velocity.y, solution.velocity.z);
    const actual = new THREE.Vector3(struck.velocity.x, struck.velocity.y, struck.velocity.z);
    const report: ShotReport = {
      index,
      replay: false,
      power: current.features.power,
      bulge: current.features.bulge,
      speedKmh: actual.length() * 3.6,
      spinRps: struck.spin.y / (2 * Math.PI),
      errorDeg: THREE.MathUtils.radToDeg(ideal.angleTo(actual)),
      solverMiss: solution.miss,
      solverIterations: solution.iterations,
      outcome: null,
      save: null,
    };
    const initial = kickedBall(spot, struck.velocity, struck.spin);
    const momentSeed = shotRng.fork('moment').nextU32();
    lastShot = { initial, momentSeed, report };
    launch(initial, momentSeed, report, false);
  };

  // ─── Input ──────────────────────────────────────────────────────────────────
  const toPoint = (event: PointerEvent): moments.GesturePoint => {
    const rect = canvas.getBoundingClientRect();
    return {
      u: (event.clientX - rect.left) / rect.height,
      v: (event.clientY - rect.top) / rect.height,
      tick: Math.round(((event.timeStamp - gestureStart) / 1000) * TICK_RATE),
    };
  };
  const onPointerDown = (event: PointerEvent): void => {
    if (phase !== 'aiming' || pointerId !== null) return;
    pointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    gestureStart = event.timeStamp;
    points = [toPoint(event)];
    phase = 'tracing';
    emitGesture();
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (phase !== 'tracing' || event.pointerId !== pointerId) return;
    const events =
      typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
    for (const e of events.length > 0 ? events : [event]) points.push(toPoint(e));
    predictionDirty = true;
    emitGesture();
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    if (phase === 'tracing') {
      points.push(toPoint(event));
      shoot();
    }
  };
  const onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    points = [];
    phase = 'aiming';
    prediction.geometry.setDrawRange(0, 0);
    targetMarker.visible = false;
    emitGesture();
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);

  // ─── Loop ───────────────────────────────────────────────────────────────────
  const unsubscribe = stage.onFrame((frame) => {
    if (phase === 'tracing' && predictionDirty) {
      predictionDirty = false;
      updatePrediction();
    }

    if (phase === 'flying') {
      for (let i = 0; i < frame.ticks; i++) {
        previousMoment = moment;
        const next = moments.stepShotMoment(moment, momentContext);
        moment = next.state;
        samples.push(moment.flight.ball);
        for (const event of next.events) {
          if (event.type === 'save' && currentReport) {
            currentReport = { ...currentReport, save: event.kind, replay: replaying };
            emitShot(currentReport);
            stage.shake.add(Math.min(0.35, event.speed * 0.012));
          }
          if (event.type === 'block' && currentReport) {
            currentReport = { ...currentReport, save: 'block', replay: replaying };
            emitShot(currentReport);
            stage.shake.add(Math.min(0.3, event.speed * 0.01));
          }
          if (event.type === 'frame') stage.shake.add(Math.min(0.5, event.speed * 0.02));
          if (event.type === 'net') {
            stage.shake.add(Math.min(0.2, event.speed * 0.01));
            stadium.netImpact(event.pos, event.speed, simTime + (i + 1) * TICK_DT);
          }
        }
        if (currentReport && moment.outcome !== null && currentReport.outcome !== moment.outcome) {
          currentReport = { ...currentReport, outcome: moment.outcome, replay: replaying };
          if (!replaying && lastShot) lastShot = { ...lastShot, report: currentReport };
          emitShot(currentReport);
          if (moment.outcome === 'goal') {
            stage.clock.hitStop(0.07);
            stage.shake.add(0.45);
            stage.postSettings.flash = 0.3;
          }
        }
      }
      if (settings.debug.trail) setLine(trail, samples, 2);
      if (moment.outcome !== null) {
        heldAfterOutcome += frame.simDt;
        if (heldAfterOutcome > RESULT_HOLD * (replaying ? settings.debug.replayScale : 1))
          placeBall();
      }
    }

    const a = frame.alpha;
    const p0 = previousMoment.flight.ball.pos;
    const p1 = moment.flight.ball.pos;
    ball.position.set(p0.x + (p1.x - p0.x) * a, p0.y + (p1.y - p0.y) * a, p0.z + (p1.z - p0.z) * a);
    if (phase === 'flying') {
      // Ball spin, for the eye only.
      const w = moment.flight.ball.spin;
      ball.rotation.x += w.x * frame.simDt;
      ball.rotation.y += w.y * frame.simDt;
      ball.rotation.z += w.z * frame.simDt;
    }
    for (let i = 0; i < defenderFigures.length; i++) {
      const now = moment.defenders[i];
      const before = previousMoment.defenders[i] ?? now;
      if (now && before) (defenderFigures[i] as PlayerFigure).update(before, now, a);
    }
    if (moment.keeper && previousMoment.keeper)
      keeperFigure.update(previousMoment.keeper, moment.keeper, a);
    simTime += frame.simDt;
    stadium.update(simTime);
    stage.postSettings.flash = Math.max(0, stage.postSettings.flash - frame.wallDt * 2.5);
  });

  placeBall();

  return {
    stats: stage.stats,
    setSettings(next) {
      const spotChanged =
        next.spot.distance !== settings.spot.distance || next.spot.offset !== settings.spot.offset;
      settings = next;
      stadium.setSurface(settings.pitch.surface);
      params = toPhysicsParams(settings);
      tuning = toShotTuning(settings);
      profile = moments.shooterProfile(settings.shooter, settings.shooter, tuning);
      trail.visible = settings.debug.trail;
      if (!settings.debug.prediction) prediction.geometry.setDrawRange(0, 0);
      if (phase === 'flying' && !replaying) stage.clock.setTimeScale(settings.debug.timeScale);
      if (phase === 'aiming') placeBall();
      else if (spotChanged) trail.geometry.setDrawRange(0, 0);
    },
    replay() {
      if (!lastShot || phase === 'tracing') return;
      launch(
        lastShot.initial,
        lastShot.momentSeed,
        { ...lastShot.report, replay: true, outcome: null, save: null },
        true,
      );
    },
    reset() {
      points = [];
      emitGesture();
      prediction.geometry.setDrawRange(0, 0);
      targetMarker.visible = false;
      trail.geometry.setDrawRange(0, 0);
      placeBall();
    },
    onGesture(callback) {
      gestureListeners.add(callback);
      return () => gestureListeners.delete(callback);
    },
    onShot(callback) {
      shotListeners.add(callback);
      return () => shotListeners.delete(callback);
    },
    dispose() {
      unsubscribe();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      gestureListeners.clear();
      shotListeners.clear();
      stadium.dispose();
      stage.dispose();
    },
  };
}
