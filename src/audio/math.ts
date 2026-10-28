// Pure audio maths: no Web Audio, no Three. Unit tested in tests/audioMath.test.ts.

export const SPEED_OF_SOUND = 340;

/** Inverse-distance gain, same shape as PannerNode 'inverse', clamped to distance range [ref, max]. */
export function distanceGain(distance: number, ref: number, max: number, rolloff: number): number {
  const r = Math.max(0.001, ref);
  const d = Math.min(Math.max(distance, r), Math.max(max, r));
  return r / (r + rolloff * (d - r));
}

export const LOWPASS_NEAR_HZ = 18000;
export const LOWPASS_FAR_HZ = 1200;
export const LOWPASS_FAR_DISTANCE = 300;

/** Air absorption: about 18 kHz at 0 m, falling exponentially (log-linear) to 1.2 kHz at 300 m, then flat. */
export function distanceLowpassHz(distance: number): number {
  const t = Math.min(1, Math.max(0, distance / LOWPASS_FAR_DISTANCE));
  return LOWPASS_NEAR_HZ * Math.pow(LOWPASS_FAR_HZ / LOWPASS_NEAR_HZ, t);
}

/**
 * Doppler pitch ratio. relativeRadialSpeed in m/s is positive when source and listener approach each
 * other. Result clamped to 0.85..1.15.
 */
export function dopplerRatio(relativeRadialSpeed: number): number {
  const v = Math.min(SPEED_OF_SOUND * 0.9, Math.max(-SPEED_OF_SOUND * 0.9, relativeRadialSpeed));
  return Math.min(1.15, Math.max(0.85, SPEED_OF_SOUND / (SPEED_OF_SOUND - v)));
}

/** Equal-power pan gains for pan in -1 (left) .. 1 (right). */
export function equalPowerPan(pan: number): { left: number; right: number } {
  const p = Math.min(1, Math.max(-1, pan));
  const a = ((p + 1) * Math.PI) / 4;
  return { left: Math.cos(a), right: Math.sin(a) };
}

/** Overall attenuation for a view this high above the ground: 1/(1+h/150), floored at 0.12. */
export function zoomAttenuation(height: number): number {
  return Math.max(0.12, 1 / (1 + Math.max(0, height) / 150));
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
