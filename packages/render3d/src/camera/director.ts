// Camera director for key moments (ARCHITECTURE §5.2): shots defined as data, picked per stage of
// the moment (aim → flight → result → replay), smoothed by critically damped springs, plus the
// time control (slow motion near the goal) and impact effects (hit-stop, shake, flash).
// DOM-free: only three.js math, so it is unit-tested.

import * as THREE from 'three';

export type CameraMode = 'auto' | 'behind' | 'chase' | 'side' | 'reverse' | 'high';
export type ReplayAngle = 'side' | 'reverse' | 'chase' | 'high';
export type ShotName =
  'aim' | 'chase' | 'side' | 'reverse' | 'high' | 'keeper' | 'orbit' | 'hold' | 'pass' | 'goalie';

/** Whose eyes the moment is seen through: the shooter, the passer, or the keeper (player). */
export type MomentView = 'shooter' | 'pass' | 'keeper';

export interface DirectorSettings {
  mode: CameraMode;
  /** Behind the ball before the strike. */
  aimDistance: number;
  aimHeight: number;
  fovAim: number;
  /** Chase: behind and above the ball, lagging on a spring. */
  chaseDistance: number;
  chaseHeight: number;
  /** Spring angular frequency (1/s): higher = tighter follow. */
  chaseStiffness: number;
  /** Look ahead of the ball (seconds of its velocity). */
  lookAhead: number;
  fovChase: number;
  /** Side-on tracking shot from the touchline. */
  sideDistance: number;
  sideHeight: number;
  fovSide: number;
  /** Reverse angle from behind the goal. */
  reverseDistance: number;
  reverseHeight: number;
  fovReverse: number;
  /** Slow motion as the ball arrives at the goal. */
  slowMoScale: number;
  /** Seconds before the ball reaches the goal plane when slow motion starts. */
  slowMoWindow: number;
  /** Seconds of slow motion kept after a goal or a save. */
  slowMoHold: number;
  hitStopStrike: number;
  hitStopGoal: number;
  hitStopSave: number;
  shakeStrike: number;
  shakeGoal: number;
  flashGoal: number;
  /** Replays the goal automatically, from another angle. */
  autoReplay: boolean;
}

export const DEFAULT_DIRECTOR_SETTINGS: DirectorSettings = {
  mode: 'auto',
  aimDistance: 6,
  aimHeight: 2.2,
  fovAim: 50,
  chaseDistance: 4.2,
  chaseHeight: 1.5,
  chaseStiffness: 7,
  lookAhead: 0.35,
  fovChase: 46,
  sideDistance: 20,
  sideHeight: 4.5,
  fovSide: 30,
  reverseDistance: 7,
  reverseHeight: 1.7,
  fovReverse: 52,
  slowMoScale: 0.3,
  slowMoWindow: 0.28,
  slowMoHold: 0.45,
  hitStopStrike: 0.035,
  hitStopGoal: 0.08,
  hitStopSave: 0.06,
  shakeStrike: 0.12,
  shakeGoal: 0.45,
  flashGoal: 0.3,
  autoReplay: true,
};

interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type MomentPhase = 'aiming' | 'flying' | 'result';
export type ResultKind = 'goal' | 'saved' | 'blocked' | 'miss' | null;

export interface DirectorInput {
  readonly phase: MomentPhase;
  /** Angle of the replay being played, or null live. */
  readonly replay: ReplayAngle | null;
  readonly ball: Point;
  readonly ballVel: Point;
  /** Where the ball was struck from. */
  readonly spot: Point;
  /** Centre of the attacked goal on the goal line (x = goal line). */
  readonly goal: Point;
  readonly keeper: Point | null;
  readonly result: ResultKind;
  /** Default 'shooter'. */
  readonly view?: MomentView;
  /** Pass view: where the pass is going (receiver's meeting point). */
  readonly focus?: Point | null;
  /** Viewport width / height (portrait phones need a wider framing). Default 16/9. */
  readonly aspect?: number;
}

export interface CameraPose {
  readonly position: THREE.Vector3;
  readonly target: THREE.Vector3;
  readonly fov: number;
  readonly shot: ShotName;
}

export interface ImpactEffects {
  readonly hitStop: number;
  readonly shake: number;
  readonly flash: number;
}

/** Critically damped spring on a vector (exact for constant targets, sub-stepped). */
export class VectorSpring {
  readonly value = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  private readonly accel = new THREE.Vector3();

  constructor(public omega: number) {}

  snap(to: THREE.Vector3): void {
    this.value.copy(to);
    this.velocity.set(0, 0, 0);
  }

  step(target: THREE.Vector3, dt: number): THREE.Vector3 {
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    const w = this.omega;
    for (let i = 0; i < n; i++) {
      // a = ω²(target − x) − 2ω v
      this.accel
        .subVectors(target, this.value)
        .multiplyScalar(w * w)
        .addScaledVector(this.velocity, -2 * w);
      this.velocity.addScaledVector(this.accel, h);
      this.value.addScaledVector(this.velocity, h);
    }
    return this.value;
  }
}

const v = (p: Point): THREE.Vector3 => new THREE.Vector3(p.x, p.y, p.z);

/** Horizontal unit vector from `a` to `b` (falls back to +X). */
function flatDir(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
  const d = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
  return d.lengthSq() > 1e-8 ? d.normalize() : new THREE.Vector3(1, 0, 0);
}

export class CameraDirector {
  settings: DirectorSettings;
  private readonly position: VectorSpring;
  private readonly target: VectorSpring;
  private fov: number;
  private shot: ShotName = 'aim';
  private snapNext = true;
  private resultTime = 0;
  private orbitAngle = 0;

  constructor(settings: DirectorSettings = DEFAULT_DIRECTOR_SETTINGS) {
    this.settings = settings;
    this.position = new VectorSpring(settings.chaseStiffness);
    this.target = new VectorSpring(settings.chaseStiffness * 1.8);
    this.fov = settings.fovAim;
  }

  /** The next update jumps straight to the wanted framing (hard cut). */
  cut(): void {
    this.snapNext = true;
  }

  /** Which shot frames the moment now. */
  pickShot(input: DirectorInput): ShotName {
    const mode = this.settings.mode;
    const view = input.view ?? 'shooter';
    if (!input.replay && input.phase !== 'result') {
      if (view === 'keeper') return 'goalie';
      if (view === 'pass') return 'pass';
    }
    if (input.phase === 'aiming') return 'aim';
    if (input.replay) return input.replay;
    if (input.phase === 'result') {
      if (mode !== 'auto') return mode === 'behind' ? 'hold' : mode;
      if (input.result === 'goal') return 'orbit';
      if (input.result === 'saved' && input.keeper) return 'keeper';
      return 'hold';
    }
    if (mode === 'auto') return 'chase';
    return mode === 'behind' ? 'aim' : mode;
  }

  /** Wanted camera position, look-at point and field of view for a shot. */
  framing(
    shot: ShotName,
    input: DirectorInput,
  ): { position: THREE.Vector3; target: THREE.Vector3; fov: number } {
    const s = this.settings;
    const ball = v(input.ball);
    const goal = v(input.goal);
    const spot = v(input.spot);
    switch (shot) {
      case 'aim': {
        const dir = flatDir(spot, goal);
        return {
          position: spot.clone().addScaledVector(dir, -s.aimDistance).setY(s.aimHeight),
          target: new THREE.Vector3(goal.x, 0.2, spot.z * 0.35),
          fov: s.fovAim,
        };
      }
      case 'chase': {
        const vel = v(input.ballVel);
        const dir = vel.lengthSq() > 1 ? flatDir(new THREE.Vector3(), vel) : flatDir(ball, goal);
        const ahead = ball.clone().addScaledVector(vel, s.lookAhead);
        // Never look past the goal: the goal mouth stays in frame.
        ahead.x = Math.min(ahead.x, goal.x + 1);
        return {
          position: ball
            .clone()
            .addScaledVector(dir, -s.chaseDistance)
            .setY(Math.max(ball.y, 0.3) + s.chaseHeight),
          target: ahead.lerp(goal.clone().setY(1.2), 0.25),
          fov: s.fovChase,
        };
      }
      case 'side': {
        // From the touchline on the ball's far side, tracking along the pitch.
        const side = input.spot.z <= 0 ? -1 : 1;
        return {
          position: new THREE.Vector3(
            ball.x - 3,
            s.sideHeight,
            side * s.sideDistance + ball.z * 0.3,
          ),
          target: new THREE.Vector3(ball.x + 2, Math.max(0.8, ball.y), ball.z),
          fov: s.fovSide,
        };
      }
      case 'reverse': {
        // Behind the net, slightly off-centre, looking back at the incoming ball.
        const off = input.spot.z <= 0 ? 1.5 : -1.5;
        return {
          position: new THREE.Vector3(goal.x + s.reverseDistance, s.reverseHeight, off),
          target: ball.clone().setY(Math.max(0.5, ball.y)),
          fov: s.fovReverse,
        };
      }
      case 'high': {
        const dir = flatDir(spot, goal);
        return {
          position: spot.clone().addScaledVector(dir, -14).setY(11),
          target: ball.clone().lerp(goal, 0.4).setY(0.5),
          fov: 40,
        };
      }
      case 'keeper': {
        const keeper = v(input.keeper ?? input.goal);
        return {
          position: new THREE.Vector3(
            keeper.x - 4.5,
            1.5,
            keeper.z + (input.spot.z <= 0 ? -1.5 : 1.5),
          ),
          target: keeper.clone().setY(Math.max(0.8, keeper.y - 0.3)),
          fov: 40,
        };
      }
      case 'pass': {
        // High behind the ball, the receiver's area ahead: room to trace the pass on the grass.
        const focus = input.focus ? v(input.focus) : new THREE.Vector3(goal.x - 11, 0, 0);
        const anchor = input.phase === 'aiming' ? spot : ball;
        const dir = flatDir(anchor, focus);
        return {
          position: anchor.clone().addScaledVector(dir, -11).setY(6),
          target: anchor.clone().lerp(focus, 0.25).setY(0),
          fov: 55,
        };
      }
      case 'goalie': {
        // Over the keeper's shoulder, from inside the goal (under the bar): steady, so the swipe
        // maps to the goal.
        // Portrait: step back and up until the goal and a full dive (±4.6 m) fit the width.
        const fov = 62;
        const halfWidth = Math.tan(((fov / 2) * Math.PI) / 180) * (input.aspect ?? 16 / 9);
        const back = Math.min(11, Math.max(1.4, 4.6 / halfWidth - 1));
        const target = spot.clone().setY(0.9);
        if (input.phase === 'flying') target.lerp(ball, 0.2);
        return {
          position: new THREE.Vector3(
            goal.x + back,
            back <= 2 ? 1.6 : 1.6 + (back - 2) * 0.35,
            (spot.z <= 0 ? 0.8 : -0.8) * Math.min(1, 2 / back),
          ),
          target,
          fov,
        };
      }
      case 'orbit': {
        const radius = 9;
        return {
          position: new THREE.Vector3(
            goal.x - Math.cos(this.orbitAngle) * radius,
            2.4,
            Math.sin(this.orbitAngle) * radius,
          ),
          target: new THREE.Vector3(goal.x + 0.5, 1, ball.z * 0.5),
          fov: 42,
        };
      }
      case 'hold':
      default:
        return {
          position: this.position.value.clone(),
          target: ball.clone(),
          fov: this.fov,
        };
    }
  }

  /**
   * Advances the camera by `dt` real seconds (smoothing stays fluid during slow motion) and
   * returns the pose to apply.
   */
  update(dt: number, input: DirectorInput): CameraPose {
    const shot = this.pickShot(input);
    // Cuts: replays and result shots start on a clean frame; aim → chase blends.
    if (shot !== this.shot) {
      if (shot !== 'chase' && shot !== 'hold') this.snapNext = true;
      if (input.phase === 'result' && this.shot !== 'orbit') {
        this.resultTime = 0;
        this.orbitAngle = Math.atan2(input.ball.z, 9) * 0.5;
      }
      this.shot = shot;
    }
    if (input.phase === 'result') {
      this.resultTime += dt;
      this.orbitAngle += dt * 0.35;
    }

    const wanted = this.framing(shot, input);
    this.position.omega = shot === 'chase' ? this.settings.chaseStiffness : 5;
    this.target.omega = this.position.omega * 1.8;
    if (this.snapNext) {
      this.position.snap(wanted.position);
      this.target.snap(wanted.target);
      this.fov = wanted.fov;
      this.snapNext = false;
    } else {
      this.position.step(wanted.position, dt);
      this.target.step(wanted.target, dt);
      this.fov += (wanted.fov - this.fov) * (1 - Math.exp(-6 * dt));
    }
    // Keep the camera above the grass.
    if (this.position.value.y < 0.25) this.position.value.y = 0.25;
    return {
      position: this.position.value.clone(),
      target: this.target.value.clone(),
      fov: this.fov,
      shot,
    };
  }

  /**
   * Time scale wanted by the director (1 = real time): slow motion as a live ball arrives at the
   * goal mouth, and for a moment after the result.
   */
  timeScale(input: DirectorInput): number {
    const s = this.settings;
    if (input.replay || input.phase === 'aiming' || input.view === 'pass') return 1;
    if (input.phase === 'result')
      return this.resultTime < s.slowMoHold && input.result !== 'miss' ? s.slowMoScale : 1;
    const vx = input.ballVel.x;
    if (vx <= 1) return 1;
    const t = (input.goal.x - input.ball.x) / vx;
    const onFrame = Math.abs(input.ball.z - input.goal.z) < 6 && input.ball.y < 4;
    return t >= 0 && t < s.slowMoWindow && onFrame ? s.slowMoScale : 1;
  }

  /** Impact effects for an event of the moment (0 when the moment is a replay: no double hit). */
  impact(
    event: 'strike' | 'goal' | 'save' | 'post' | 'block',
    intensity: number,
    replay: boolean,
  ): ImpactEffects {
    const s = this.settings;
    const k = replay ? 0.5 : 1;
    switch (event) {
      case 'strike':
        return {
          hitStop: s.hitStopStrike * intensity * k,
          shake: s.shakeStrike * intensity * k,
          flash: 0,
        };
      case 'goal':
        return { hitStop: s.hitStopGoal * k, shake: s.shakeGoal * k, flash: s.flashGoal * k };
      case 'save':
        return {
          hitStop: s.hitStopSave * k,
          shake: Math.min(0.35, 0.012 * intensity) * k,
          flash: 0,
        };
      case 'post':
        return { hitStop: s.hitStopSave * k, shake: Math.min(0.5, 0.02 * intensity) * k, flash: 0 };
      case 'block':
        return { hitStop: 0, shake: Math.min(0.3, 0.01 * intensity) * k, flash: 0 };
    }
  }
}

/** Replay angles cycled from one replay to the next. */
export const REPLAY_ANGLES: readonly ReplayAngle[] = ['reverse', 'side', 'high', 'chase'];
