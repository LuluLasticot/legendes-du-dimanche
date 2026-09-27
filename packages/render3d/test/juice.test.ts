import { Rng } from '@legendes/engine';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ImpactParticles, surfaceParticles } from '../src/fx/particles.ts';
import { BallTrail, trailColour } from '../src/fx/trail.ts';

describe('trail colour', () => {
  it('goes from chalk to gold to hot orange with speed', () => {
    const slow = trailColour(5);
    const mid = trailColour(22);
    const fast = trailColour(40);
    expect(slow[2]).toBeGreaterThan(mid[2]);
    expect(fast[0]).toBeGreaterThan(mid[0]);
    expect(fast[2]).toBeLessThan(mid[2]);
  });
});

describe('BallTrail', () => {
  it('keeps at most `length` points and draws a ribbon', () => {
    const trail = new BallTrail(64);
    trail.length = 10;
    const cam = new THREE.Vector3(0, 2, -5);
    for (let i = 0; i < 30; i++) trail.push(new THREE.Vector3(i, 1, 0), 20, cam);
    expect(trail.mesh.geometry.drawRange.count).toBe((10 - 1) * 6);
    trail.clear();
    expect(trail.mesh.geometry.drawRange.count).toBe(0);
  });
});

describe('ImpactParticles', () => {
  it('bursts, falls and dies', () => {
    const particles = new ImpactParticles(200);
    particles.emit('grass', { x: 0, y: 0.1, z: 0 }, 30, Rng.create(1));
    expect(particles.alive).toBe(30);
    for (let i = 0; i < 180; i++) particles.update(1 / 60);
    expect(particles.alive).toBe(0);
  });

  it('is reproducible from the seed (replays show the same burst)', () => {
    const a = new ImpactParticles(50);
    const b = new ImpactParticles(50);
    a.emit('mud', { x: 1, y: 0, z: 2 }, 20, Rng.create(7));
    b.emit('mud', { x: 1, y: 0, z: 2 }, 20, Rng.create(7));
    for (let i = 0; i < 10; i++) {
      a.update(1 / 60);
      b.update(1 / 60);
    }
    const pa = a.points.geometry.getAttribute('position').array;
    const pb = b.points.geometry.getAttribute('position').array;
    expect(Array.from(pa)).toEqual(Array.from(pb));
  });

  it('scales bursts with the amount and recycles the pool', () => {
    const particles = new ImpactParticles(40);
    particles.amount = 0.5;
    particles.emit('chalk', { x: 0, y: 0, z: 0 }, 20, Rng.create(2));
    expect(particles.alive).toBe(10);
    particles.amount = 1;
    particles.emit('confetti', { x: 0, y: 0, z: 0 }, 100, Rng.create(3));
    expect(particles.alive).toBe(40);
  });

  it('maps surfaces to particle kinds', () => {
    expect(surfaceParticles('muddy')).toBe('mud');
    expect(surfaceParticles('artificial')).toBe('turf');
  });
});
