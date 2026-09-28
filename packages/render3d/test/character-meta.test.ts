import { describe, expect, it } from 'vitest';
import { characterMetaSchema } from '../src/players/character-asset.ts';

const clip = {
  duration: 1.5,
  rootTravel: [-0.78, 2.89],
  rest: { hands: [0, 0.9, 0.05], head: [0, 1.57, 0], hips: [0, 0.97, 0.03] },
  contact: { time: 0.717, foot: 'right', position: [0.1, 0.06, 0.4], footSpeed: 9.2 },
};

describe('character metadata schema', () => {
  it('accepts the converter output shape', () => {
    const meta = {
      version: 1,
      unitsPerMetre: 1,
      facing: '+Z',
      triangles: 8298,
      clips: { player_penalty_kick: clip },
    };
    expect(characterMetaSchema.safeParse(meta).success).toBe(true);
  });

  it('rejects malformed metadata (the scene then falls back to greybox figures)', () => {
    expect(
      characterMetaSchema.safeParse({ version: 2, facing: '+Z', triangles: 1, clips: {} }).success,
    ).toBe(false);
    expect(
      characterMetaSchema.safeParse({
        version: 1,
        facing: '+Z',
        triangles: 1,
        clips: { x: { ...clip, contact: { ...clip.contact, foot: 'middle' } } },
      }).success,
    ).toBe(false);
  });
});
