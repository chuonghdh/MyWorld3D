// Shared materials for every building and monument (see docs/DESIGN-3D.md 3.4 and 8).
// Colour lives in vertex colours, so the whole city needs only these few material instances,
// and the night look is one switch. The body material draws procedural brick, tile, timber ...
// patterns from the per-vertex `aSurface` id; glass gets a cheap sky reflection.
import * as THREE from 'three';
import { setSignNight } from './signs';
import {
  SURFACE_FRAGMENT_COLOR,
  SURFACE_FRAGMENT_COMMON,
  SURFACE_FRAGMENT_NORMAL,
  SURFACE_VERTEX_COMMON,
  SURFACE_VERTEX_MAIN,
} from './shaders/surface';
import {
  GLASS_FRAGMENT_COMMON,
  GLASS_FRAGMENT_END,
  GLASS_FRAGMENT_SCHEDULE,
  GLASS_VERTEX_COMMON,
  GLASS_VERTEX_MAIN,
} from './shaders/glass';
import { attachWeather, patchWeather, weatherUniforms } from '../shaders/wetSurface';
import { WIND_VERTEX_COMMON, WIND_VERTEX_MAIN_BODY, setBuildingWind, tickBuildingWind, windUniforms } from './shaders/wind';
import { nightClock } from './facade/polish';
import { patchCloudShade } from '../shaders/cloudShade';
import { buildings } from '../config/tuning';

let body: THREE.MeshStandardMaterial | null = null;
let glass: THREE.MeshStandardMaterial | null = null;
let glassLit: THREE.MeshStandardMaterial | null = null;

const LIT_COLOR = buildings.litWindowColor;
const NIGHT_EMISSIVE = buildings.nightEmissive;

/** Uniforms shared by both glass materials; setGlassEnvironment writes into them. */
export const glassUniforms = {
  uSkyColor: { value: new THREE.Color('#9cc4e8') },
  uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
  uSunColor: { value: new THREE.Color('#fff2d6') },
  /** Night clock in hours since noon for the window light schedule; negative = schedule off (all lit windows on). */
  uClock: { value: -1 },
};

type ShaderLike = { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string };

function patchBody(shader: ShaderLike): void {
  shader.uniforms.uWTime = windUniforms.uWTime;
  shader.uniforms.uWWind = windUniforms.uWWind;
  shader.uniforms.uWGust = windUniforms.uWGust;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${SURFACE_VERTEX_COMMON}\n${WIND_VERTEX_COMMON}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SURFACE_VERTEX_MAIN}\n${WIND_VERTEX_MAIN_BODY}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${SURFACE_FRAGMENT_COMMON}`)
    .replace('#include <color_fragment>', SURFACE_FRAGMENT_COLOR)
    .replace('#include <normal_fragment_maps>', SURFACE_FRAGMENT_NORMAL);
  patchWeather(shader);
  patchCloudShade(shader);
}

function patchGlass(shader: ShaderLike): void {
  shader.uniforms.uSkyColor = glassUniforms.uSkyColor;
  shader.uniforms.uSunDir = glassUniforms.uSunDir;
  shader.uniforms.uSunColor = glassUniforms.uSunColor;
  shader.uniforms.uClock = glassUniforms.uClock;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${GLASS_VERTEX_COMMON}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${GLASS_VERTEX_MAIN}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${GLASS_FRAGMENT_COMMON}`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
${GLASS_FRAGMENT_SCHEDULE}`)
    .replace('#include <opaque_fragment>', GLASS_FRAGMENT_END);
}

/** Opaque surfaces: walls, trim, roofs, ironwork, awnings. Colour comes from the vertex colours. */
export function getBodyMaterial(): THREE.MeshStandardMaterial {
  if (!body) {
    body = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
    body.name = 'building-body';
    body.onBeforeCompile = (shader) => patchBody(shader as unknown as ShaderLike);
    body.onBeforeRender = tickBuildingWind;
    body.customProgramCacheKey = () => 'building-body-v6';
  }
  return body;
}

/** Window glass that stays dark at night. Vertex colours tint it (curtains, blinds). */
export function getGlassMaterial(): THREE.MeshStandardMaterial {
  if (!glass) {
    glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.3 });
    glass.name = 'building-glass';
    glass.onBeforeCompile = (shader) => patchGlass(shader as unknown as ShaderLike);
    glass.customProgramCacheKey = () => 'building-glass-v2';
  }
  return glass;
}

/** Window glass that glows warm at night. Same look as glass by day. */
export function getGlassLitMaterial(): THREE.MeshStandardMaterial {
  if (!glassLit) {
    glassLit = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.15,
      metalness: 0.3,
      emissive: new THREE.Color(LIT_COLOR),
      emissiveIntensity: 0,
    });
    glassLit.name = 'building-glass-lit';
    glassLit.onBeforeCompile = (shader) => patchGlass(shader as unknown as ShaderLike);
    glassLit.customProgramCacheKey = () => 'building-glass-v2';
  }
  return glassLit;
}

/** Updates the fake glass reflection. Call whenever the lighting changes. */
export function setGlassEnvironment(
  sky: THREE.ColorRepresentation,
  sunDirection: THREE.Vector3Like,
  sunColor: THREE.ColorRepresentation,
): void {
  glassUniforms.uSkyColor.value.set(sky);
  glassUniforms.uSunDir.value.set(sunDirection.x, sunDirection.y, sunDirection.z);
  if (glassUniforms.uSunDir.value.lengthSq() > 0) glassUniforms.uSunDir.value.normalize();
  glassUniforms.uSunColor.value.set(sunColor);
}

/** Turns the lit windows and the shop signs on or off. Call when the sky state's lightsOn changes. */
export function setNightLights(on: boolean, intensity = NIGHT_EMISSIVE): void {
  getGlassLitMaterial().emissiveIntensity = on ? intensity : 0;
  setSignNight(on);
}

/**
 * Sets the wall-clock hour (0..24) for the evening window schedule: about 70% of the windows are lit at
 * 20:00 and 85% from 21:00 to 22:00, falling to 30% at midnight until the lights go out at 06:00-07:00. Pass a negative hour to turn the
 * schedule off (every lit window glows whenever the night lights are on).
 */
export function setNightClock(hour: number): void {
  glassUniforms.uClock.value = hour < 0 || !Number.isFinite(hour) ? -1 : nightClock(hour);
}

/** Drives the wind motion of flags, laundry, awnings, blade signs and window boxes. Call every frame. */
export { setBuildingWind };

/** Shared weather uniforms (uWet, uSnow, uWetSky) and the helper that hooks street/ground materials to them. */
export { attachWeather, weatherUniforms };

export { getSignMaterial, setSignNight } from './signs';
