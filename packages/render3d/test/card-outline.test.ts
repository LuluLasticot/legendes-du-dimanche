import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { edgeGeometry, faceGeometry, shapeFromPath } from '../src/cards/outline.ts';

/** `silhouette(0)` of @legendes/ui: ticket-cut top corners, a notch, rounded bottom corners. */
const OUTLINE =
  'M0 24 L24 0 H96 L103 7 H147 L154 0 H226 L250 24 V332 Q250 350 232 350 H18 Q0 350 0 332 Z';

describe('card outline', () => {
  const shape = shapeFromPath(OUTLINE, 250, 350);

  it('maps the 250 × 350 box to a 2.5 × 3.5 card centred on the origin, y up', () => {
    const box = new THREE.Box2().setFromPoints(shape.getPoints(8));
    expect(box.min.x).toBeCloseTo(-1.25);
    expect(box.max.x).toBeCloseTo(1.25);
    expect(box.min.y).toBeCloseTo(-1.75);
    expect(box.max.y).toBeCloseTo(1.75);
    // The notch dips below the top edge in the middle.
    const notch = shape.getPoints(8).filter((p) => Math.abs(Math.abs(p.x) - 0.22) < 1e-6);
    expect(notch.map((p) => p.y)).toEqual([expect.closeTo(1.68), expect.closeTo(1.68)]);
  });

  it('builds a face whose UVs span the card and an edge that closes on itself', () => {
    const face = faceGeometry(shape, 250, 350);
    const uv = face.attributes['uv'] as THREE.BufferAttribute;
    const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
    const vs = Array.from({ length: uv.count }, (_, i) => uv.getY(i));
    expect(Math.min(...us)).toBeCloseTo(0);
    expect(Math.max(...us)).toBeCloseTo(1);
    expect(Math.min(...vs)).toBeCloseTo(0);
    expect(Math.max(...vs)).toBeCloseTo(1);
    const edge = edgeGeometry(shape, 0.02);
    const n = (edge.attributes['position'] as THREE.BufferAttribute).count;
    expect(edge.index?.count).toBe(((n - 2) / 2) * 6);
  });

  it('rejects path commands it does not know', () => {
    expect(() => shapeFromPath('M0 0 C1 1 2 2 3 3 Z', 250, 350)).toThrow(/Unsupported/);
  });
});
