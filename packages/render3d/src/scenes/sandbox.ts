// Ball sandbox (/lab/ball): the playable situations of the key moments. Trace a shot with the
// finger or the mouse (free shot, free kick), a pass then a first-time shot, a penalty with its
// power gauge, or keep goal and swipe the dive. Every strike is replayed by re-simulation. Every
// feel parameter comes from SandboxSettings (tuning panel).

import { moments, physics, Rng, TICK_DT, TICK_RATE } from '@legendes/engine';
import type { sim } from '@legendes/engine';
import * as THREE from 'three';
import {
  CameraDirector,
  REPLAY_ANGLES,
  type DirectorInput,
  type MomentView,
  type ReplayAngle,
  type ResultKind,
} from '../camera/director.ts';
import { MatchAudio } from '../audio/match-audio.ts';
import { Stage, type StageOptions, type StageStats } from '../core/stage.ts';
import { ImpactParticles, surfaceParticles } from '../fx/particles.ts';
import { BallTrail } from '../fx/trail.ts';
import { Stadium } from '../stadium/stadium.ts';
import { Character, type Kit } from '../players/character.ts';
import type { CharacterLook } from '../players/kit-material.ts';
import { loadCharacterAsset, type CharacterAsset } from '../players/character-asset.ts';
import { DefenderController, KeeperController, ShooterController } from '../players/controllers.ts';
import { PitchExtras } from '../players/extras.ts';
import { HOME_KIT, KEEPER_KIT, OPPONENT_KIT, PlayerFigure } from '../players/player-figure.ts';
import {
  keeperSlowMo,
  situationSpot,
  toDefenderSetups,
  toDefenderTuning,
  toKeeperSetup,
  toPhysicsParams,
  toShotTuning,
  type SandboxSettings,
} from './sandbox-settings.ts';

const { BALL, PITCH, kickedBall, restingBall, simulateFlight } = physics;

export type SandboxOutcome = moments.MomentOutcome | 'intercepted' | 'lost' | 'offside';

/** A club look, or two plain colours (the ball lab, which has no club). */
export type MomentLook = CharacterLook | Kit;

/**
 * Who wears what in a key moment (Phase 3, step 6). Players are dressed in order: the shooter
 * first, then the passer and the other teammates; defenders (wall, markers) in order; the
 * players standing around take the following ones.
 */
export interface MomentLooks {
  readonly attack: readonly MomentLook[];
  readonly defend: readonly MomentLook[];
  readonly keeper: MomentLook;
}

/** How a key moment played inside a match ended (fed back to the match simulation). */
export interface MomentResult {
  readonly outcome: sim.ShotOutcome;
  readonly report: ShotReport | null;
}

export interface ShotReport {
  readonly index: number;
  readonly situation: moments.Situation;
  readonly replay: boolean;
  /** Gesture power in [0, 1] (gauge for a penalty) and bow in [−1, 1]. */
  readonly power: number;
  readonly bulge: number;
  readonly speedKmh: number;
  /** Sidespin, revolutions per second (+ = curls left). */
  readonly spinRps: number;
  /** Angle between the ideal strike and the executed one, degrees. */
  readonly errorDeg: number;
  /** Technical difficulty of the strike (first time, over-hit penalty), [0, 1]. */
  readonly difficulty: number;
  readonly solverMiss: number;
  readonly solverIterations: number;
  readonly outcome: SandboxOutcome | null;
  /** Last touch: caught or parried by the keeper, or blocked by a defender. */
  readonly save: 'catch' | 'parry' | 'block' | null;
}

/** What the player is expected to do now (drives the on-screen hint). */
export type SandboxStep =
  | 'aim-shot'
  | 'aim-pass'
  | 'aim-first-time'
  | 'aim-penalty'
  | 'gauge'
  | 'keeper-ready'
  | 'keeper-dive'
  | 'offside'
  | 'aim-rebound'
  | 'playing';

export interface SandboxHandle {
  readonly stats: Readonly<StageStats>;
  setSettings(settings: SandboxSettings): void;
  /** Replays the last shot (same initial state, same seed, same dive) in slow motion. */
  replay(): void;
  /** Puts the ball back on its spot. */
  reset(): void;
  /** Current trace (viewport-height units) for the 2D overlay, or null when there is none. */
  onGesture(callback: (points: readonly moments.GesturePoint[] | null) => void): () => void;
  onShot(callback: (report: ShotReport) => void): () => void;
  onStep(callback: (step: SandboxStep) => void): () => void;
  /** Penalty power gauge in [0, 1] while it sweeps, null otherwise. */
  onGauge(callback: (value: number | null) => void): () => void;
  dispose(): void;
}

type Phase = 'aiming' | 'tracing' | 'gauge' | 'striking' | 'flying' | 'passing' | 'result';

/** How the strike starts: full run-up, the end of the swing only (first time), or no animation. */
type RunUp = 'full' | 'first-time';

interface StoredShot {
  readonly setup: moments.ShotMomentSetup;
  readonly runUp: RunUp;
  /** Receiver's feet for a first-time shot (to stand him there again in the replay). */
  readonly receiverFeet: physics.Vec3 | null;
  readonly report: ShotReport;
}

const MAX_LINE_POINTS = 1200;
const HOME_CHARACTER_KIT: Kit = { shirt: 0x0f5132, shorts: 0xf4f1e8 };
const KEEPER_CHARACTER_KIT: Kit = { shirt: 0xd4ff3a, shorts: 0x1b1f24 };
const OPPONENT_CHARACTER_KIT: Kit = { shirt: 0xc4302b, shorts: 0xf2f2ee };
/** Seconds the result stays on screen before the ball goes back to its spot. */
const RESULT_HOLD = 1.6;
/** Time scale while the player aims a first-time shot (bullet time). */
const BULLET_TIME = 0.04;
/** Last part of the swing played for a first-time shot, seconds. */
const FIRST_TIME_LEAD = 0.2;
const GOAL_CENTRE = { x: PITCH.goalLineX, y: 0, z: 0 };
/** Most teammates any pass layout offers. */
const layoutMaxReceivers = Math.max(...moments.PASS_LAYOUTS.map((l) => l.receivers.length));

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

/** What the renderer shows of the moment in progress (a pass or a shot). */
interface ShownState {
  readonly ball: physics.BallState;
  readonly keeper: moments.KeeperState | null;
  readonly defenders: readonly moments.DefenderState[];
  readonly tick: number;
}

export function mountBallSandbox(
  canvas: HTMLCanvasElement,
  initialSettings: SandboxSettings,
  options: StageOptions & {
    /** Base URL of the converted character asset (player.glb + player.meta.json). */
    characterAssetsUrl?: string;
    /**
     * Key moment of a match: the scene plays this one situation, then hands over the outcome
     * instead of resetting the ball (no automatic replay).
     */
    moment?: { onOutcome(result: MomentResult): void };
    /** The two teams' kits; without them, plain colours (attackers in green). */
    looks?: MomentLooks;
  } = {},
): SandboxHandle {
  const stage = Stage.mount(canvas, { fov: 50, ...options });
  const { scene, camera } = stage;
  const stadium = new Stadium(scene, {
    surface: initialSettings.pitch.surface,
    profile: stage.profile,
  });
  /** Simulated seconds since mount: drives the net animation (slow motion slows it too). */
  let simTime = 0;
  /** The kits of this moment (the ball lab: the player's side in green, whatever he plays). */
  const looks = (): MomentLooks => {
    if (options.looks) return options.looks;
    const keeperSituation = settings.situation === 'keeper';
    return {
      attack: [keeperSituation ? OPPONENT_CHARACTER_KIT : HOME_CHARACTER_KIT],
      defend: [keeperSituation ? HOME_CHARACTER_KIT : OPPONENT_CHARACTER_KIT],
      keeper: KEEPER_CHARACTER_KIT,
    };
  };
  const pick = (list: readonly MomentLook[], index: number): MomentLook =>
    list[index % Math.max(1, list.length)] ?? HOME_CHARACTER_KIT;

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL.radius, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, emissive: 0x333333 }),
  );
  ball.castShadow = true;
  scene.add(ball);

  // ─── Juice ──────────────────────────────────────────────────────────────────
  const ballTrail = new BallTrail(64);
  const particles = new ImpactParticles(Math.round(900 * stage.profile.particles));
  scene.add(ballTrail.mesh, particles.points);
  const audio = new MatchAudio();
  /** Seeded source for particle bursts: a replay shows the same bursts. */
  let fxRng = Rng.create(0);
  const applyJuiceSettings = (): void => {
    ballTrail.length = settings.juice.trailLength;
    ballTrail.width = settings.juice.trailWidth;
    ballTrail.mesh.visible = settings.juice.trail;
    particles.amount = settings.juice.particles ? settings.juice.particleAmount : 0;
    audio.setEnabled(settings.audio.enabled);
    audio.setVolumes({
      master: settings.audio.master,
      effects: settings.audio.effects,
      crowd: settings.audio.crowd,
    });
  };
  const panOf = (z: number): number => THREE.MathUtils.clamp((z - camera.position.z) / 12, -1, 1);
  const confetti = (): void => {
    if (!settings.juice.confetti) return;
    for (let i = 0; i < 6; i++) {
      particles.emit(
        'confetti',
        { x: PITCH.goalLineX + 4.5, y: 1.2, z: -9 + i * 3.6 },
        22,
        fxRng,
        { x: -0.6, y: 1, z: 0 },
        0.7,
      );
    }
  };

  /** The stand reacts, voice and body. */
  const cheer = (kind: 'goal' | 'ooh' | 'dismay'): void => {
    audio.crowdReaction(kind === 'goal' ? 'goal' : 'ooh');
    stadium.crowdReaction(kind);
  };

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
  let spot = physics.v3(0, 0, 0);

  const keeperFigure = new PlayerFigure(KEEPER_KIT);
  scene.add(keeperFigure.group);
  // Greybox stand-ins for the teammates of a pass (only if the character asset does not load).
  const receiverFigures = [0x8d5a3b, 0xd8a47f, 0x6b4a33].map((skin) => {
    const figure = new PlayerFigure(HOME_KIT, skin);
    scene.add(figure.group);
    return figure;
  });
  // The offside line and a ring under each teammate: green = onside, red = offside.
  const offsideLine = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, PITCH.width - 2),
    new THREE.MeshBasicMaterial({
      color: 0xffe066,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  offsideLine.rotation.x = -Math.PI / 2;
  offsideLine.position.y = 0.03;
  offsideLine.visible = false;
  scene.add(offsideLine);
  const offsideRings = [0, 1, 2].map(() => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.82, 28),
      new THREE.MeshBasicMaterial({
        color: 0x3ddc84,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.035;
    ring.visible = false;
    scene.add(ring);
    return ring;
  });
  /** X of the offside line for the pass being played, and who starts beyond it. */
  let offsideX = 0;
  let offsideFlags: boolean[] = [];
  const defenderFigures: PlayerFigure[] = [];
  // ─── Characters (converted Mixamo asset; greybox figures until / unless it loads) ───
  let characterAsset: CharacterAsset | null = null;
  /** The shooter: the receiver on a pass, the opponent when the player keeps goal. */
  let shooterCtrl: ShooterController | null = null;
  /** Receiver 0 of a pass, and the shooter of every other situation. */
  let homeShooter: ShooterController | null = null;
  /** The other teammates of a pass (receivers 1 and 2). */
  const teammateCtrls: ShooterController[] = [];
  const receiverCtrl = (index: number): ShooterController | null =>
    index === 0 ? homeShooter : (teammateCtrls[index - 1] ?? null);
  let passerCtrl: ShooterController | null = null;
  let keeperCtrl: KeeperController | null = null;
  const defenderCtrls: DefenderController[] = [];
  let extras: PitchExtras | null = null;
  let disposed = false;
  /** Shooter first, then the passer and the other receivers or runners; wall; keeper. */
  const dressPlayers = (): void => {
    const { attack, defend, keeper } = looks();
    homeShooter?.character.setKit(pick(attack, 0));
    passerCtrl?.character.setKit(pick(attack, 1));
    teammateCtrls.forEach((c, i) => c.character.setKit(pick(attack, 2 + i)));
    defenderCtrls.forEach((c, i) => c.character.setKit(pick(defend, i)));
    keeperCtrl?.character.setKit(keeper);
  };
  /** The rest of the 22 stand around the action, in the kits of the players who take part. */
  const placeExtras = (): void => {
    if (!extras) return;
    const situation = settings.situation;
    const busy: physics.Vec3[] = [spot, moment.keeper?.feet ?? spot];
    for (const d of moment.defenders) busy.push(d.feet);
    if (situation === 'pass') {
      const l = layout();
      busy.push(...l.receivers, ...l.markers);
    }
    busy.push(...moments.reboundRunners(situation, spot));
    const players = moments.backgroundPlayers(
      situation,
      spot,
      busy,
      stage.profile.extras,
      situation === 'pass' ? { offsideLine: offsideX } : {},
    );
    // After the shooter, passer and teammates (attack) and the wall or markers (defend).
    const { attack, defend } = looks();
    extras.set(players, spot, {
      attack: (i) => pick(attack, 2 + teammateCtrls.length + i),
      defend: (i) => pick(defend, moment.defenders.length + i),
    });
  };
  const syncDefenderCharacters = (count: number): void => {
    if (!characterAsset) return;
    while (defenderCtrls.length > count) defenderCtrls.pop()?.character.dispose();
    while (defenderCtrls.length < count) {
      const character = new Character(characterAsset, pick(looks().defend, defenderCtrls.length));
      scene.add(character.root);
      const controller = new DefenderController(character);
      controller.reset();
      defenderCtrls.push(controller);
    }
  };
  /** Seconds from take-off to the apex of a wall jump (engine jump height, same tuning). */
  const wallApexSeconds = (): number => {
    const d = settings.defenders;
    const h = d.jumpLow + (d.jumpHigh - d.jumpLow) * ((d.physical - 1) / 98);
    return Math.sqrt((2 * h) / 9.81);
  };

  const syncDefenderFigures = (count: number): void => {
    syncDefenderCharacters(count);
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
    for (const figure of defenderFigures) figure.group.visible = characterAsset === null;
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
      keeper: toKeeperSetup(settings),
      defenders: toDefenderSetups(settings, at.pos),
      defenderTuning: toDefenderTuning(settings),
      seed: 0,
    });
  let { context: momentContext, state: moment } = restingMoment(restingBall(0, 0));
  let previousMoment = moment;
  let heldAfterOutcome = 0;
  // Key moment of a match: the outcome is handed over once.
  let momentDone = false;
  let postHit = false;
  const finishMoment = (outcome: sim.ShotOutcome): void => {
    if (momentDone || !options.moment) return;
    momentDone = true;
    options.moment.onOutcome({ outcome, report: currentReport });
  };
  /** The shot's end, in the match simulation's terms. */
  const shotOutcome = (): sim.ShotOutcome => {
    const outcome = moment.outcome;
    if (outcome === 'goal') return 'goal';
    if (outcome === 'saved') return currentReport?.save === 'catch' ? 'save-catch' : 'save-parry';
    if (outcome === 'blocked') return 'block';
    // Second ball cleared by a defender: it was a save, or it came off the woodwork.
    if (outcome === 'cleared') return parried ? 'save-parry' : postHit ? 'post' : 'block';
    return postHit ? 'post' : 'miss';
  };
  /** The keeper parried the current shot (its second ball can be cleared). */
  let parried = false;
  /** The current shot is the follow-up of a second ball: there is no third. */
  let secondBall = false;
  /** Who follows up the current shot: the shooter, then his teammates (same order as the engine). */
  let followers: (ShooterController | null)[] = [];
  let replaying = false;
  let shotIndex = 0;
  let lastShot: StoredShot | null = null;
  let currentReport: ShotReport | null = null;
  const samples: physics.BallState[] = [];

  // Pass situation.
  let pass: {
    context: moments.PassMomentContext;
    state: moments.PassMomentState;
    previous: moments.PassMomentState;
  } | null = null;
  /** Pass received: the first-time shot is being aimed from there. */
  let reception: {
    ball: physics.BallState;
    keeper: moments.KeeperSetup | null;
    defenders: moments.DefenderSetup[];
    receiverFeet: physics.Vec3;
  } | null = null;
  /** Which moment the renderer shows. */
  let showing: 'moment' | 'pass' = 'moment';
  /** How the last pass ended, for the result screen and the outcome given to the match. */
  let passEnd: 'intercepted' | 'lost' | 'offside' | null = null;
  /** The pass the player is tracing (ground target), for the camera framing. */
  let passFocus: physics.Vec3 | null = null;

  // Keeper situation: the player's dive, filled by the swipe while the ball flies.
  let keeperCommands: moments.KeeperCommand[] = [];

  // Penalty gauge.
  let gauge: {
    intent: moments.ShotIntent;
    features: moments.GestureFeatures;
    elapsed: number;
    value: number;
  } | null = null;

  const gestureListeners = new Set<(points: readonly moments.GesturePoint[] | null) => void>();
  const shotListeners = new Set<(report: ShotReport) => void>();
  const stepListeners = new Set<(step: SandboxStep) => void>();
  const gaugeListeners = new Set<(value: number | null) => void>();
  let points: moments.GesturePoint[] = [];
  let gestureStart = 0;
  let predictionDirty = false;
  let pointerId: number | null = null;
  /** What the current trace means. */
  let tracing: 'shot' | 'pass' | 'dive' = 'shot';

  const raycaster = new THREE.Raycaster();
  const goalPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), PITCH.goalLineX);
  const divePlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), PITCH.goalLineX - 0.3);
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  const emitGesture = (): void => {
    for (const listener of gestureListeners) listener(points.length > 0 ? points : null);
  };
  const emitShot = (report: ShotReport): void => {
    for (const listener of shotListeners) listener(report);
  };
  let lastStep: SandboxStep | null = null;
  const currentStep = (): SandboxStep => {
    if (phase === 'gauge') return 'gauge';
    if (phase === 'result' && passEnd === 'offside') return 'offside';
    if (phase === 'aiming' || phase === 'tracing') {
      if (settings.situation === 'keeper') return 'keeper-ready';
      if (reception && secondBall) return 'aim-rebound';
      if (reception) return 'aim-first-time';
      if (settings.situation === 'pass') return 'aim-pass';
      if (settings.situation === 'penalty') return 'aim-penalty';
      return 'aim-shot';
    }
    if (
      settings.situation === 'keeper' &&
      !replaying &&
      keeperCommands.length === 0 &&
      (phase === 'striking' || (phase === 'flying' && moment.outcome === null))
    )
      return 'keeper-dive';
    return 'playing';
  };
  const emitStep = (): void => {
    const step = currentStep();
    if (step === lastStep) return;
    lastStep = step;
    for (const listener of stepListeners) listener(step);
  };
  const emitGauge = (value: number | null): void => {
    for (const listener of gaugeListeners) listener(value);
  };

  // ─── Camera director ────────────────────────────────────────────────────────
  const director = new CameraDirector(settings.camera);
  let replayAngle: ReplayAngle | null = null;
  let replayCount = 0;
  const ballPos = new THREE.Vector3();

  const resultKind = (): ResultKind => {
    if (phase === 'result') return 'blocked';
    const outcome = moment.outcome;
    if (outcome === null) return null;
    if (outcome === 'goal' || outcome === 'saved' || outcome === 'blocked') return outcome;
    return 'miss';
  };

  const view = (): MomentView => {
    if (settings.situation === 'keeper') return 'keeper';
    if (settings.situation === 'pass' && !reception && showing === 'pass') return 'pass';
    if (settings.situation === 'pass' && !reception && phase !== 'flying') return 'pass';
    return 'shooter';
  };

  const shown = (): { now: ShownState; before: ShownState } => {
    if (showing === 'pass' && pass) {
      const s = (p: moments.PassMomentState): ShownState => ({
        ball: p.flight.ball,
        keeper: p.keeper,
        defenders: p.defenders,
        tick: p.tick,
      });
      return { now: s(pass.state), before: s(pass.previous) };
    }
    const s = (m: moments.ShotMomentState): ShownState => ({
      ball: m.flight.ball,
      keeper: m.keeper,
      defenders: m.defenders,
      tick: m.tick,
    });
    return { now: s(moment), before: s(previousMoment) };
  };

  const directorPhase = (): DirectorInput['phase'] => {
    if (phase === 'result') return 'result';
    if (phase === 'passing') return 'flying';
    if (phase === 'flying') return moment.outcome !== null ? 'result' : 'flying';
    if (phase === 'striking' && (replaying || settings.situation === 'keeper')) return 'flying';
    return 'aiming';
  };

  /** Where the pass is going to be met: the teammate who gets there first. */
  const earliestMeet = (): physics.Vec3 | null => {
    let best: { tick: number; feet: physics.Vec3 } | null = null;
    for (const r of pass?.state.receivers ?? [])
      if (r.meet && (best === null || r.meet.tick < best.tick)) best = r.meet;
    return best?.feet ?? null;
  };

  const directorInput = (): DirectorInput => {
    const { now } = shown();
    return {
      phase: directorPhase(),
      replay: replaying ? replayAngle : null,
      ball: ballPos,
      ballVel: now.ball.vel,
      spot,
      goal: GOAL_CENTRE,
      keeper: now.keeper ? now.keeper.head : null,
      result: resultKind(),
      view: view(),
      aspect: camera.aspect,
      focus: earliestMeet() ?? passFocus ?? (settings.situation === 'pass' ? passZone() : null),
    };
  };

  /** Applies the director's pose to the camera (dt = real seconds). */
  const applyCamera = (dt: number): void => {
    const pose = director.update(dt, directorInput());
    camera.position.copy(pose.position);
    camera.lookAt(pose.target);
    if (Math.abs(camera.fov - pose.fov) > 1e-3) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
    // Raycasts (gesture → target) must not depend on a frame having been rendered.
    camera.updateMatrixWorld();
  };

  const applyEffects = (effects: { hitStop: number; shake: number; flash: number }): void => {
    if (effects.hitStop > 0) stage.clock.hitStop(effects.hitStop);
    if (effects.shake > 0) stage.shake.add(effects.shake);
    if (effects.flash > 0)
      stage.postSettings.flash = Math.max(stage.postSettings.flash, effects.flash);
  };

  const clearAim = (): void => {
    prediction.geometry.setDrawRange(0, 0);
    targetMarker.visible = false;
  };

  const layout = (): moments.PassLayout => moments.passLayout(settings.situations.passLayout);
  /** Where passes are played to, framed before the pass: between the runner and the box. */
  const passZone = (): physics.Vec3 => {
    const rs = layout().receivers;
    const x = rs.reduce((sum, r) => sum + r.x, 0) / rs.length;
    const z = rs.reduce((sum, r) => sum + r.z, 0) / rs.length;
    return physics.v3((x + PITCH.goalLineX - 11) / 2, 0, z / 2);
  };
  /** Teammates of the pass as engine setups: he who meets the ball first gets it. */
  const receiverSetups = (): moments.ReceiverSetup[] =>
    layout().receivers.map((from) => {
      const toGoal = Math.hypot(PITCH.goalLineX - from.x, from.z) || 1;
      return {
        from,
        pace: settings.situations.receiverPace,
        speed: moments.RECEIVER_RUN_SPEED,
        run: physics.v3((PITCH.goalLineX - from.x) / toGoal, 0, -from.z / toGoal),
      };
    });
  /** Places the offside line and the rings for the pass about to be played. */
  const placeOffsideGuides = (): void => {
    const on = settings.situation === 'pass';
    offsideLine.visible = on;
    for (const ring of offsideRings) ring.visible = false;
    if (!on) return;
    const keeperSetup = toKeeperSetup(settings);
    const keeperFeet = keeperSetup
      ? (keeperSetup.feet ??
        moments.keeperSetPosition(
          spot,
          keeperSetup.attributes,
          keeperSetup.tuning ?? moments.DEFAULT_KEEPER_TUNING,
        ))
      : null;
    offsideX = moments.offsideLineX(
      spot.x,
      toDefenderSetups(settings, spot).map((d) => d.feet ?? spot),
      keeperFeet,
    );
    offsideLine.position.x = offsideX;
    const rs = layout().receivers;
    offsideFlags = rs.map((r) => moments.isOffside(r, offsideX, spot.x));
    rs.forEach((r, i) => {
      const ring = offsideRings[i];
      if (!ring) return;
      ring.visible = true;
      ring.position.set(r.x, 0.035, r.z);
      ring.material.color.setHex(offsideFlags[i] ? 0xff4d4d : 0x3ddc84);
    });
  };

  const placeBall = (): void => {
    spot = situationSpot(settings);
    ({ context: momentContext, state: moment } = restingMoment(restingBall(spot.x, spot.z)));
    previousMoment = moment;
    pass = null;
    reception = null;
    passFocus = null;
    showing = 'moment';
    gauge = null;
    emitGauge(null);
    keeperCommands = [];
    keeperFigure.group.visible = moment.keeper !== null && characterAsset === null;
    pending = null;
    const situation = settings.situation;
    shooterCtrl = homeShooter;
    dressPlayers();
    passEnd = null;
    secondBall = false;
    followers = [];
    if (situation === 'pass') {
      const l = layout();
      l.receivers.forEach((r, i) => receiverCtrl(i)?.follow(r, { x: 0, y: 0, z: 0 }, spot));
      passerCtrl?.standAt(spot, { x: PITCH.goalLineX - 11, y: 0, z: 0 });
    } else {
      shooterCtrl?.standAt(spot, GOAL_CENTRE);
    }
    if (passerCtrl) passerCtrl.character.root.visible = situation === 'pass';
    // Teammates: the other receivers of a pass, or the runners who follow up a shot.
    const runners = moments.reboundRunners(situation, spot);
    teammateCtrls.forEach((ctrl, i) => {
      const runner = runners[i];
      ctrl.character.root.visible =
        situation === 'pass' ? i + 1 < layout().receivers.length : runner !== undefined;
      if (situation !== 'pass' && runner) ctrl.standAt(runner, GOAL_CENTRE);
    });
    receiverFigures.forEach((figure, i) => {
      const r = situation === 'pass' ? layout().receivers[i] : undefined;
      figure.group.visible = r !== undefined && characterAsset === null;
      if (r)
        figure.update(
          { feet: r, head: { x: r.x, y: 1.75, z: r.z } },
          { feet: r, head: { x: r.x, y: 1.75, z: r.z } },
          1,
        );
    });
    placeOffsideGuides();
    placeExtras();
    keeperCtrl?.reset();
    // Keeping goal, the player looks over the keeper's shoulder: see through him.
    keeperCtrl?.character.setOpacity(situation === 'keeper' ? 0.4 : 1);
    for (const controller of defenderCtrls) controller.reset();
    syncDefenderFigures(moment.defenders.length);
    ball.position.set(spot.x, spot.y, spot.z);
    phase = 'aiming';
    replaying = false;
    stage.clock.setTimeScale(settings.debug.timeScale);
    stage.clock.reset();
    velocityArrow.visible = false;
    spinArrow.visible = false;
    ballPos.set(spot.x, spot.y, spot.z);
    ballTrail.clear();
    clearAim();
    director.cut();
    applyCamera(0);
    emitStep();
  };

  // ─── Gesture → intent ─────────────────────────────────────────────────────────
  const rayFromLast = (): boolean => {
    const last = points[points.length - 1];
    if (!last) return false;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((last.u * rect.height) / rect.width) * 2 - 1, -last.v * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return true;
  };

  /** Shot intent from the current trace, or null if the trace is not a gesture yet. */
  const currentIntent = (): {
    intent: moments.ShotIntent;
    features: moments.GestureFeatures;
  } | null => {
    const features = moments.analyzeGesture(points, settings.gesture);
    if (!features || !rayFromLast()) return null;
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

  /** Pass target on the grass from the current trace. */
  const currentPassTarget = (): physics.Vec3 | null => {
    if (!moments.analyzeGesture(points, settings.gesture) || !rayFromLast()) return null;
    if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
    const target = physics.v3(
      THREE.MathUtils.clamp(hit.x, -PITCH.goalLineX + 1, PITCH.goalLineX - 1.5),
      0,
      THREE.MathUtils.clamp(hit.z, -PITCH.width / 2 + 1, PITCH.width / 2 - 1),
    );
    return Math.hypot(target.x - spot.x, target.z - spot.z) > 2 ? target : null;
  };

  /** Where the keeper's hands go, from the last point of the swipe (seen from the goal). */
  const currentDiveTarget = (): physics.Vec3 | null => {
    if (!rayFromLast()) return null;
    if (raycaster.ray.direction.x >= -1e-3 || !raycaster.ray.intersectPlane(divePlane, hit))
      return null;
    return physics.v3(
      PITCH.goalLineX,
      THREE.MathUtils.clamp(hit.y, 0.1, 2.8),
      THREE.MathUtils.clamp(hit.z, -5, 5),
    );
  };

  const passerProfile = (): moments.PasserProfile =>
    moments.passerProfile(
      { passing: settings.situations.passing, composure: settings.situations.passComposure },
      settings.shooter.pressure,
    );

  /** Ideal pass to `target` (before the passer's error). */
  const solvePassTo = (target: physics.Vec3): moments.PassSolution | null => {
    const teammates = receiverSetups();
    const chosen = teammates[moments.chooseReceiver(teammates, target, moments.RECEIVER_RUN_SPEED)];
    if (!chosen) return null;
    const run = moments.receptionTicks(
      chosen.from,
      target,
      chosen.pace,
      moments.RECEIVER_RUN_SPEED,
    );
    try {
      return moments.solvePass(spot, target, run, passerProfile(), params, settings.pitch.surface);
    } catch {
      return null;
    }
  };

  /** Shooter profile for a strike of the given technical difficulty. */
  const profileFor = (difficulty: number): moments.ShooterProfile =>
    moments.shooterProfile(settings.shooter, { ...settings.shooter, difficulty }, tuning);

  const updatePrediction = (): void => {
    if (!settings.debug.prediction) {
      clearAim();
      return;
    }
    if (tracing === 'pass') {
      const target = currentPassTarget();
      const solution = target ? solvePassTo(target) : null;
      if (!target || !solution) {
        clearAim();
        return;
      }
      passFocus = target;
      const predicted = simulateFlight(
        moments.passBall(spot, solution.velocity),
        { params, surface: settings.pitch.surface, rng: null },
        { maxTicks: 360 },
      );
      setLine(prediction, predicted.samples, 2);
      targetMarker.visible = true;
      targetMarker.rotation.set(-Math.PI / 2, 0, 0);
      targetMarker.position.set(target.x, 0.03, target.z);
      return;
    }
    if (tracing === 'dive') return;
    const current = currentIntent();
    if (!current) {
      clearAim();
      return;
    }
    const solution = moments.solveShot(
      spot,
      current.intent,
      profileFor(0),
      params,
      settings.pitch.surface,
      { tuning },
    );
    const predicted = simulateFlight(
      kickedBall(spot, solution.velocity, solution.spin),
      { params, surface: settings.pitch.surface, rng: null },
      { maxTicks: 480 },
    );
    setLine(prediction, predicted.samples, 2);
    targetMarker.visible = true;
    targetMarker.rotation.set(0, Math.PI / 2, 0);
    targetMarker.position.set(
      PITCH.goalLineX - 0.02,
      current.intent.target.y,
      current.intent.target.z,
    );
  };

  // ─── Strikes ──────────────────────────────────────────────────────────────────
  /** Strike waiting for the kicking foot to meet the ball (run-up in progress). */
  let pending: {
    kind: 'shot' | 'pass';
    shot: StoredShot | null;
    passBall: physics.BallState | null;
    passSeed: number;
    replay: boolean;
    remaining: number;
  } | null = null;

  const momentSetup = (
    initial: physics.BallState,
    seed: number,
    keeper: moments.KeeperSetup | null,
    defenders: readonly moments.DefenderSetup[],
  ): moments.ShotMomentSetup => ({
    ball: initial,
    physics: params,
    surface: settings.pitch.surface,
    keeper,
    defenders,
    defenderTuning: toDefenderTuning(settings),
    seed,
  });

  /** Starts a shot: run-up and strike when characters are loaded, straight launch otherwise. */
  const beginShot = (stored: StoredShot, replay: boolean): void => {
    replaying = replay;
    if (replay) {
      replayAngle =
        settings.cameraReplayAngle === 'auto'
          ? (REPLAY_ANGLES[replayCount++ % REPLAY_ANGLES.length] ?? 'side')
          : settings.cameraReplayAngle;
      director.cut();
    }
    showing = 'moment';
    const initial = stored.setup.ball;
    // Ball on its spot (frozen where it was received), everyone set, then the swing.
    ({ context: momentContext, state: moment } = moments.startShotMoment({
      ...stored.setup,
      ball: { ...initial, vel: physics.v3(0, 0, 0), spin: physics.v3(0, 0, 0) },
    }));
    previousMoment = moment;
    // A keeper still down after his dive stays down for the follow-up.
    if (stored.setup.keeper?.down) keeperCtrl?.down();
    else keeperCtrl?.reset();
    for (const controller of defenderCtrls) controller.reset();
    ballTrail.clear();
    if (!shooterCtrl) {
      launch(stored, replay);
      return;
    }
    if (stored.receiverFeet) {
      shooterCtrl.follow(stored.receiverFeet, { x: 0, y: 0, z: 0 }, initial.pos);
    }
    const horizontal = Math.hypot(initial.vel.x, initial.vel.z) || 1;
    const delay = shooterCtrl.startStrike(
      initial.pos,
      { x: initial.vel.x / horizontal, y: 0, z: initial.vel.z / horizontal },
      stored.report.power,
      stored.runUp === 'first-time' ? { clip: 'player_shot', lead: FIRST_TIME_LEAD } : {},
    );
    pending = {
      kind: 'shot',
      shot: stored,
      passBall: null,
      passSeed: 0,
      replay,
      remaining: delay,
    };
    phase = 'striking';
    stage.clock.reset();
    stage.clock.setTimeScale(replay ? settings.debug.replayScale : settings.debug.timeScale);
    emitStep();
  };

  const strikeJuice = (initial: physics.BallState, power: number, seed: number): void => {
    fxRng = Rng.create(seed).fork('fx');
    ballTrail.clear();
    const v = initial.vel;
    const h = Math.hypot(v.x, v.z) || 1;
    particles.emit(
      surfaceParticles(settings.pitch.surface),
      initial.pos,
      10 + 16 * power,
      fxRng,
      { x: (v.x / h) * 0.6, y: 1, z: (v.z / h) * 0.6 },
      0.6,
    );
    audio.strike(power, settings.pitch.surface);
  };

  const launch = (stored: StoredShot, replay: boolean): void => {
    ({ context: momentContext, state: moment } = moments.startShotMoment(stored.setup));
    previousMoment = moment;
    postHit = false;
    parried = false;
    showing = 'moment';
    const initial = stored.setup.ball;
    samples.length = 0;
    samples.push(initial);
    heldAfterOutcome = 0;
    replaying = replay;
    phase = 'flying';
    currentReport = stored.report;
    stage.clock.reset();
    stage.clock.setTimeScale(replay ? settings.debug.replayScale : settings.debug.timeScale);
    applyEffects(director.impact('strike', stored.report.power, replay));
    // Juice of the strike: same seed → same bursts in the replay.
    strikeJuice(initial, stored.report.power, Number(stored.setup.seed));

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
    emitShot(stored.report);
    emitStep();
  };

  const reportOf = (
    index: number,
    power: number,
    bulge: number,
    ideal: physics.Vec3,
    actual: physics.Vec3,
    spin: physics.Vec3,
    difficulty: number,
    solver: { miss: number; iterations: number } | null,
  ): ShotReport => {
    const a = new THREE.Vector3(ideal.x, ideal.y, ideal.z);
    const b = new THREE.Vector3(actual.x, actual.y, actual.z);
    return {
      index,
      situation: settings.situation,
      replay: false,
      power,
      bulge,
      speedKmh: b.length() * 3.6,
      spinRps: spin.y / (2 * Math.PI),
      errorDeg: THREE.MathUtils.radToDeg(a.angleTo(b)),
      difficulty,
      solverMiss: solver?.miss ?? 0,
      solverIterations: solver?.iterations ?? 0,
      outcome: null,
      save: null,
    };
  };

  /**
   * Who follows up a shot from `from` (nobody when keeping goal): the shooter, then the other
   * receivers of a pass or the runners of the situation. Also records their controllers.
   */
  const reboundFor = (from: physics.Vec3): moments.ReboundSetup | undefined => {
    const situation = settings.situation;
    const pace = settings.situations.receiverPace;
    if (situation === 'pass') {
      if (!reception || !pass) return undefined;
      const others = pass.state.receivers
        .map((r, i) => ({ feet: r.feet, i }))
        .filter(({ i }) => i !== receivedBy);
      followers = [shooterCtrl, ...others.map(({ i }) => receiverCtrl(i))];
      return moments.reboundSetup(
        'pass',
        reception.receiverFeet,
        pace,
        others.map(({ feet }) => ({ feet, pace })),
      );
    }
    followers = [
      shooterCtrl,
      ...moments.reboundRunners(situation, from).map((_, i) => teammateCtrls[i] ?? null),
    ];
    return moments.reboundSetup(situation, physics.v3(from.x - 0.4, 0, from.z), pace);
  };

  /** One of ours won the second ball: time almost stops, the player strikes it again. */
  const secondBallWon = (by: number): void => {
    if (!lastShot) return;
    const ball = moment.flight.ball;
    const second = moments.secondBallSetup(lastShot.setup, moment, ball, 0);
    const runners = moment.chase?.attackers ?? [];
    // The others stop where they are; the one who got there strikes.
    runners.forEach((r, i) => {
      if (i !== by) followers[i]?.follow(r.feet, { x: 0, y: 0, z: 0 }, ball.pos);
    });
    shooterCtrl = followers[by] ?? shooterCtrl;
    reception = {
      ball,
      keeper: second.keeper,
      defenders: [...(second.defenders ?? [])],
      receiverFeet: runners[by]?.feet ?? ball.pos,
    };
    secondBall = true;
    spot = ball.pos;
    phase = 'aiming';
    heldAfterOutcome = 0;
    stage.clock.setTimeScale(BULLET_TIME, 0.12);
    emitStep();
  };

  /** The player's shot (free shot, free kick, penalty after the gauge, first-time shot). */
  const shoot = (
    intent: moments.ShotIntent,
    features: moments.GestureFeatures,
    gaugeDifficulty: number,
  ): void => {
    const index = shotIndex++;
    const shotRng = Rng.create(settings.debug.seed).fork('shot', index);
    const from = reception ? reception.ball.pos : spot;
    const toTarget = physics.v3(intent.target.x - from.x, 0, intent.target.z - from.z);
    const difficulty = reception
      ? moments.firstTimeDifficulty(reception.ball, toTarget)
      : gaugeDifficulty;
    const profile = profileFor(difficulty);
    let solution: moments.ShotSolution;
    try {
      solution = moments.solveShot(from, intent, profile, params, settings.pitch.surface, {
        tuning,
      });
    } catch {
      phase = 'aiming';
      emitStep();
      return;
    }
    const struck = moments.applyExecutionError(
      solution,
      profile,
      shotRng.fork('execution'),
      tuning,
    );
    const report = reportOf(
      index,
      intent.power,
      features.bulge,
      solution.velocity,
      struck.velocity,
      struck.spin,
      difficulty,
      solution,
    );
    const initial = kickedBall(from, struck.velocity, struck.spin);
    const seed = shotRng.fork('moment').nextU32();
    const base = reception
      ? momentSetup(initial, seed, reception.keeper, reception.defenders)
      : momentSetup(initial, seed, toKeeperSetup(settings), toDefenderSetups(settings, from));
    const rebound = secondBall ? undefined : reboundFor(from);
    const setup = rebound ? { ...base, rebound } : base;
    const stored: StoredShot = {
      setup,
      runUp: reception ? 'first-time' : 'full',
      receiverFeet: reception?.receiverFeet ?? null,
      report,
    };
    lastShot = stored;
    beginShot(stored, false);
  };

  /** Keeper situation: the opponent strikes; the player will swipe the dive. */
  const opponentStrike = (): void => {
    const index = shotIndex++;
    const rng = Rng.create(settings.debug.seed).fork('opponent', index);
    const profile = profileFor(0);
    const shot = moments.opponentShot(spot, profile, params, settings.pitch.surface, rng, tuning);
    const initial = kickedBall(spot, shot.velocity, shot.spin);
    keeperCommands = [];
    const stored: StoredShot = {
      setup: momentSetup(
        initial,
        rng.fork('moment').nextU32(),
        toKeeperSetup(settings, keeperCommands),
        [],
      ),
      runUp: 'full',
      receiverFeet: null,
      report: reportOf(index, 0.8, 0, shot.velocity, shot.velocity, shot.spin, 0, null),
    };
    lastShot = stored;
    beginShot(stored, false);
  };

  /** The player's pass: weighted to the receiver's run, then the passer's error. */
  const passTo = (target: physics.Vec3, features: moments.GestureFeatures): void => {
    const solution = solvePassTo(target);
    if (!solution) {
      phase = 'aiming';
      emitStep();
      return;
    }
    const index = shotIndex++;
    const rng = Rng.create(settings.debug.seed).fork('pass', index);
    const velocity = moments.applyPassError(solution.velocity, passerProfile(), rng.fork('error'));
    const initial = moments.passBall(spot, velocity);
    const passSeed = rng.fork('moment').nextU32();
    currentReport = reportOf(
      index,
      features.power,
      features.bulge,
      solution.velocity,
      velocity,
      physics.v3(0, 0, 0),
      0,
      null,
    );
    passFocus = target;
    if (!passerCtrl) {
      startPass(initial, passSeed);
      return;
    }
    const h = Math.hypot(velocity.x, velocity.z) || 1;
    const delay = passerCtrl.startStrike(
      spot,
      { x: velocity.x / h, y: 0, z: velocity.z / h },
      0.3,
      { clip: 'player_pass' },
    );
    pending = {
      kind: 'pass',
      shot: null,
      passBall: initial,
      passSeed,
      replay: false,
      remaining: delay,
    };
    phase = 'striking';
    emitStep();
  };

  const startPass = (initial: physics.BallState, seed: number): void => {
    const started = moments.startPassMoment({
      ball: initial,
      physics: params,
      surface: settings.pitch.surface,
      receivers: receiverSetups(),
      keeper: toKeeperSetup(settings),
      defenders: toDefenderSetups(settings, initial.pos),
      defenderTuning: toDefenderTuning(settings),
      seed,
    });
    pass = { ...started, previous: started.state };
    showing = 'pass';
    phase = 'passing';
    samples.length = 0;
    samples.push(initial);
    heldAfterOutcome = 0;
    stage.clock.reset();
    stage.clock.setTimeScale(settings.debug.timeScale);
    strikeJuice(initial, 0.35, seed);
    emitStep();
  };

  /** Pass received: time almost stops, the player aims the first-time shot. */
  const receive = (by: number): void => {
    if (!pass) return;
    const s = pass.state;
    shooterCtrl = receiverCtrl(by) ?? homeShooter;
    const keeperSetup = toKeeperSetup(settings);
    reception = {
      ball: s.flight.ball,
      keeper: keeperSetup && s.keeper ? { ...keeperSetup, feet: s.keeper.feet } : keeperSetup,
      defenders: moments.defendersAfterPass(pass.context.defenderSetups, s.defenders),
      receiverFeet: (s.receivers[by] ?? s.receivers[0])?.feet ?? spot,
    };
    spot = s.flight.ball.pos;
    phase = 'aiming';
    stage.clock.setTimeScale(BULLET_TIME, 0.12);
    emitStep();
  };

  const passOver = (outcome: 'intercepted' | 'lost' | 'offside'): void => {
    phase = 'result';
    passEnd = outcome;
    heldAfterOutcome = 0;
    if (currentReport) {
      currentReport = { ...currentReport, outcome };
      emitShot(currentReport);
    }
    shooterCtrl?.react('miss', 0);
    if (outcome === 'offside') audio.whistle(0.6);
    else cheer('ooh');
    emitStep();
  };

  /** Keeper situation: the swipe sets the dive (target on the goal plane, tick of the moment). */
  const dive = (): void => {
    const target = currentDiveTarget();
    if (!target || keeperCommands.length > 0 || replaying) return;
    const tick = phase === 'striking' ? 1 : moment.tick + 1;
    keeperCommands.push({ tick, target });
    emitStep();
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
  const startTrace = (event: PointerEvent, kind: 'shot' | 'pass' | 'dive'): void => {
    pointerId = event.pointerId;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Not an active pointer (synthetic events): tracing still works without capture.
    }
    gestureStart = event.timeStamp;
    points = [toPoint(event)];
    tracing = kind;
    emitGesture();
  };
  const onPointerDown = (event: PointerEvent): void => {
    // Browsers only allow audio after a user gesture.
    if (audio.unlock()) audio.startMurmur();
    if (pointerId !== null) return;
    const situation = settings.situation;
    if (phase === 'gauge' && gauge) {
      const g = moments.penaltyGauge(gauge.value);
      const intent = { ...gauge.intent, power: g.power };
      const features = gauge.features;
      gauge = null;
      emitGauge(null);
      shoot(intent, features, g.difficulty);
      return;
    }
    if (situation === 'keeper') {
      if (phase === 'aiming') {
        opponentStrike();
        return;
      }
      const live = phase === 'striking' || (phase === 'flying' && moment.outcome === null);
      if (live && !replaying && keeperCommands.length === 0) startTrace(event, 'dive');
      return;
    }
    if (phase !== 'aiming') return;
    startTrace(event, situation === 'pass' && !reception ? 'pass' : 'shot');
    phase = 'tracing';
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (pointerId === null || event.pointerId !== pointerId) return;
    const events =
      typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
    for (const e of events.length > 0 ? events : [event]) points.push(toPoint(e));
    predictionDirty = true;
    emitGesture();
  };
  const endTrace = (): void => {
    points = [];
    emitGesture();
    clearAim();
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    points.push(toPoint(event));
    if (tracing === 'dive') {
      dive();
      endTrace();
      return;
    }
    if (phase !== 'tracing') {
      endTrace();
      return;
    }
    if (tracing === 'pass') {
      const target = currentPassTarget();
      const features = moments.analyzeGesture(points, settings.gesture);
      endTrace();
      if (target && features) passTo(target, features);
      else phase = 'aiming';
      emitStep();
      return;
    }
    const current = currentIntent();
    endTrace();
    if (!current) {
      phase = 'aiming';
      emitStep();
      return;
    }
    if (settings.situation === 'penalty' && !reception) {
      gauge = { intent: current.intent, features: current.features, elapsed: 0, value: 0 };
      phase = 'gauge';
      emitStep();
      return;
    }
    shoot(current.intent, current.features, 0);
  };
  const onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    if (phase === 'tracing') phase = 'aiming';
    endTrace();
    emitStep();
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);

  // ─── Loop ───────────────────────────────────────────────────────────────────
  const flightEvent = (event: physics.FlightEvent, i: number): void => {
    if (event.type === 'frame') {
      postHit = true;
      applyEffects(director.impact('post', event.speed, replaying));
      particles.emit('glint', event.pos, 14, fxRng, { x: -1, y: 0.3, z: 0 }, 1);
      audio.post(event.speed, panOf(event.pos.z));
      cheer('ooh');
    }
    if (event.type === 'bounce') {
      particles.emit(
        surfaceParticles(settings.pitch.surface),
        event.pos,
        Math.min(14, event.speed),
        fxRng,
        { x: 0, y: 1, z: 0 },
        0.9,
      );
      audio.bounce(event.speed, settings.pitch.surface, panOf(event.pos.z));
    }
    if (event.type === 'net') {
      particles.emit('net', event.pos, 10, fxRng, { x: -1, y: 0.2, z: 0 }, 1);
      audio.net(event.speed, panOf(event.pos.z));
      stage.shake.add(Math.min(0.2, event.speed * 0.01));
      stadium.netImpact(event.pos, event.speed, simTime + (i + 1) * TICK_DT);
    }
  };

  const stepShot = (ticks: number): void => {
    for (let i = 0; i < ticks && phase === 'flying'; i++) {
      previousMoment = moment;
      const next = moments.stepShotMoment(moment, momentContext);
      moment = next.state;
      samples.push(moment.flight.ball);
      for (const event of next.events) {
        if (event.type === 'save' && event.kind === 'parry') parried = true;
        if (event.type === 'save' && currentReport) {
          currentReport = { ...currentReport, save: event.kind, replay: replaying };
          emitShot(currentReport);
          applyEffects(director.impact('save', event.speed, replaying));
          audio.gloves(event.kind, event.speed, panOf(event.pos.z));
          cheer(settings.situation === 'keeper' ? 'goal' : 'ooh');
        } else if (event.type === 'block' && currentReport) {
          currentReport = { ...currentReport, save: 'block', replay: replaying };
          emitShot(currentReport);
          applyEffects(director.impact('block', event.speed, replaying));
          audio.block(event.speed, panOf(event.pos.z));
        } else if (
          event.type === 'bounce' ||
          event.type === 'frame' ||
          event.type === 'net' ||
          event.type === 'outcome'
        ) {
          flightEvent(event, i);
        }
      }
      if (currentReport && moment.outcome !== null && currentReport.outcome !== moment.outcome) {
        currentReport = { ...currentReport, outcome: moment.outcome, replay: replaying };
        if (!replaying && lastShot) lastShot = { ...lastShot, report: currentReport };
        emitShot(currentReport);
        const goal = moment.outcome === 'goal';
        const keeperGame = settings.situation === 'keeper';
        if (!replaying) {
          shooterCtrl?.react(goal ? 'goal' : 'miss', fxRng.float());
          if (goal) keeperCtrl?.concede();
        }
        if (goal) {
          applyEffects(director.impact('goal', 1, replaying));
          if (!replaying) {
            // Conceding in the keeper situation: the away end is quieter than the home one.
            cheer(keeperGame ? 'dismay' : 'goal');
            audio.whistle(0.45, 0.9);
            if (!keeperGame) confetti();
          }
        }
        // Near miss: the stand goes "ouuuh".
        if ((moment.outcome === 'wide' || moment.outcome === 'over') && !replaying) {
          const p = moment.flight.ball.pos;
          const besidePost = Math.abs(p.z) - physics.GOAL.width / 2 < 1.5 && p.y < 3.2;
          const overBar =
            p.y - physics.GOAL.height < 1.2 && Math.abs(p.z) < physics.GOAL.width / 2 + 1;
          if (besidePost || overBar) cheer('ooh');
        }
        emitStep();
        if (moment.outcome === 'rebound' && !replaying) {
          const won = next.events.find((e) => e.type === 'rebound');
          secondBallWon(won?.type === 'rebound' ? won.by : 0);
        }
      }
    }
  };

  let receivedBy = 0;
  const stepPass = (ticks: number): void => {
    if (!pass) return;
    for (let i = 0; i < ticks && phase === 'passing'; i++) {
      pass.previous = pass.state;
      const next = moments.stepPassMoment(pass.state, pass.context);
      pass.state = next.state;
      samples.push(pass.state.flight.ball);
      for (const event of next.events) {
        if (event.type === 'received') receivedBy = event.by;
        if (event.type === 'intercepted') {
          applyEffects(director.impact('block', event.speed, false));
          audio.block(event.speed, panOf(event.pos.z));
        } else if (event.type === 'bounce' || event.type === 'frame' || event.type === 'net') {
          flightEvent(event, i);
        }
      }
      const outcome = pass.state.outcome;
      if (outcome === 'received') receive(receivedBy);
      else if (outcome === 'intercepted' || outcome === 'lost' || outcome === 'offside')
        passOver(outcome);
    }
  };

  const unsubscribe = stage.onFrame((frame) => {
    if (phase === 'striking' && pending) {
      pending.remaining -= frame.simDt;
      if (pending.remaining <= 0) {
        const p = pending;
        pending = null;
        if (p.kind === 'shot' && p.shot) launch(p.shot, p.replay);
        else if (p.kind === 'pass' && p.passBall) startPass(p.passBall, p.passSeed);
      }
    }
    if (phase === 'tracing' && predictionDirty) {
      predictionDirty = false;
      updatePrediction();
    }
    if (phase === 'gauge' && gauge) {
      // Triangle wave: the crowd's pressure makes it sweep faster.
      gauge.elapsed += frame.wallDt;
      const speed = settings.situations.gaugeSpeed * (1 + settings.shooter.pressure * 0.8);
      const x = (gauge.elapsed * speed * 2) % 2;
      gauge.value = x < 1 ? x : 2 - x;
      emitGauge(gauge.value);
    }

    if (phase === 'passing') stepPass(frame.ticks);
    if (phase === 'flying') {
      stepShot(frame.ticks);
      if (settings.debug.trail) setLine(trail, samples, 2);
      if (phase === 'flying' && moment.outcome !== null) {
        heldAfterOutcome += frame.wallDt;
        if (heldAfterOutcome > RESULT_HOLD) {
          // The highlight (a goal, or a save when keeping goal) is replayed once from another
          // angle, then the ball goes back.
          const highlight =
            settings.situation === 'keeper'
              ? moment.outcome === 'saved'
              : moment.outcome === 'goal';
          if (options.moment) {
            finishMoment(shotOutcome());
          } else if (!replaying && highlight && settings.camera.autoReplay && lastShot) {
            beginShot(
              {
                ...lastShot,
                report: { ...lastShot.report, replay: true, outcome: null, save: null },
              },
              true,
            );
          } else {
            placeBall();
          }
        }
      }
    }
    if (phase === 'passing' && settings.debug.trail) setLine(trail, samples, 2);
    if (phase === 'result') {
      heldAfterOutcome += frame.wallDt;
      if (heldAfterOutcome > RESULT_HOLD) {
        // A pass that never reached the shooter: no shot, the chance is gone.
        if (options.moment) finishMoment(passEnd === 'offside' ? 'offside' : 'miss');
        else placeBall();
      }
    }

    const { now, before } = shown();
    const a = frame.alpha;
    const p0 = before.ball.pos;
    const p1 = now.ball.pos;
    ball.position.set(p0.x + (p1.x - p0.x) * a, p0.y + (p1.y - p0.y) * a, p0.z + (p1.z - p0.z) * a);
    // Caught: the ball sits in the gloves on screen (the pose may not reach the engine's hands).
    if (now.keeper?.phase === 'holding' && keeperCtrl)
      keeperCtrl.character.part('hands', ball.position);
    ballPos.copy(ball.position);

    // Director: camera every frame (real time, fluid in slow motion) and slow motion.
    if (phase === 'flying') {
      const base = replaying ? settings.debug.replayScale : settings.debug.timeScale;
      // Keeping goal: the flight is slowed down so the player can read it and swipe.
      const keeperTime =
        settings.situation === 'keeper' && !replaying && moment.outcome === null
          ? keeperSlowMo(settings)
          : 1;
      stage.clock.setTimeScale(base * keeperTime * director.timeScale(directorInput()), 0.06);
    }
    applyCamera(frame.wallDt);

    // Trail and particles follow simulated time (slow motion slows them too).
    const moving = phase === 'flying' || phase === 'passing' || phase === 'result';
    if (moving && now.keeper?.phase !== 'holding') {
      const v = now.ball.vel;
      ballTrail.push(ballPos, Math.hypot(v.x, v.y, v.z), camera.position);
    }
    particles.update(frame.simDt);
    particles.setViewportHeight(
      (stage.stats.height * stage.stats.pixelRatio) / (2 * Math.tan((camera.fov * Math.PI) / 360)),
    );
    if (moving) {
      // Ball spin, for the eye only; a rolling ball turns with its speed.
      const b = now.ball;
      if (b.grounded) {
        ball.rotation.x += (b.vel.z / BALL.radius) * frame.simDt;
        ball.rotation.z -= (b.vel.x / BALL.radius) * frame.simDt;
      } else {
        ball.rotation.x += b.spin.x * frame.simDt;
        ball.rotation.y += b.spin.y * frame.simDt;
        ball.rotation.z += b.spin.z * frame.simDt;
      }
    }

    // Teammates' runs (pass situation, until one of them strikes).
    if (showing === 'pass' && pass && phase !== 'striking') {
      const running = phase === 'passing' || phase === 'aiming';
      pass.state.receivers.forEach((r1, i) => {
        const r0 = pass?.previous.receivers[i] ?? r1;
        const feet = {
          x: r0.feet.x + (r1.feet.x - r0.feet.x) * a,
          y: 0,
          z: r0.feet.z + (r1.feet.z - r0.feet.z) * a,
        };
        receiverCtrl(i)?.follow(feet, running ? r1.vel : { x: 0, y: 0, z: 0 }, ballPos);
        receiverFigures[i]?.update(
          { feet, head: { x: feet.x, y: 1.75, z: feet.z } },
          { feet, head: { x: feet.x, y: 1.75, z: feet.z } },
          1,
        );
        const ring = offsideRings[i];
        if (ring) {
          ring.position.set(feet.x, 0.035, feet.z);
          // The rings are a hint before the pass: gone once one of them has the ball.
          ring.visible = phase === 'passing';
        }
      });
    } else if (reception && characterAsset === null) {
      const feet = reception.receiverFeet;
      receiverFigures[0]?.update(
        { feet, head: { x: feet.x, y: 1.75, z: feet.z } },
        { feet, head: { x: feet.x, y: 1.75, z: feet.z } },
        1,
      );
    }
    if (reception || (phase === 'flying' && showing === 'moment')) {
      for (const ring of offsideRings) ring.visible = false;
      offsideLine.visible = false;
    }
    // Second ball: our players go for it (the defence and the keeper are in the moment state).
    const chase = moment.chase;
    if (showing === 'moment' && chase && phase === 'flying') {
      const before = previousMoment.chase ?? chase;
      chase.attackers.forEach((r1, i) => {
        if (moment.tick < r1.startTick) return;
        const r0 = before.attackers[i] ?? r1;
        const feet = {
          x: r0.feet.x + (r1.feet.x - r0.feet.x) * a,
          y: 0,
          z: r0.feet.z + (r1.feet.z - r0.feet.z) * a,
        };
        followers[i]?.follow(feet, r1.vel, ballPos);
      });
      // Offside when the ball was struck: he stays out of it, a red ring says why.
      const offside = momentContext.reboundOffside;
      offsideRings.forEach((ring, k) => {
        const i = k + 1;
        const r = chase.attackers[i];
        ring.visible = r !== undefined && offside[i] === true;
        if (r && ring.visible) {
          ring.position.set(r.feet.x, 0.035, r.feet.z);
          ring.material.color.setHex(0xff4d4d);
        }
      });
    }
    homeShooter?.update(frame.simDt);
    for (const ctrl of teammateCtrls) ctrl.update(frame.simDt);
    passerCtrl?.update(frame.simDt);
    if (keeperCtrl && now.keeper && before.keeper) {
      keeperCtrl.character.root.visible = true;
      keeperCtrl.update(before.keeper, now.keeper, now.tick, a, frame.simDt);
    } else if (keeperCtrl) {
      keeperCtrl.character.root.visible = false;
    }
    for (let i = 0; i < defenderCtrls.length; i++) {
      const cur = now.defenders[i];
      const prev = before.defenders[i] ?? cur;
      if (cur && prev)
        (defenderCtrls[i] as DefenderController).update(
          prev,
          cur,
          ballPos,
          a,
          frame.simDt,
          wallApexSeconds(),
        );
    }
    extras?.update(frame.simDt);
    for (let i = 0; i < defenderFigures.length; i++) {
      const cur = now.defenders[i];
      const prev = before.defenders[i] ?? cur;
      if (cur && prev) (defenderFigures[i] as PlayerFigure).update(prev, cur, a);
    }
    if (now.keeper && before.keeper && characterAsset === null)
      keeperFigure.update(before.keeper, now.keeper, a);
    simTime += frame.simDt;
    stadium.update(simTime);
    stage.postSettings.flash = Math.max(0, stage.postSettings.flash - frame.wallDt * 2.5);
    emitStep();
  });

  applyJuiceSettings();
  placeBall();

  void loadCharacterAsset(options.characterAssetsUrl ?? '/assets/characters/').then((asset) => {
    if (!asset || disposed) return;
    characterAsset = asset;
    extras = new PitchExtras(scene, asset);
    const shooter = new Character(asset, HOME_CHARACTER_KIT);
    const passer = new Character(asset, HOME_CHARACTER_KIT);
    const keeper = new Character(asset, looks().keeper);
    scene.add(shooter.root, passer.root, keeper.root);
    homeShooter = new ShooterController(shooter);
    shooterCtrl = homeShooter;
    passerCtrl = new ShooterController(passer);
    // Teammates: the other receivers of a pass, or the follow-up runners of a shot.
    const teammates = Math.max(layoutMaxReceivers - 1, 3);
    for (let i = 0; i < teammates; i++) {
      const teammate = new Character(asset, HOME_CHARACTER_KIT);
      scene.add(teammate.root);
      teammateCtrls.push(new ShooterController(teammate));
    }
    keeperCtrl = new KeeperController(keeper);
    dressPlayers();
    if (phase === 'aiming' && !reception) placeBall();
    else {
      passer.root.visible = settings.situation === 'pass';
      for (const figure of receiverFigures) figure.group.visible = false;
      keeperFigure.group.visible = false;
      syncDefenderFigures(moment.defenders.length);
    }
  });

  return {
    stats: stage.stats,
    setSettings(next) {
      const situationChanged =
        next.situation !== settings.situation ||
        next.situations.passLayout !== settings.situations.passLayout;
      const spotChanged =
        next.spot.distance !== settings.spot.distance || next.spot.offset !== settings.spot.offset;
      settings = next;
      director.settings = settings.camera;
      applyJuiceSettings();
      stadium.setSurface(settings.pitch.surface);
      params = toPhysicsParams(settings);
      tuning = toShotTuning(settings);
      trail.visible = settings.debug.trail;
      if (!settings.debug.prediction) clearAim();
      if (phase === 'flying' && !replaying) stage.clock.setTimeScale(settings.debug.timeScale);
      if (situationChanged) {
        trail.geometry.setDrawRange(0, 0);
        placeBall();
      } else if (phase === 'aiming' && !reception) placeBall();
      else if (spotChanged) trail.geometry.setDrawRange(0, 0);
    },
    replay() {
      if (!lastShot || phase === 'tracing' || phase === 'gauge' || phase === 'passing') return;
      reception = null;
      pass = null;
      beginShot(
        { ...lastShot, report: { ...lastShot.report, replay: true, outcome: null, save: null } },
        true,
      );
    },
    reset() {
      points = [];
      emitGesture();
      clearAim();
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
    onStep(callback) {
      stepListeners.add(callback);
      callback(currentStep());
      return () => stepListeners.delete(callback);
    },
    onGauge(callback) {
      gaugeListeners.add(callback);
      return () => gaugeListeners.delete(callback);
    },
    dispose() {
      unsubscribe();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      gestureListeners.clear();
      shotListeners.clear();
      stepListeners.clear();
      gaugeListeners.clear();
      disposed = true;
      homeShooter?.character.dispose();
      for (const ctrl of teammateCtrls) ctrl.character.dispose();
      passerCtrl?.character.dispose();
      keeperCtrl?.character.dispose();
      for (const controller of defenderCtrls) controller.character.dispose();
      extras?.dispose();
      audio.dispose();
      stadium.dispose();
      stage.dispose();
    },
  };
}
