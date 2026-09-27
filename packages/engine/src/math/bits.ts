// IEEE-754 bit access. DataView with explicit endianness: identical on every platform.

const view = new DataView(new ArrayBuffer(8));

/** Exact power of two, 2^k, for any integer k (splits the product outside the normal range). */
export function pow2(k: number): number {
  if (k > 1023) return pow2(1023) * pow2(k - 1023);
  if (k < -1022) return pow2(-1022) * pow2(k + 1022);
  view.setUint32(0, (k + 1023) << 20, false);
  view.setUint32(4, 0, false);
  return view.getFloat64(0, false);
}

/** x · 2^k. */
export function scalbn(x: number, k: number): number {
  if (k > 1023) return scalbn(x * pow2(1023), k - 1023);
  if (k < -1022) return scalbn(x * pow2(-1022), k + 1022);
  return x * pow2(k);
}

/** High and low 32-bit words of a float64. */
export function float64Words(x: number): [hi: number, lo: number] {
  view.setFloat64(0, x, false);
  return [view.getUint32(0, false), view.getUint32(4, false)];
}

/** Builds a float64 from its high and low 32-bit words. */
export function fromFloat64Words(hi: number, lo: number): number {
  view.setUint32(0, hi >>> 0, false);
  view.setUint32(4, lo >>> 0, false);
  return view.getFloat64(0, false);
}
