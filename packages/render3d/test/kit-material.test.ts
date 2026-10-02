import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  KitMaterials,
  plainLook,
  prepareKitRig,
  type CharacterLook,
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
