import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  CameraDirector,
  DEFAULT_DIRECTOR_SETTINGS,
  VectorSpring,
  type DirectorInput,
} from '../src/camera/director.ts';

const base: DirectorInput = {
  phase: 'aiming',
  replay: null,
  ball: { x: 32.5, y: 0.11, z: -4 },
  ballVel: { x: 0, y: 0, z: 0 },
  spot: { x: 32.5, y: 0.11, z: -4 },
  goal: { x: 52.5, y: 0, z: 0 },
  keeper: { x: 51.5, y: 1.7, z: -0.3 },
  result: null,
};

describe('VectorSpring', () => {
  it('settles on its target without overshoot (critically damped)', () => {
    const spring = new VectorSpring(6);
    const target = new THREE.Vector3(10, 0, 0);
    let max = 0;
    for (let i = 0; i < 180; i++) max = Math.max(max, spring.step(target, 1 / 60).x);
    expect(spring.value.x).toBeCloseTo(10, 2);
    expect(max).toBeLessThanOrEqual(10 + 1e-6);
  });
});

describe('CameraDirector', () => {
  it('frames the aim from behind the ball, looking at the goal', () => {
    const director = new CameraDirector();
    const pose = director.update(1 / 60, base);
    expect(pose.shot).toBe('aim');
    expect(pose.position.x).toBeLessThan(base.spot.x);
    expect(pose.target.x).toBeCloseTo(base.goal.x, 6);
  });

  it('chases the ball in flight, from behind and above it', () => {
    const director = new CameraDirector();
    director.update(1 / 60, base);
    const flying: DirectorInput = {
      ...base,
      phase: 'flying',
      ball: { x: 40, y: 1.5, z: -2 },
      ballVel: { x: 25, y: 2, z: 3 },
    };
    let pose = director.update(1 / 60, flying);
    for (let i = 0; i < 120; i++) pose = director.update(1 / 60, flying);
    expect(pose.shot).toBe('chase');
    expect(pose.position.x).toBeLessThan(40);
    expect(pose.position.y).toBeGreaterThan(1.5);
  });

  it('cuts to the result shots: orbit for a goal, keeper close-up for a save', () => {
    const director = new CameraDirector();
    expect(director.pickShot({ ...base, phase: 'result', result: 'goal' })).toBe('orbit');
    expect(director.pickShot({ ...base, phase: 'result', result: 'saved' })).toBe('keeper');
    expect(director.pickShot({ ...base, phase: 'result', result: 'miss' })).toBe('hold');
  });

  it('replays use their own angle, with a hard cut', () => {
    const director = new CameraDirector();
    director.update(1 / 60, { ...base, phase: 'flying', ballVel: { x: 20, y: 3, z: 0 } });
    const input: DirectorInput = {
      ...base,
      phase: 'flying',
      replay: 'reverse',
      ball: { x: 45, y: 1, z: 0 },
      ballVel: { x: 20, y: 0, z: 0 },
    };
    const pose = director.update(1 / 60, input);
    expect(pose.shot).toBe('reverse');
    // Hard cut: exactly on the wanted framing on the first frame.
    expect(pose.position.x).toBeCloseTo(base.goal.x + DEFAULT_DIRECTOR_SETTINGS.reverseDistance, 6);
  });

  it('slows time only as a live ball reaches the goal mouth', () => {
    const director = new CameraDirector();
    const far: DirectorInput = {
      ...base,
      phase: 'flying',
      ball: { x: 35, y: 1, z: 0 },
      ballVel: { x: 25, y: 0, z: 0 },
    };
    const close: DirectorInput = { ...far, ball: { x: 47, y: 1, z: 0 } };
    const wide: DirectorInput = { ...close, ball: { x: 47, y: 1, z: 15 } };
    expect(director.timeScale(far)).toBe(1);
    expect(director.timeScale(close)).toBe(DEFAULT_DIRECTOR_SETTINGS.slowMoScale);
    expect(director.timeScale(wide)).toBe(1);
    expect(director.timeScale({ ...close, replay: 'side' })).toBe(1);
  });

  it('halves impact effects during replays', () => {
    const director = new CameraDirector();
    const live = director.impact('goal', 1, false);
    const replay = director.impact('goal', 1, true);
    expect(replay.hitStop).toBeCloseTo(live.hitStop / 2, 9);
    expect(live.flash).toBeGreaterThan(0);
  });

  it('fixed modes override the automatic choice', () => {
    const director = new CameraDirector({ ...DEFAULT_DIRECTOR_SETTINGS, mode: 'side' });
    expect(director.pickShot({ ...base, phase: 'flying' })).toBe('side');
    expect(director.pickShot({ ...base, phase: 'aiming' })).toBe('aim');
  });
});
