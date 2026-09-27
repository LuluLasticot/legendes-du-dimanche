// Deterministic math.
//
// ECMAScript leaves Math.sin/cos/exp/pow/atan2… "implementation-approximated": results may
// differ between V8, JavaScriptCore and SpiderMonkey, or between versions of one engine.
// These functions only use +, −, ×, ÷ (IEEE-754 correctly rounded, no FMA contraction in JS),
// Math.sqrt (correctly rounded by spec), Math.round/floor/abs (exact) and bit manipulation,
// so they return the same bits everywhere. Kernels and coefficients come from fdlibm (Sun, 1993).

import { float64Words, fromFloat64Words, scalbn } from './bits.ts';

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;
export const LN2 = 0.6931471805599453;
export const E = 2.718281828459045;

const TWO_OVER_PI = 6.36619772367581382433e-1;
// π/2 split in three parts (33 + 33 + 53 bits) for Cody–Waite argument reduction.
const PIO2_1 = 1.57079632673412561417;
const PIO2_2 = 6.077100506303966e-11;
const PIO2_2T = 2.02226624879595063154e-21;
const PI_LO = 1.2246467991473532e-16;

const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.442695040888963387;

/** Largest |x| for which argument reduction stays exact (n · PIO2_1 exact for n < 2^20). */
const TRIG_EXACT_LIMIT = 1.6e6;

// ─── Trigonometry ─────────────────────────────────────────────────────────────

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.0875723212981748279e-9;
const C6 = -1.13596475577881948265e-11;

/** sin on [−π/4, π/4]. */
function kernelSin(x: number): number {
  if (Math.abs(x) < 7.450580596923828e-9) return x; // 2^-27: sin(x) = x (keeps the sign of ±0)
  const z = x * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return x + x * z * (S1 + z * r);
}

/** cos on [−π/4, π/4]. */
function kernelCos(x: number): number {
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  return 1 - (0.5 * z - z * r);
}

/** Reduces x to r ∈ [−π/4, π/4] with x = r + n·π/2; returns [r, n mod 4]. */
function reduceHalfPi(x: number): [r: number, quadrant: number] {
  if (Math.abs(x) <= 0.7853981633974483) return [x, 0];
  const n = Math.round(x * TWO_OVER_PI);
  const r = x - n * PIO2_1 - n * PIO2_2 - n * PIO2_2T;
  return [r, n - 4 * Math.floor(n / 4)];
}

/**
 * Deterministic sine. Accurate to ~1 ulp for |x| < 1.6e6; beyond that the result stays
 * deterministic but loses precision (never needed by the game).
 */
export function sin(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  if (Math.abs(x) > TRIG_EXACT_LIMIT) x = x - TAU * Math.round(x / TAU);
  const [r, q] = reduceHalfPi(x);
  switch (q) {
    case 0:
      return kernelSin(r);
    case 1:
      return kernelCos(r);
    case 2:
      return -kernelSin(r);
    default:
      return -kernelCos(r);
  }
}

/** Deterministic cosine (see {@link sin} for the accuracy domain). */
export function cos(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  if (Math.abs(x) > TRIG_EXACT_LIMIT) x = x - TAU * Math.round(x / TAU);
  const [r, q] = reduceHalfPi(x);
  switch (q) {
    case 0:
      return kernelCos(r);
    case 1:
      return -kernelSin(r);
    case 2:
      return -kernelCos(r);
    default:
      return kernelSin(r);
  }
}

/** Deterministic sine and cosine of the same angle, computed with a single reduction. */
export function sinCos(x: number): [sin: number, cos: number] {
  if (!Number.isFinite(x)) return [NaN, NaN];
  if (Math.abs(x) > TRIG_EXACT_LIMIT) x = x - TAU * Math.round(x / TAU);
  const [r, q] = reduceHalfPi(x);
  const s = kernelSin(r);
  const c = kernelCos(r);
  switch (q) {
    case 0:
      return [s, c];
    case 1:
      return [c, -s];
    case 2:
      return [-s, -c];
    default:
      return [-c, s];
  }
}

/** Deterministic tangent. */
export function tan(x: number): number {
  const [s, c] = sinCos(x);
  return s / c;
}

const ATAN_HI = [
  4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1,
  1.570796326794896558,
] as const;
const ATAN_LO = [
  2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17,
  6.12323399573676603587e-17,
] as const;
const AT0 = 3.33333333333329318027e-1;
const AT1 = -1.99999999998764832476e-1;
const AT2 = 1.42857142725034663711e-1;
const AT3 = -1.1111110405462355788e-1;
const AT4 = 9.09088713343650656196e-2;
const AT5 = -7.69187620504482999495e-2;
const AT6 = 6.66107313738753120669e-2;
const AT7 = -5.83357013379057348645e-2;
const AT8 = 4.97687799461593236017e-2;
const AT9 = -3.6531572744216915527e-2;
const AT10 = 1.62858201153657823623e-2;

/** Deterministic arctangent, result in [−π/2, π/2]. */
export function atan(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const negative = x < 0 || Object.is(x, -0);
  let a = Math.abs(x);
  if (a >= 7.378697629483821e19) {
    // 2^66: atan(x) = ±π/2 to double precision.
    const z = ATAN_HI[3] + ATAN_LO[3];
    return negative ? -z : z;
  }
  let id = -1;
  if (a < 0.4375) {
    if (a < 7.450580596923828e-9) return x; // 2^-27: atan(x) = x
  } else if (a < 1.1875) {
    if (a < 0.6875) {
      id = 0;
      a = (2 * a - 1) / (2 + a);
    } else {
      id = 1;
      a = (a - 1) / (a + 1);
    }
  } else if (a < 2.4375) {
    id = 2;
    a = (a - 1.5) / (1 + 1.5 * a);
  } else {
    id = 3;
    a = -1 / a;
  }
  const z = a * a;
  const w = z * z;
  const s1 = z * (AT0 + w * (AT2 + w * (AT4 + w * (AT6 + w * (AT8 + w * AT10)))));
  const s2 = w * (AT1 + w * (AT3 + w * (AT5 + w * (AT7 + w * AT9))));
  if (id < 0) return x - x * (s1 + s2);
  const hi = ATAN_HI[id as 0 | 1 | 2 | 3];
  const lo = ATAN_LO[id as 0 | 1 | 2 | 3];
  const r = hi - (a * (s1 + s2) - lo - a);
  return negative ? -r : r;
}

/** Deterministic atan2(y, x), result in [−π, π]. Follows the IEEE special cases of Math.atan2. */
export function atan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  const yNegative = y < 0 || Object.is(y, -0);
  const xNegative = x < 0 || Object.is(x, -0);
  const sign = (v: number): number => (yNegative ? -v : v);

  if (y === 0) return xNegative ? sign(PI) : y;
  if (x === 0) return sign(HALF_PI);
  if (!Number.isFinite(x)) {
    if (!Number.isFinite(y)) return sign(xNegative ? 3 * (PI / 4) : PI / 4);
    return xNegative ? sign(PI) : sign(0);
  }
  if (!Number.isFinite(y)) return sign(HALF_PI);

  const a = atan(Math.abs(y / x));
  return xNegative ? sign(PI - (a - PI_LO)) : sign(a);
}

/** Deterministic arcsine, x ∈ [−1, 1]. */
export function asin(x: number): number {
  if (!(x >= -1 && x <= 1)) return NaN;
  return atan2(x, Math.sqrt((1 - x) * (1 + x)));
}

/** Deterministic arccosine, x ∈ [−1, 1]. */
export function acos(x: number): number {
  if (!(x >= -1 && x <= 1)) return NaN;
  return atan2(Math.sqrt((1 - x) * (1 + x)), x);
}

// ─── Exponential and logarithm ────────────────────────────────────────────────

const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.6533902205465251539e-6;
const P5 = 4.13813679705723846039e-8;

/** Deterministic e^x. */
export function exp(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x > 7.09782712893383973096e2) return Infinity;
  if (x < -7.4513321910194110842e2) return 0;
  if (Math.abs(x) < 3.725290298461914e-9) return 1 + x; // 2^-28
  const k = Math.round(x * INV_LN2);
  const hi = x - k * LN2_HI;
  const lo = k * LN2_LO;
  const r = hi - lo;
  const t = r * r;
  const c = r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  const y = 1 - (lo - (r * c) / (2 - c) - hi);
  return k === 0 ? y : scalbn(y, k);
}

const LG1 = 6.66666666666673513e-1;
const LG2 = 3.999999999940941908e-1;
const LG3 = 2.857142874366239149e-1;
const LG4 = 2.222219843214978396e-1;
const LG5 = 1.818357216161805012e-1;
const LG6 = 1.531383769920937332e-1;
const LG7 = 1.479819860511658591e-1;

/** Deterministic natural logarithm. */
export function log(x: number): number {
  if (Number.isNaN(x) || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;

  let k = 0;
  if (x < 2.2250738585072014e-308) {
    // Subnormal: scale up by 2^54.
    x *= 18014398509481984;
    k -= 54;
  }
  const [hiWord, loWord] = float64Words(x);
  k += (hiWord >>> 20) - 1023;
  const hx = hiWord & 0x000fffff;
  // Normalise the mantissa to [√2/2, √2).
  const i = (hx + 0x95f64) & 0x100000;
  const m = fromFloat64Words(hx | (i ^ 0x3ff00000), loWord);
  k += i >> 20;
  const f = m - 1;
  if (f === 0) return k === 0 ? 0 : k * LN2_HI + k * LN2_LO;

  const s = f / (2 + f);
  const z = s * s;
  const w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const R = t2 + t1;
  if (((hx - 0x6147a) | (0x6b851 - hx)) > 0) {
    const hfsq = 0.5 * f * f;
    return k * LN2_HI - (hfsq - (s * (hfsq + R) + k * LN2_LO) - f);
  }
  return k * LN2_HI - (s * (f - R) - k * LN2_LO - f);
}

/** Deterministic base-2 logarithm. */
export function log2(x: number): number {
  return log(x) / LN2;
}

/**
 * Deterministic x^y. Integer exponents use exact repeated squaring; otherwise exp(y·log x).
 * Use this instead of Math.pow and the ** operator in engine code.
 */
export function pow(x: number, y: number): number {
  if (y === 0) return 1;
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  if (Number.isInteger(y) && Math.abs(y) <= 2147483648) {
    let base = x;
    let n = Math.abs(y);
    let result = 1;
    while (n > 0) {
      if (n % 2 === 1) result *= base;
      n = Math.floor(n / 2);
      if (n > 0) base *= base;
    }
    return y < 0 ? 1 / result : result;
  }
  if (x < 0) return NaN;
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x === Infinity) return y > 0 ? Infinity : 0;
  return exp(y * log(x));
}

// ─── Exact helpers (re-exported so engine code only needs this module) ────────

/** Square root: correctly rounded by the IEEE-754 spec, hence deterministic. */
export const sqrt = Math.sqrt;

/** √(x² + y²). Math.hypot is implementation-approximated; this is not. */
export function hypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** √(x² + y² + z²). */
export function hypot3(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

export function clamp(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Wraps an angle to (−π, π]. */
export function wrapAngle(a: number): number {
  const r = a - TAU * Math.round(a / TAU);
  return r === -PI ? PI : r;
}

export function degToRad(deg: number): number {
  return deg * (PI / 180);
}

export function radToDeg(rad: number): number {
  return rad * (180 / PI);
}
