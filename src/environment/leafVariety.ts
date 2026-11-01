// Shared leaf colour variety for every tree (procedural and Quaternius).
// Autumn blends yellow, orange and red on the same tree: each leaf island picks a point on a
// red -> orange -> yellow ramp, biased by height (top yellow, base red) with seeded scatter.
// Summer and spring get a small seeded hue, saturation and lightness spread inside the green range.
// The GLSL port (leafVarietyGlsl) and the CPU function below use the same constants.

import * as THREE from 'three';

export const AUTUMN_RED = '#b8402a';
export const AUTUMN_ORANGE = '#d8792c';
export const AUTUMN_YELLOW = '#e6b93e';
/** Green accents for summer and spring hue spread: yellow-green and blue-green. */
export const GREEN_YELLOW = '#7fb23a';
export const GREEN_TEAL = '#2f7f5a';

const LUMA = new THREE.Color();
function luma(c: THREE.Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/**
 * Autumn ramp colour for a leaf. `height` 0 (base) .. 1 (top); `pick` 0..1 seeded scatter.
 * Writes into `out` (linear RGB) and returns it.
 */
export function autumnLeafColor(height: number, pick: number, out: THREE.Color): THREE.Color {
  const s = Math.min(1, Math.max(0, height * 0.8 + (pick - 0.5) * 0.9 + 0.1));
  if (s < 0.5) out.lerpColors(new THREE.Color(AUTUMN_RED), new THREE.Color(AUTUMN_ORANGE), s * 2);
  else out.lerpColors(new THREE.Color(AUTUMN_ORANGE), new THREE.Color(AUTUMN_YELLOW), s * 2 - 1);
  return out;
}

/** Luminance-matched copy: keeps the brightness of a base colour, changes only its hue. */
export function matchLuma(target: THREE.Color, lum: number, out: THREE.Color): THREE.Color {
  const l = Math.max(1e-3, luma(LUMA.copy(target)));
  const k = lum / l;
  return out.setRGB(Math.min(1, target.r * k), Math.min(1, target.g * k), Math.min(1, target.b * k));
}

/** GLSL helper, injected by the Quaternius leaf material. Constants come from the uniforms below. */
export const leafVarietyGlsl = /* glsl */ `
uniform vec3 uAutumnRed;
uniform vec3 uAutumnOrange;
uniform vec3 uAutumnYellow;
uniform vec3 uGreenYellow;
uniform vec3 uGreenTeal;
uniform float uAutumn;
uniform float uVary;
const vec3 LV_LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 lvMatchLuma(vec3 t, float lum) {
  return clamp(t * (lum / max(dot(t, LV_LUMA), 1e-3)), 0.0, 1.0);
}

// c: base leaf colour (texture x material colour, linear). isl: per island (rA, rB, height).
// tr: per tree (rA, rB, rC) from instanceColor.
vec3 leafVariety(vec3 c, vec3 isl, vec3 tr) {
  float lum = dot(c, LV_LUMA);
  float pA = fract(isl.x + tr.x);
  float pB = fract(isl.y + tr.y);
  float pC = fract(isl.x * 0.618 + tr.z);
  float h = clamp(isl.z, 0.0, 1.0);

  // Summer and spring: seeded hue and lightness spread inside the green range.
  vec3 gT = lvMatchLuma(mix(uGreenTeal, uGreenYellow, smoothstep(0.35, 0.65, pB)), lum);
  vec3 green = mix(c, gT, 0.3 * uVary);
  green *= 1.0 + 0.12 * (pC - 0.5) * uVary;
  // Summer only (uSummer 0 or 1, set per season in natureTrees.ts). A slight brightness and saturation lift.
  float summer = uSummer;
  green = mix(vec3(dot(green, LV_LUMA)), green, 1.0 + 0.2 * summer);
  green = clamp(green * (1.0 + 0.12 * summer), 0.0, 1.0);

  // Autumn: red -> orange -> yellow ramp by height with scatter; luminance is lifted (lvMatchLuma).
  float s = clamp(h * 0.8 + (pA - 0.5) * 0.9 + 0.1, 0.0, 1.0);
  vec3 aT = s < 0.5
    ? mix(uAutumnRed, uAutumnOrange, s * 2.0)
    : mix(uAutumnOrange, uAutumnYellow, s * 2.0 - 1.0);
  // Lift dark texels: a dark leaf turns rich red or yellow, not brown-black.
  aT = lvMatchLuma(aT, mix(lum, 0.42, 0.65));
  vec3 autumn = mix(c, aT, 0.85 + 0.15 * pB);

  return mix(green, autumn, uAutumn);
}
`;
