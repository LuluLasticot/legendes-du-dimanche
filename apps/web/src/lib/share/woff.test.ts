import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { woffToSfnt } from './woff';

const FONTS = join(__dirname, '../../../public/fonts');

describe('WOFF to TrueType', () => {
  it('unpacks every font of the game into a font with the same tables', () => {
    const files = readdirSync(FONTS).filter((f) => f.endsWith('.woff'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const woff = readFileSync(join(FONTS, file));
      const sfnt = woffToSfnt(woff);
      const out = new DataView(sfnt.buffer);
      // Same flavour (TrueType 0x00010000 or 'OTTO') and number of tables as the WOFF header.
      expect(out.getUint32(0), file).toBe(woff.readUInt32BE(4));
      expect(out.getUint16(4), file).toBe(woff.readUInt16BE(12));
      // The uncompressed size the WOFF announces, give or take the padding between tables.
      expect(sfnt.length, file).toBeGreaterThanOrEqual(
        woff.readUInt32BE(16) - 4 * woff.readUInt16BE(12),
      );
    }
  });

  it('refuses a file that is not WOFF 1.0', () => {
    expect(() => woffToSfnt(new Uint8Array(64))).toThrow();
  });
});
