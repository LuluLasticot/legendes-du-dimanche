import { describe, expect, it } from 'vitest';
import { impactAmplitude, impactLifetime, netOffset } from '../src/stadium/net-field.ts';
import { MARKING, pitchMarkings } from '../src/stadium/markings.ts';

describe('pitch markings', () => {
  const marks = pitchMarkings(105, 68);

  it('has penalty spots at 11 m and the centre spot', () => {
    const spots = marks
      .filter((m) => m.kind === 'spot')
      .map((m) => (m.kind === 'spot' ? m.at[0] : NaN));
    expect(spots.sort((a, b) => a - b)).toEqual([-41.5, 0, 41.5]);
  });

  it('penalty arcs only show outside the penalty area', () => {
    for (const m of marks) {
      if (m.kind !== 'arc' || m.radius !== MARKING.penaltyArcRadius || m.centre[0] === 0) continue;
      const areaLine = Math.sign(m.centre[0]) * (52.5 - MARKING.penaltyAreaDepth);
      for (const a of [m.start, m.end]) {
        expect(m.centre[0] + Math.cos(a) * m.radius).toBeCloseTo(areaLine, 9);
      }
    }
  });

  it('every line stays on the pitch', () => {
    for (const m of marks) {
      if (m.kind !== 'line') continue;
      for (const [x, z] of [m.a, m.b]) {
        expect(Math.abs(x)).toBeLessThanOrEqual(52.5 + 1e-9);
        expect(Math.abs(z)).toBeLessThanOrEqual(34 + 1e-9);
      }
    }
  });
});

describe('net field', () => {
  const impact = { x: 54.5, y: 1, z: 0, amplitude: impactAmplitude(20), time: 0 };

  it('bulges most at the impact point, less far away', () => {
    const at = netOffset(54.5, 1, 0, [impact], 0.01);
    const far = netOffset(54.5, 1, 2.5, [impact], 0.01);
    expect(at).toBeGreaterThan(0.3);
    expect(Math.abs(far)).toBeLessThan(at * 0.05);
  });

  it('rings out and settles', () => {
    expect(Math.abs(netOffset(54.5, 1, 0, [impact], impactLifetime()))).toBeLessThan(
      impact.amplitude * 0.002,
    );
    expect(netOffset(54.5, 1, 0, [impact], -0.1)).toBe(0);
  });

  it('caps the amplitude of very hard shots', () => {
    expect(impactAmplitude(100)).toBe(0.6);
  });
});
