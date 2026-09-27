// Minimal immutable 3D vectors for the simulation. World frame (metres, right-handed, Y up):
// origin at the centre spot, +X towards the attacked goal, +Y up, +Z to the attacker's right.

import { hypot3 } from '../math/index.ts';

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

export function v3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

/** a + b·s */
export function addScaled(a: Vec3, b: Vec3, s: number): Vec3 {
  return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

export function length(a: Vec3): number {
  return hypot3(a.x, a.y, a.z);
}

/** Unit vector, or zero for a (near-)zero vector. */
export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l > 1e-12 ? scale(a, 1 / l) : ZERO;
}

export function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

/** Horizontal (XZ) speed. */
export function horizontalLength(a: Vec3): number {
  return hypot3(a.x, 0, a.z);
}
