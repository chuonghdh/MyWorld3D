// Wind motion for cloth and plant details (flags, laundry, awnings, blade signs, window boxes,
// parasols), done entirely in the vertex shader of the shared body and sign materials, so it adds
// no draw calls. Each vertex carries a vec2: x = behaviour id (see facade/polish.ts WIND), y = anchor
// weight (0 where the cloth is fixed, 1 at the free edge). Id 0 costs one compare.
//
// Uniforms are shared module-level objects (windUniforms below). Without wiring they run on their own
// clock with a gentle breeze; Town calls setBuildingWind(time, wind, gust) to drive them with the real
// wind, which makes gusts visibly whip the details.
import * as THREE from 'three';

export const windUniforms = {
  uWTime: { value: 0 },
  /** Wind velocity on the ground plane, (east, south) in m/s. */
  uWWind: { value: new THREE.Vector2(1.6, 0.6) },
  /** Gust strength 0..1. */
  uWGust: { value: 0 },
};

let externalClock = false;

/** Drives the building wind from the simulation (time in seconds, wind vector in m/s, gust 0..1). */
export function setBuildingWind(time: number, wind: { x: number; z: number }, gust: number): void {
  externalClock = true;
  windUniforms.uWTime.value = time;
  windUniforms.uWWind.value.set(wind.x, wind.z);
  windUniforms.uWGust.value = gust;
}

/** Called from the body material's onBeforeRender: free-runs the clock until setBuildingWind is used. */
export function tickBuildingWind(): void {
  if (!externalClock && typeof performance !== 'undefined') windUniforms.uWTime.value = performance.now() / 1000;
}

export const WIND_VERTEX_COMMON = /* glsl */ `
uniform float uWTime;
uniform vec2 uWWind;
uniform float uWGust;

// World-space displacement of a vertex with wind behaviour wd = (id, weight) at object position p.
vec3 windDisp(vec2 wd, vec3 p) {
  if (wd.x < 0.5) return vec3(0.0);
  float w = clamp(wd.y, 0.0, 1.0);
  float ws = length(uWWind);
  // About 1 at 5 m/s (the default wind), 2.2 at most, boosted by gusts. Mirrors windAmplitude in facade/polish.ts.
  float amp = min(2.2, (ws + 1.0) / 6.0) * (1.0 + 1.0 * uWGust);
  vec2 dir = ws > 0.05 ? uWWind / ws : vec2(0.8, 0.6);
  vec2 side = vec2(-dir.y, dir.x);
  float ph = dot(p.xz, vec2(0.9, 1.3));
  float t = uWTime;
  vec3 d = vec3(0.0);
  int id = int(wd.x + 0.5);
  if (id == 1) {
    // Flag: streams downwind (droops when calm) and flutters with a wave running to the free edge.
    float wave = sin(t * (5.0 + 3.0 * amp) - w * 6.0 + ph);
    float lift = clamp(amp, 0.0, 1.0);
    d.xz = dir * (0.55 * amp * w) + side * (0.40 * amp * w * wave);
    d.y = 0.18 * amp * w * sin(t * 4.1 - w * 4.0 + ph) - 0.30 * (1.0 - lift) * w;
  } else if (id == 2) {
    // Laundry: leans and swings along the wind with a slow pendulum and a quick flutter at the hem.
    float sw = 0.65 + 0.35 * sin(t * 1.7 + ph);
    d.xz = dir * (0.30 * amp * w * sw) + side * (0.14 * amp * w * sin(t * 2.9 + ph * 1.7));
    d.y = 0.08 * amp * w * sin(t * 6.3 + ph * 2.0);
  } else if (id == 3) {
    // Awning: the front edge and valance lean out, billow up and down and sway.
    d.y = 0.16 * amp * w * sin(t * 3.1 + ph * 2.0) + 0.06 * amp * w * sin(t * 7.3 + ph * 3.1);
    d.xz = dir * (0.12 * amp * w * (0.6 + 0.4 * sin(t * 2.2 + ph)));
  } else if (id == 4) {
    // Blade sign: swings on its bracket, a little further in a gust.
    float sw = sin(t * 1.5 + ph * 0.3);
    d.xz = (dir * 0.6 + side * 0.4) * (0.32 * amp * w * sw) + dir * (0.10 * amp * w);
  } else if (id == 5) {
    // Plants: leaves and blooms nod.
    d.xz = dir * (0.08 * amp * w * (0.5 + 0.5 * sin(t * 2.4 + ph))) + side * (0.04 * amp * w * sin(t * 5.1 + ph * 2.3));
  } else if (id == 6) {
    // Parasol rim flutter.
    d.y = 0.08 * amp * w * sin(t * 5.0 + ph * 3.0);
    d.xz = dir * (0.06 * amp * w * sin(t * 2.0 + ph));
  }
  return d;
}

vec3 windToObject(vec3 d) {
  return transpose(mat3(modelMatrix)) * d;
}
`;

/** Appended after `#include <begin_vertex>` of the body material; `uv` carries (id, weight). */
export const WIND_VERTEX_MAIN_BODY = /* glsl */ `
transformed += windToObject(windDisp(uv, position));
`;

/** Sign material: its own attribute, because uv holds the atlas cell there. */
export const WIND_VERTEX_ATTR_SIGN = /* glsl */ `
attribute vec2 aWind;
`;

export const WIND_VERTEX_MAIN_SIGN = /* glsl */ `
transformed += windToObject(windDisp(aWind, position));
`;

/** Name of the sign mesh's wind attribute. */
export const WIND_ATTRIBUTE = 'aWind';
