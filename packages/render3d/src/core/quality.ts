// Graphics quality levels: picked at start-up from the device, adjustable in settings, lowered
// automatically when the frame rate cannot be held. Pure module (no DOM) so it can be tested.
// Ported from Carte du Ciel (render/quality.ts).

export type QualityLevel = 'low' | 'medium' | 'high';
export type QualityChoice = 'auto' | QualityLevel;

export interface QualityProfile {
  readonly level: QualityLevel;
  /** Device pixel ratio cap (Retina screens). */
  readonly maxDpr: number;
  /** MSAA samples of the scene target (0 = none). */
  readonly msaa: number;
  /** Bloom mip levels (halo depth). */
  readonly bloomLevels: number;
  /** Share of particles kept. */
  readonly particles: number;
  /** Shadow map size (0 = no shadows). */
  readonly shadowMapSize: number;
  /** Floor of the dynamic resolution. */
  readonly minRes: number;
}

export const QUALITY_PROFILES: Readonly<Record<QualityLevel, QualityProfile>> = {
  low: {
    level: 'low',
    maxDpr: 1.25,
    msaa: 0,
    bloomLevels: 4,
    particles: 0.45,
    shadowMapSize: 0,
    minRes: 0.6,
  },
  medium: {
    level: 'medium',
    maxDpr: 1.6,
    msaa: 2,
    bloomLevels: 5,
    particles: 0.75,
    shadowMapSize: 1024,
    minRes: 0.55,
  },
  high: {
    level: 'high',
    maxDpr: 2,
    msaa: 4,
    bloomLevels: 6,
    particles: 1,
    shadowMapSize: 2048,
    minRes: 0.55,
  },
};

export const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];

export interface DeviceInfo {
  /** GPU string (WEBGL_debug_renderer_info), empty if unknown. */
  readonly gpu: string;
  readonly mobile: boolean;
  /** Announced memory in GB (navigator.deviceMemory), 0 if unknown. */
  readonly memory: number;
  /** Logical cores, 0 if unknown. */
  readonly cores: number;
  /** Shortest screen side in physical pixels. */
  readonly screenPx: number;
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i;
const WEAK_MOBILE =
  /mali-(4|t)|adreno \(tm\) ?[345]\d\d|adreno [345]\d\d|powervr|sgx|videocore|vivante|tegra/i;
const MID_MOBILE = /adreno \(tm\) ?6[0-3]\d|adreno 6[0-3]\d|mali-g(5|6|7[0-6])/i;
const DESKTOP_DISCRETE = /nvidia|geforce|quadro|rtx|radeon|amd|apple m\d|apple gpu/i;
const DESKTOP_INTEGRATED = /intel|uhd|iris|hd graphics/i;

export function detectQuality(d: DeviceInfo): QualityLevel {
  const gpu = d.gpu;
  if (SOFTWARE.test(gpu)) return 'low';
  if ((d.memory > 0 && d.memory <= 2) || (d.cores > 0 && d.cores <= 2)) return 'low';
  if (d.mobile) {
    if (WEAK_MOBILE.test(gpu)) return 'low';
    if (/apple/i.test(gpu)) return d.memory > 0 && d.memory <= 3 ? 'medium' : 'high';
    if (MID_MOBILE.test(gpu)) return 'medium';
    if (d.memory > 0 && d.memory <= 4) return 'medium';
    return gpu ? 'high' : 'medium';
  }
  if (DESKTOP_DISCRETE.test(gpu)) return 'high';
  if (DESKTOP_INTEGRATED.test(gpu)) return d.screenPx > 1800 ? 'medium' : 'high';
  return 'medium';
}

/** One level down (or the same level if there is none). */
export function lowerQuality(level: QualityLevel): QualityLevel {
  return QUALITY_LEVELS[Math.max(0, QUALITY_LEVELS.indexOf(level) - 1)] ?? 'low';
}

/** Reads a forced level from the URL (?q=low|medium|high). */
export function qualityFromQuery(search: string): QualityLevel | null {
  const q = new URLSearchParams(search).get('q');
  return q === 'low' || q === 'medium' || q === 'high' ? q : null;
}
