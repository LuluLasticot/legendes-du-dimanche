// The card's outline in 3D comes from the very path the 2D card draws (`silhouette(0)` of
// @legendes/ui): one shape for both. Only absolute M, L, H, V, Q and Z are needed.

import * as THREE from 'three';

/** Card units (250 × 350 box) per world unit: the 3D card is 2.5 × 3.5. */
export const CARD_UNITS_PER_WORLD = 100;

/** Parses an absolute SVG path (M L H V Q Z) into a shape centred on the origin, y up. */
export function shapeFromPath(d: string, width: number, height: number): THREE.Shape {
  const shape = new THREE.Shape();
  const tokens = d.match(/[MLHVQZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  const k = 1 / CARD_UNITS_PER_WORLD;
  const X = (x: number): number => (x - width / 2) * k;
  const Y = (y: number): number => (height / 2 - y) * k;
  let i = 0;
  let cx = 0;
  let cy = 0;
  const num = (): number => Number(tokens[i++]);
  while (i < tokens.length) {
    const command = tokens[i++];
    switch (command) {
      case 'M':
        cx = num();
        cy = num();
        shape.moveTo(X(cx), Y(cy));
        break;
      case 'L':
        cx = num();
        cy = num();
        shape.lineTo(X(cx), Y(cy));
        break;
      case 'H':
        cx = num();
        shape.lineTo(X(cx), Y(cy));
        break;
      case 'V':
        cy = num();
        shape.lineTo(X(cx), Y(cy));
        break;
      case 'Q': {
        const qx = num();
        const qy = num();
        cx = num();
        cy = num();
        shape.quadraticCurveTo(X(qx), Y(qy), X(cx), Y(cy));
        break;
      }
      case 'Z':
      case 'z':
        shape.closePath();
        break;
      default:
        throw new Error(`Unsupported path command: ${command ?? ''}`);
    }
  }
  return shape;
}

/** Flat face with UVs spanning the card's box. */
export function faceGeometry(
  shape: THREE.Shape,
  width: number,
  height: number,
): THREE.BufferGeometry {
  const geometry = new THREE.ShapeGeometry(shape, 8);
  const position = geometry.attributes['position'] as THREE.BufferAttribute;
  const uv = geometry.attributes['uv'] as THREE.BufferAttribute;
  const w = width / CARD_UNITS_PER_WORLD;
  const h = height / CARD_UNITS_PER_WORLD;
  for (let i = 0; i < position.count; i++) {
    uv.setXY(i, (position.getX(i) + w / 2) / w, (position.getY(i) + h / 2) / h);
  }
  uv.needsUpdate = true;
  return geometry;
}

/** The card's edge: a strip around the outline, `depth` thick. */
export function edgeGeometry(shape: THREE.Shape, depth: number): THREE.BufferGeometry {
  const points = shape.getPoints(8);
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && first.distanceTo(last) < 1e-6) points.pop();
  const n = points.length;
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const p = points[i % n] as THREE.Vector2;
    const prev = points[(i - 1 + n) % n] as THREE.Vector2;
    const next = points[(i + 1) % n] as THREE.Vector2;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const l = Math.hypot(tx, ty) || 1;
    pos.push(p.x, p.y, depth / 2, p.x, p.y, -depth / 2);
    nor.push(ty / l, -tx / l, 0, ty / l, -tx / l, 0);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geometry.setIndex(idx);
  return geometry;
}
