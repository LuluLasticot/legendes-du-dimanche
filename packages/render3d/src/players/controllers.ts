// Animation controllers: they read the engine's state and drive a Character (clip choice, timing,
// anchoring). The engine is the truth; the controllers only make it look right.

import type { moments } from '@legendes/engine';
import { TICK_DT } from '@legendes/engine';
import * as THREE from 'three';
import { Character } from './character.ts';

const smooth = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const lerpPoint = (a: Point, b: Point, t: number): THREE.Vector3 =>
  new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

// ─── Shooter ──────────────────────────────────────────────────────────────────

export type ShooterReaction = 'goal' | 'miss';

const CELEBRATIONS = [
  'celebration_victory',
  'celebration_fist_pump',
  'celebration_dance',
  'celebration_phone',
] as const;

export class ShooterController {
  readonly character: Character;
  private strike: {
    clip: string;
    contactTime: number;
    rate: number;
    ball: THREE.Vector3;
    yaw: number;
    /** Root velocity of the removed run-up (world, m per clip second). */
    velocity: THREE.Vector3;
    final: THREE.Vector3;
    elapsed: number;
    /** Clip time the strike started at (first-time strikes start close to contact). */
    from: number;
    locked: THREE.Vector3 | null;
  } | null = null;
  private rest: { position: THREE.Vector3; yaw: number } | null = null;

  constructor(character: Character) {
    this.character = character;
  }

  /** Where the run-up starts for a strike from `ball` along `direction` (unit, horizontal). */
  private runUpStart(
    ball: Point,
    direction: Point,
  ): { position: THREE.Vector3; yaw: number } | null {
    const meta = this.character.clipMeta('player_penalty_kick');
    const contact = meta?.contact;
    if (!meta || !contact) return null;
    const yaw = Character.yawFacing(direction.x, direction.z);
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const velocity = new THREE.Vector3(meta.rootTravel[0], 0, meta.rootTravel[1])
      .applyQuaternion(rotation)
      .divideScalar(meta.duration);
    const toe = new THREE.Vector3(...contact.position).applyQuaternion(rotation);
    const final = new THREE.Vector3(
      ball.x - direction.x * 0.1 - toe.x,
      0,
      ball.z - direction.z * 0.1 - toe.z,
    );
    return { position: final.addScaledVector(velocity, -contact.time), yaw };
  }

  /** Waits at the start of his run-up, facing the ball (before the gesture). */
  standAt(ball: Point, towards: Point): void {
    const dx = towards.x - ball.x;
    const dz = towards.z - ball.z;
    const len = Math.hypot(dx, dz) || 1;
    const start = this.runUpStart(ball, { x: dx / len, y: 0, z: dz / len });
    const position =
      start?.position ?? new THREE.Vector3(ball.x - (dx / len) * 2, 0, ball.z - (dz / len) * 2);
    this.rest = { position, yaw: Character.yawFacing(ball.x - position.x, ball.z - position.z) };
    this.strike = null;
    this.character.loop('player_idle', 0.25);
  }

  /**
   * Running (receiver's run): feet on the engine's position, facing the run (or `look` when
   * standing), run or sprint cycle by speed.
   */
  follow(feet: Point, vel: Point, look: Point): void {
    const speed = Math.hypot(vel.x, vel.z);
    const yaw =
      speed > 0.5
        ? Character.yawFacing(vel.x, vel.z)
        : Character.yawFacing(look.x - feet.x, look.z - feet.z);
    this.strike = null;
    this.rest = { position: new THREE.Vector3(feet.x, 0, feet.z), yaw };
    if (speed > 6) this.character.loop('player_sprint', 0.15, speed / 8);
    else if (speed > 0.5) this.character.loop('player_run', 0.15, speed / 5.5);
    else this.character.loop('player_idle', 0.25);
  }

  /**
   * Starts the strike towards `direction`: full run-up by default, or (`lead`, seconds) only the
   * last part of the swing, for a first-time shot on a moving ball. Returns the real-time delay
   * (seconds at rate 1 of the scene) until the foot meets the ball: the physics starts then.
   */
  startStrike(
    ball: Point,
    direction: Point,
    power: number,
    options: { clip?: string; lead?: number } = {},
  ): number {
    const clip = options.clip ?? 'player_penalty_kick';
    const meta = this.character.clipMeta(clip);
    const contact = meta?.contact;
    if (!meta || !contact) return 0;
    const rate = 1.15 + power * 0.25;
    const from = options.lead === undefined ? 0 : Math.max(0, contact.time - options.lead * rate);
    const yaw = Character.yawFacing(direction.x, direction.z);
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    // Removed run-up travel, as a constant velocity through the clip.
    const velocity = new THREE.Vector3(meta.rootTravel[0], 0, meta.rootTravel[1])
      .applyQuaternion(rotation)
      .divideScalar(meta.duration);
    // Root at contact so that the kicking toe (character-local at contact) sits on the ball.
    const toe = new THREE.Vector3(...contact.position).applyQuaternion(rotation);
    const ballPoint = new THREE.Vector3(
      ball.x - direction.x * 0.1,
      0.06,
      ball.z - direction.z * 0.1,
    );
    const final = new THREE.Vector3(ballPoint.x - toe.x, 0, ballPoint.z - toe.z);
    this.strike = {
      clip,
      contactTime: contact.time,
      rate,
      ball: ballPoint,
      yaw,
      velocity,
      final,
      elapsed: from,
      from,
      locked: null,
    };
    this.character.play(clip, { fade: from > 0 ? 0.05 : 0.12, timeScale: rate, startAt: from });
    return (contact.time - from) / rate;
  }

  react(kind: ShooterReaction, pick: number): void {
    if (kind === 'goal') {
      const clip =
        CELEBRATIONS[Math.floor(pick * CELEBRATIONS.length) % CELEBRATIONS.length] ??
        'celebration_victory';
      this.character.play(clip, { fade: 0.3, loop: true });
    } else {
      this.character.play('reaction_disappointed', { fade: 0.3 });
    }
  }

  update(dt: number): void {
    const c = this.character;
    const s = this.strike;
    if (!s) {
      if (this.rest) c.place(this.rest.position, this.rest.yaw);
      c.update(dt);
      return;
    }
    s.elapsed += dt * s.rate;
    const t = Math.min(c.time, s.elapsed);
    const base = s.final.clone().addScaledVector(s.velocity, t - s.contactTime);
    if (this.rest) base.lerp(this.rest.position, 1 - smooth((t - s.from) / 0.25));
    c.place(base, s.yaw);
    c.update(dt);
    if (s.locked) {
      c.root.position.add(s.locked);
      c.root.updateMatrixWorld(true);
    } else {
      // Recalage: the run-up bends towards the ball so the toe meets it exactly at contact.
      const w = smooth((t - s.from) / Math.max(1e-3, s.contactTime - s.from));
      const before = c.root.position.clone();
      c.anchor('rightToe', s.ball, w, false);
      if (t >= s.contactTime) s.locked = c.root.position.clone().sub(before);
    }
  }
}

// ─── Goalkeeper ───────────────────────────────────────────────────────────────

/** The keeper faces the field (−X). */
const KEEPER_YAW = Character.yawFacing(-1, 0);

export class KeeperController {
  readonly character: Character;
  private lastPhase: moments.KeeperPhase | null = null;
  private action: 'idle' | 'sidestep' | 'dive' | 'standing' | 'holding' | 'down' | 'reaction' =
    'idle';
  private diveStart = 0;
  private diveTicks = 1;
  private reacted = false;

  constructor(character: Character) {
    this.character = character;
  }

  reset(): void {
    this.lastPhase = null;
    this.action = 'idle';
    this.reacted = false;
    this.character.loop('gk_idle', 0.2);
  }

  /** Dive clip going to world ±Z: picked from the clips' own root travel (mirror-proof). */
  private diveClip(towardsPositiveZ: boolean, low: boolean): string {
    const names = low
      ? ['gk_dive_low_left', 'gk_dive_low_right']
      : ['gk_dive_left', 'gk_dive_right'];
    const rotation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      KEEPER_YAW,
    );
    for (const name of names) {
      const meta = this.character.clipMeta(name);
      if (!meta) continue;
      const travel = new THREE.Vector3(meta.rootTravel[0], 0, meta.rootTravel[1]).applyQuaternion(
        rotation,
      );
      if (travel.z > 0 === towardsPositiveZ) return name;
    }
    return names[0] ?? 'gk_dive_left';
  }

  /** Conceded a goal: the keeper shows it. */
  concede(): void {
    if (this.reacted) return;
    this.reacted = true;
    this.action = 'reaction';
    this.character.play('reaction_disappointed', { fade: 0.4 });
  }

  update(
    previous: moments.KeeperState,
    current: moments.KeeperState,
    tick: number,
    alpha: number,
    dt: number,
  ): void {
    const c = this.character;
    const feet = lerpPoint(previous.feet, current.feet, alpha);
    const hands = lerpPoint(previous.hands, current.hands, alpha);
    const phase = current.phase;

    if (phase !== this.lastPhase) {
      if (phase === 'diving' && current.target) {
        const target = current.target;
        const low = target.y < 0.8;
        const high = target.y > 1.9 && Math.abs(target.z - current.feet.z) < 1.1;
        const clip = high ? 'gk_jump_catch' : this.diveClip(target.z > current.feet.z, low);
        const extension = c.clipMeta(clip)?.extension?.time ?? 0.8;
        this.diveStart = current.diveStartTick;
        this.diveTicks = Math.max(1, current.diveTicks);
        c.play(clip, { fade: 0.08, timeScale: extension / (this.diveTicks * TICK_DT) });
        this.action = 'dive';
      } else if (phase === 'holding' && this.action !== 'dive') {
        this.action = 'holding';
      } else if (phase === 'set') {
        this.reset();
      }
      this.lastPhase = phase;
    }

    // Standing save: time the catch / scoop / jump so its extension meets the ball.
    if (
      phase === 'tracking' &&
      current.arrivalTick !== null &&
      current.target &&
      this.action !== 'standing'
    ) {
      const gap = Math.hypot(
        current.target.y - current.hands.y,
        current.target.z - current.hands.z,
      );
      const clip =
        current.target.y < 0.6 ? 'gk_scoop' : current.target.y > 1.9 ? 'gk_jump_catch' : 'gk_catch';
      const extension = c.clipMeta(clip)?.extension?.time ?? 0.4;
      const left = (current.arrivalTick - tick) * TICK_DT;
      if (gap < 0.55 && left <= extension && left > 0) {
        c.play(clip, { fade: 0.08, timeScale: extension / left });
        this.action = 'standing';
      }
    }

    if (this.action === 'idle' || this.action === 'sidestep') {
      const moving = Math.abs(current.feet.z - previous.feet.z) > 1e-4;
      if (phase === 'tracking' && moving) {
        // Sidestep clip steps to the character's left (+X local = world +Z when facing −X).
        c.loop('gk_sidestep', 0.12, current.feet.z > previous.feet.z ? 1 : -1);
        this.action = 'sidestep';
      } else {
        c.loop('gk_idle', 0.2);
        this.action = 'idle';
      }
    }

    c.place(new THREE.Vector3(feet.x, 0, feet.z), KEEPER_YAW);
    c.update(dt);
    // Gloves on the engine's hands while saving (what you see is what was simulated).
    if (this.action === 'dive') {
      const p = (tick - this.diveStart) / this.diveTicks;
      c.anchor('hands', hands, smooth(p * 1.3));
    } else if (this.action === 'standing' || this.action === 'holding') {
      c.anchor('hands', hands, 0.85);
    }
  }
}

// ─── Defenders ────────────────────────────────────────────────────────────────

export class DefenderController {
  readonly character: Character;
  private jumped = false;
  private tackled = false;

  constructor(character: Character) {
    this.character = character;
  }

  reset(): void {
    this.jumped = false;
    this.tackled = false;
    this.character.loop('player_idle', 0.2);
  }

  update(
    previous: moments.DefenderState,
    current: moments.DefenderState,
    ball: Point,
    alpha: number,
    dt: number,
    jumpApex: number,
  ): void {
    const c = this.character;
    const feet = lerpPoint(previous.feet, current.feet, alpha);
    const speed = Math.hypot(current.vel.x, current.vel.z);

    if (current.role === 'wall') {
      if (current.jumpStartTick !== null && !this.jumped) {
        const apex = c.clipMeta('defender_jump')?.apex?.time ?? 0.6;
        c.play('defender_jump', { fade: 0.06, timeScale: apex / Math.max(0.05, jumpApex) });
        this.jumped = true;
      } else if (!this.jumped) {
        c.loop('player_idle', 0.2);
      }
    } else if (current.lunging && !this.tackled && speed > 0.5) {
      c.play('defender_slide_tackle', { fade: 0.08, timeScale: 1.4 });
      this.tackled = true;
    } else if (!this.tackled) {
      if (speed > 6) c.loop('player_sprint', 0.15, speed / 8);
      else if (speed > 0.5) c.loop('player_run', 0.15, speed / 5.5);
      else c.loop('player_idle', 0.25);
    }

    // Face the run, or the ball when standing.
    const yaw =
      speed > 0.5
        ? Character.yawFacing(current.vel.x, current.vel.z)
        : Character.yawFacing(ball.x - feet.x, ball.z - feet.z);
    c.place(new THREE.Vector3(feet.x, 0, feet.z), yaw);
    c.update(dt);
  }
}
