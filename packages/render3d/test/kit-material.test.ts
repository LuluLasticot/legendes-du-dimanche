import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { describe, expect, it } from 'vitest';
import type { CharacterAsset } from '../src/players/character-asset.ts';
import {
  KIT_ZONES,
  KitMaterials,
  mergeKitZones,
  plainLook,
  prepareKitRig,
  type CharacterLook,
  type KitZone,
} from '../src/players/kit-material.ts';
import { createMannequinAsset } from '../src/players/mannequin.ts';

const asset = createMannequinAsset();
const rig = prepareKitRig(asset.scene);
const mesh = (() => {
  let found: THREE.SkinnedMesh | null = null;
  asset.scene.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) found = o;
  });
  return found as unknown as THREE.SkinnedMesh;
})();

describe('kit rig', () => {
  it('reads bones and vertices in the same units (metres), from the bones', () => {
    // Bound like a glTF: an asset in centimetres under a node scaled to metres.
    expect(rig.fromBones).toBe(true);
    expect(rig.height).toBeGreaterThan(1.6);
    expect(rig.height).toBeLessThan(2);
    expect(rig.hipY).toBeGreaterThan(0.8);
    expect(rig.neckY).toBeLessThan(rig.height);
  });

  it('finds the landmarks in body order, from the ankles up to the head', () => {
    expect(rig.ankleY).toBeLessThan(rig.hipY);
    expect(rig.hipY).toBeLessThan(rig.hipsY);
    expect(rig.hipsY).toBeLessThan(rig.chestY);
    expect(rig.chestY).toBeLessThan(rig.neckY);
    expect(rig.neckY).toBeLessThan(rig.headY);
  });

  it('runs once per asset (clones share the geometry)', () => {
    expect(prepareKitRig(asset.scene)).toBe(rig);
  });

  it('tells arms from the body, and measures along arms and legs', () => {
    const geometry = mesh.geometry;
    const rest = geometry.getAttribute('kitRest');
    const limb = geometry.getAttribute('kitLimb');
    const normal = geometry.getAttribute('kitNormal');
    expect(rest.count).toBe(geometry.getAttribute('position').count);
    let arms = 0;
    for (let i = 0; i < rest.count; i++) {
      const x = rest.getX(i);
      const y = rest.getY(i);
      const [arm, armT, legT] = [limb.getX(i), limb.getY(i), limb.getZ(i)];
      expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 3);
      // Out along the arms (T pose): arm bones, between shoulder and fingertips.
      if (Math.abs(x) > 0.3 && y > 1.3) {
        arms++;
        expect(arm).toBeGreaterThan(0.95);
        expect(armT).toBeGreaterThan(0.2);
        expect(armT).toBeLessThan(1.4);
      }
      // The trunk's middle is never arm.
      if (Math.abs(x) < 0.05 && y > 1.05 && y < 1.4) expect(arm).toBeLessThan(0.05);
      // Feet are past the ankle, the waist is above the hip joints.
      if (y < 0.06) expect(legT).toBeGreaterThan(0.95);
      if (y > 1) expect(legT).toBeLessThan(0);
    }
    expect(arms).toBeGreaterThan(100);
  });
});

/** Runs the material's shader patch on three's own standard shader. */
function patched(material: THREE.MeshStandardMaterial): { vertex: string; fragment: string } {
  const shader = {
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, undefined as unknown as THREE.WebGLRenderer);
  return { vertex: shader.vertexShader, fragment: shader.fragmentShader };
}

const look = (number: number | null): CharacterLook => ({ ...plainLook(0xffffff, 0), number });

describe('kit materials', () => {
  it("find their anchors in three's standard shader (a three upgrade would show here)", () => {
    const materials = new KitMaterials(rig, look(9));
    const { vertex, fragment } = patched(materials.body);
    expect(vertex).toContain('vKitLimb = kitLimb;');
    expect(fragment).toContain('diffuseColor.rgb = kitColour(kitRough);');
    expect(fragment).toContain('roughnessFactor = kitRough;');
    // Same program for every character, whatever its colours.
    expect(materials.body.customProgramCacheKey()).toBe(materials.joints.customProgramCacheKey());
  });

  it('split the number into the digits printed on the back', () => {
    const digits = (n: number | null): [number, number] => {
      const materials = new KitMaterials(rig, look(n));
      const v = (materials.body.userData['kNumber'] as { value: THREE.Vector4 }).value;
      return [v.x, v.y];
    };
    expect(digits(7)).toEqual([-1, 7]);
    expect(digits(10)).toEqual([1, 0]);
    expect(digits(23)).toEqual([2, 3]);
    expect(digits(null)).toEqual([-1, -1]);
  });

  it('tint only the joint pieces', () => {
    const materials = new KitMaterials(rig, look(4));
    const joint = (m: THREE.MeshStandardMaterial): number =>
      (m.userData['kNumber'] as { value: THREE.Vector4 }).value.w;
    expect(joint(materials.body)).toBe(0);
    expect(joint(materials.joints)).toBe(1);
  });
});

describe('a dressed character', () => {
  it('keeps its size and its skeleton (the rig is read, never posed)', async () => {
    const { Character } = await import('../src/players/character.ts');
    const hips = asset.scene.getObjectByName('mixamorigHips')!;
    const before = hips.matrix.clone();
    const character = new Character(asset, look(8));
    character.update(0);
    expect(hips.matrix.equals(before)).toBe(true);
    // Feet on the ground, head at a man's height (1.8 m mannequin).
    expect(character.part('head').y).toBeGreaterThan(1.4);
    expect(character.part('head').y).toBeLessThan(1.9);
    expect(character.part('hips').y).toBeGreaterThan(0.8);
    character.dispose();
  });
});

// ─── Zoned assets (the modelled footballer, D-039) ──────────────────────────────────────────

/** Zone of a mannequin triangle from its centre (metres), standing in for the model's materials. */
function zoneAt(x: number, y: number): KitZone {
  const ax = Math.abs(x);
  if (ax > 0.7) return 'hands';
  if (ax > 0.32) return 'skin_forearms';
  if (ax > 0.2 && y > 1.3) return 'kit_sleeves';
  if (y > 1.72) return 'hair';
  if (y > 1.62) return 'skin';
  if (y > 1.47) return 'kit_collar';
  if (y > 0.95) return 'kit_shirt';
  if (y > 0.6) return 'kit_shorts';
  if (y > 0.45) return 'skin';
  if (y > 0.42) return 'kit_socks_cuff';
  if (y > 0.12) return 'kit_socks';
  return 'kit_boots';
}

/**
 * The mannequin cut into zones the way a modelled asset arrives: `'meshes'` = one skinned mesh
 * per material (a glTF mesh with one primitive per material), `'groups'` = one mesh with groups.
 */
function zonedAsset(form: 'meshes' | 'groups'): { asset: CharacterAsset; triangles: number } {
  const base = createMannequinAsset();
  const scene = cloneSkinned(base.scene);
  let source: THREE.SkinnedMesh | null = null;
  scene.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) source = o;
  });
  const mesh = source as unknown as THREE.SkinnedMesh;
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.index!;
  const byZone = new Map<KitZone, number[]>();
  const p = new THREE.Vector3();
  for (let t = 0; t < index.count; t += 3) {
    p.set(0, 0, 0);
    for (let k = 0; k < 3; k++) {
      const i = index.getX(t + k);
      p.x += position.getX(i) / 300;
      p.y += position.getY(i) / 300;
    }
    const zone = zoneAt(p.x, p.y);
    const list = byZone.get(zone) ?? [];
    list.push(index.getX(t), index.getX(t + 1), index.getX(t + 2));
    byZone.set(zone, list);
  }
  const geometryWith = (indices: number[]): THREE.BufferGeometry => {
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'skinIndex', 'skinWeight']) {
      g.setAttribute(name, mesh.geometry.getAttribute(name));
    }
    g.setIndex(indices);
    return g;
  };
  const material = (zone: KitZone) => new THREE.MeshStandardMaterial({ name: zone });
  const parts: THREE.SkinnedMesh[] = [];
  if (form === 'meshes') {
    for (const [zone, indices] of byZone) {
      parts.push(new THREE.SkinnedMesh(geometryWith(indices), material(zone)));
    }
  } else {
    const all: number[] = [];
    const materials: THREE.Material[] = [];
    const geometry = geometryWith([]);
    for (const [zone, indices] of byZone) {
      geometry.addGroup(all.length, indices.length, materials.length);
      materials.push(material(zone));
      all.push(...indices);
    }
    geometry.setIndex(all);
    parts.push(new THREE.SkinnedMesh(geometry, materials));
  }
  for (const part of parts) {
    part.name = 'Footballer';
    mesh.parent!.add(part);
    part.bind(mesh.skeleton, mesh.bindMatrix.clone());
  }
  mesh.removeFromParent();
  return { asset: { ...base, scene }, triangles: index.count / 3 };
}

function skinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const found: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) found.push(o as THREE.SkinnedMesh);
  });
  return found;
}

describe('a modelled asset with zones', () => {
  for (const form of ['meshes', 'groups'] as const) {
    it(`merges its zones into one mesh with a zone per vertex (${form})`, () => {
      const { asset: zoned, triangles } = zonedAsset(form);
      expect(mergeKitZones(zoned.scene)).toBe(true);
      const [body, ...others] = skinnedMeshes(zoned.scene);
      expect(others).toHaveLength(0);
      expect(Array.isArray(body!.material)).toBe(false);
      const geometry = body!.geometry;
      const zone = geometry.getAttribute('kitZone');
      const position = geometry.getAttribute('position');
      const idx = geometry.index!;
      expect(idx.count / 3).toBe(triangles);
      // Every triangle keeps the zone of the material it came from, on its three vertices.
      for (let t = 0; t < idx.count; t += 3) {
        const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
        const x = (position.getX(a) + position.getX(b) + position.getX(c)) / 300;
        const y = (position.getY(a) + position.getY(b) + position.getY(c)) / 300;
        const expected = KIT_ZONES.indexOf(zoneAt(x, y));
        expect([zone.getX(a), zone.getX(b), zone.getX(c)]).toEqual([expected, expected, expected]);
      }
      // Merging twice is a no-op.
      expect(mergeKitZones(zoned.scene)).toBe(true);
      expect(skinnedMeshes(zoned.scene)).toHaveLength(1);
    });
  }

  it('measures the kit on the model: sleeve hem, end of the forearm, bottom of the collar', () => {
    const { asset: zoned } = zonedAsset('meshes');
    const zonedRig = prepareKitRig(zoned.scene);
    expect(zonedRig.zones).toBe(true);
    expect(zonedRig.fromBones).toBe(true);
    // Sleeves stop where the forearms start (|x| 0.32 m), forearms at the hands (0.7 m).
    expect(zonedRig.sleeveEnd).toBeGreaterThan(0.2);
    expect(zonedRig.sleeveEnd).toBeLessThan(zonedRig.forearmEnd);
    expect(zonedRig.forearmEnd).toBeLessThan(1.05);
    expect(zonedRig.collarBottom).toBeGreaterThan(zonedRig.chestY);
    expect(zonedRig.collarBottom).toBeLessThan(zonedRig.headY);
  });

  it('switches the shader to its zones, with its own program', () => {
    const { asset: zoned } = zonedAsset('meshes');
    const zoneMaterials = new KitMaterials(prepareKitRig(zoned.scene), look(5));
    const plain = new KitMaterials(rig, look(5));
    expect(zoneMaterials.body.defines).toHaveProperty('KIT_ZONES');
    expect(plain.body.defines ?? {}).not.toHaveProperty('KIT_ZONES');
    expect(zoneMaterials.body.customProgramCacheKey()).not.toBe(plain.body.customProgramCacheKey());
    const { vertex, fragment } = patched(zoneMaterials.body);
    expect(vertex).toContain('vKitZone = kitZone;');
    expect(fragment).toContain('float zone = floor(vKitZone + 0.5);');
  });

  it('leaves an asset without zones as it is (fallback: Y Bot, mannequin)', () => {
    const scene = cloneSkinned(createMannequinAsset().scene);
    const before = skinnedMeshes(scene);
    expect(mergeKitZones(scene)).toBe(false);
    expect(skinnedMeshes(scene)).toEqual(before);
    expect(rig.zones).toBe(false);
  });

  it('dresses a zoned character in one draw call, at its size', async () => {
    const { Character } = await import('../src/players/character.ts');
    const { asset: zoned } = zonedAsset('meshes');
    const character = new Character(zoned, look(10));
    character.update(0);
    const meshes = skinnedMeshes(character.root);
    expect(meshes).toHaveLength(1);
    expect(meshes[0]!.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(character.part('head').y).toBeGreaterThan(1.4);
    expect(character.part('head').y).toBeLessThan(1.9);
    character.dispose();
  });
});
