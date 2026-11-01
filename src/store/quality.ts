import { sceneQa } from '../config/tuning';

// Quality tiers. High is the reference look (the build before tiers existed); Medium and Low
// are opt-in and only ever lower cost. The auto-detect below only suggests a tier, never applies it.

export const QUALITY_TIERS = ['low', 'medium', 'high'] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];

export const QUALITY_LABEL: Record<QualityTier, string> = { low: 'Low', medium: 'Medium', high: 'High' };

export interface QualityPreset {
  /** Upper bound of the device pixel ratio; the lower bound is always 1. */
  dprMax: number;
  /** Shadow map edge in texels. */
  shadowMap: number;
  /** Multiplier on bloom strength; 0 turns the bloom pass off. */
  bloom: number;
  /** MSAA samples of the post-processing render target. */
  msaa: number;
  /** Multiplier on the Traffic & people slider. */
  traffic: number;
}

export const QUALITY_PRESETS: Record<QualityTier, QualityPreset> = sceneQa.qualityTiers;

export function isQualityTier(v: unknown): v is QualityTier {
  return typeof v === 'string' && (QUALITY_TIERS as readonly string[]).includes(v);
}

export interface DeviceInfo {
  /** Touch-first device (phone or tablet). */
  coarsePointer?: boolean;
  /** navigator.deviceMemory in GB, when the browser reports it. */
  deviceMemory?: number;
  /** navigator.hardwareConcurrency. */
  cores?: number;
  /** Unmasked WebGL renderer string, when available. */
  renderer?: string;
}

export interface QualitySuggestion {
  tier: QualityTier;
  reason: string;
}

/** Pure heuristic behind the "suggested for this device" hint. */
export function suggestQuality(info: DeviceInfo): QualitySuggestion {
  const gpu = (info.renderer ?? '').toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return { tier: 'low', reason: 'software rendering' };
  if (info.coarsePointer) return { tier: 'low', reason: 'touch device' };
  if (info.deviceMemory !== undefined && info.deviceMemory <= 2) return { tier: 'low', reason: 'low memory' };
  if (/intel|mali|adreno|powervr|videocore|apple gpu/.test(gpu) && !/arc\b|iris xe max/.test(gpu)) {
    return { tier: 'medium', reason: 'integrated graphics' };
  }
  if (info.deviceMemory !== undefined && info.deviceMemory <= 4) return { tier: 'medium', reason: 'limited memory' };
  if (info.cores !== undefined && info.cores <= 4) return { tier: 'medium', reason: 'few CPU cores' };
  return { tier: 'high', reason: 'capable device' };
}

/** Reads the browser for a suggestion. Safe outside a browser (returns High). */
export function detectDevice(renderer?: string): DeviceInfo {
  if (typeof navigator === 'undefined') return { renderer };
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
  return { coarsePointer: coarse, deviceMemory: nav.deviceMemory, cores: nav.hardwareConcurrency, renderer };
}
