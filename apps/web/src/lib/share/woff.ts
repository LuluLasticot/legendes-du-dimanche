// WOFF 1.0 → TrueType/OpenType, in memory. The share images are drawn by resvg, which reads
// TrueType and OpenType but not WOFF; the game's fonts (OFL) are kept as .woff (D-035) and
// unpacked here: same tables, each one inflated if it was compressed.

import { inflateSync } from 'node:zlib';

export function woffToSfnt(woff: Uint8Array): Uint8Array {
  const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  if (view.getUint32(0) !== 0x774f4646) throw new Error('Not a WOFF 1.0 font');
  const flavor = view.getUint32(4);
  const numTables = view.getUint16(12);
  const tables = Array.from({ length: numTables }, (_, i) => {
    const at = 44 + i * 20;
    const offset = view.getUint32(at + 4);
    const compLength = view.getUint32(at + 8);
    const origLength = view.getUint32(at + 12);
    const raw = woff.subarray(offset, offset + compLength);
    return {
      tag: view.getUint32(at),
      checksum: view.getUint32(at + 16),
      data: compLength < origLength ? new Uint8Array(inflateSync(raw)) : raw,
    };
  });

  const pad = (n: number): number => (n + 3) & ~3;
  const headerSize = 12 + numTables * 16;
  const size = tables.reduce((sum, t) => sum + pad(t.data.length), headerSize);
  const out = new Uint8Array(size);
  const sfnt = new DataView(out.buffer);
  let entrySelector = 0;
  while (1 << (entrySelector + 1) <= numTables) entrySelector++;
  const searchRange = (1 << entrySelector) * 16;
  sfnt.setUint32(0, flavor);
  sfnt.setUint16(4, numTables);
  sfnt.setUint16(6, searchRange);
  sfnt.setUint16(8, entrySelector);
  sfnt.setUint16(10, numTables * 16 - searchRange);
  let offset = headerSize;
  tables.forEach((table, i) => {
    const at = 12 + i * 16;
    sfnt.setUint32(at, table.tag);
    sfnt.setUint32(at + 4, table.checksum);
    sfnt.setUint32(at + 8, offset);
    sfnt.setUint32(at + 12, table.data.length);
    out.set(table.data, offset);
    offset += pad(table.data.length);
  });
  return out;
}
