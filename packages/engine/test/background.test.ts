import { describe, expect, it } from 'vitest';
import { PITCH } from '../src/physics/constants.ts';
import { v3 } from '../src/physics/vec3.ts';
import {
  backgroundPlayers,
  penaltyKeeperFeet,
  penaltySpot,
  SITUATIONS,
} from '../src/moments/index.ts';

const ball = (distance: number, z: number) => v3(PITCH.goalLineX - distance, 0.11, z);
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);

describe('background players', () => {
  it('fills the pitch, with both kits, when asked for a dozen', () => {
    for (const situation of SITUATIONS) {
      const players = backgroundPlayers(situation, ball(20, -4), [], 12);
      expect(players.length).toBeGreaterThanOrEqual(8);
      expect(players.some((p) => p.side === 'attack')).toBe(true);
      expect(players.some((p) => p.side === 'defend')).toBe(true);
    }
  });

  it('never returns more than asked for, and none when asked for none', () => {
    expect(backgroundPlayers('free', ball(20, 0), [], 5)).toHaveLength(5);
    expect(backgroundPlayers('free', ball(20, 0), [], 0)).toEqual([]);
  });

  it('stays on the pitch, out of the way of the shot and clear of the players who play', () => {
    const busy = [v3(PITCH.goalLineX - 9.5, 0, 1), v3(PITCH.goalLineX - 0.1, 0, 0)];
    for (const z of [-15, -4, 0, 6, 18]) {
      for (const distance of [12, 20, 28]) {
        const origin = ball(distance, z);
        for (const p of backgroundPlayers('free-kick', origin, busy, 12)) {
          expect(Math.abs(p.feet.z)).toBeLessThan(PITCH.width / 2);
          expect(p.feet.x).toBeLessThanOrEqual(PITCH.goalLineX);
          for (const b of busy) expect(dist(p.feet, b)).toBeGreaterThanOrEqual(2.6);
          // Not on the straight line ball → goal centre.
          if (p.feet.x > origin.x) {
            const t = (p.feet.x - origin.x) / (PITCH.goalLineX - origin.x);
            expect(Math.abs(p.feet.z - origin.z * (1 - t))).toBeGreaterThan(2);
          }
        }
      }
    }
  });

  it('keeps everyone outside the area and the arc for a penalty', () => {
    const spot = penaltySpot();
    const players = backgroundPlayers('penalty', spot, [penaltyKeeperFeet(), spot], 12);
    expect(players.length).toBeGreaterThanOrEqual(8);
    for (const p of players) {
      expect(p.feet.x).toBeLessThanOrEqual(PITCH.goalLineX - 16.5);
      expect(dist(p.feet, spot)).toBeGreaterThanOrEqual(9.15);
    }
  });

  it('is deterministic and keeps players apart', () => {
    const a = backgroundPlayers('keeper', ball(18, 3), [], 12);
    expect(backgroundPlayers('keeper', ball(18, 3), [], 12)).toEqual(a);
    for (let i = 0; i < a.length; i++)
      for (let j = i + 1; j < a.length; j++)
        expect(dist(a[i]!.feet, a[j]!.feet)).toBeGreaterThanOrEqual(2.6);
  });
});
