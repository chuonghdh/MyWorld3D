// Bridge from the eased weather values to the shared surface uniforms (uWet, uSnow, uWetSky).
// The GLSL and attachWeather() live in src/shaders/wetSurface.ts (neutral shared folder).
import * as THREE from 'three';
import { attachWeather, weatherUniforms } from '../shaders/wetSurface';

export { attachWeather, weatherUniforms };

/**
 * Writes the shared uniforms. `light` 0..1 scales the sky reflection in puddles so wet streets do
 * not glow at night; `sky` is the sky colour the puddles mirror.
 */
export function setSurfaceWeather(wet: number, snow: number, sky: { r: number; g: number; b: number }, light: number): void {
  weatherUniforms.uWet.value = THREE.MathUtils.clamp(wet, 0, 1);
  weatherUniforms.uSnow.value = THREE.MathUtils.clamp(snow, 0, 1);
  const k = THREE.MathUtils.clamp(light, 0, 1) * Math.min(1, wet * 1.2);
  weatherUniforms.uWetSky.value.setRGB(sky.r * k, sky.g * k, sky.b * k);
}

/** Back to the dry look (tests, unmount). */
export function resetSurfaceWeather(): void {
  weatherUniforms.uWet.value = 0;
  weatherUniforms.uSnow.value = 0;
  weatherUniforms.uWetSky.value.setRGB(0, 0, 0);
}
