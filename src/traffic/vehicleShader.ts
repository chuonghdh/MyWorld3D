// Shader patch for the vehicle material (vehicle-shader-v2): wheel spin, lamps, snow and frost. Chunk text and
// insertion order are part of the shader output; NORMAL_SPIN must hold the snow code (see docs/agents/traffic-life.md).

import type * as THREE from 'three';
import type { VehicleMeshes } from './vehicleMeshes';

const VERT_PARS = /* glsl */ `
attribute vec4 aPart;
attribute vec4 aMotion;
uniform float uNight;
uniform float uTime;
varying vec3 vEmit;
// Snow: upward paint takes snow; front glass frosts outside the wiper fans.
varying float vSnowUp;
varying float vSnowPaint;
varying float vFrontGlass;
varying vec3 vBodyPos;
`;

const NORMAL_SPIN = /* glsl */ `
vec3 objectNormal = vec3( normal );
if (aPart.x > 0.5 && aPart.x < 1.5) {
  float wa = aMotion.x / max(aPart.z, 0.05);
  float wc = cos(wa);
  float ws = sin(wa);
  objectNormal = vec3(objectNormal.x, objectNormal.y * wc - objectNormal.z * ws, objectNormal.y * ws + objectNormal.z * wc);
}
// Snow reads the final normal; color_vertex runs before this chunk, so it lives here.
mat3 snowInst = mat3(1.0);
#ifdef USE_INSTANCING
  snowInst = mat3(instanceMatrix);
#endif
vec3 snowN = snowInst * objectNormal;
vSnowUp = snowN.y;
vFrontGlass = (aPart.y < 0.5 && aPart.x < 0.5 && objectNormal.z > 0.6 && color.b > color.r + 0.03) ? 1.0 : 0.0;
#ifdef USE_TANGENT
  vec3 objectTangent = vec3( tangent.xyz );
#endif
`;

const POSITION_SPIN = /* glsl */ `
vec3 transformed = vec3( position );
if (aPart.x > 0.5 && aPart.x < 1.5) {
  float wa = aMotion.x / max(aPart.z, 0.05);
  float wc = cos(wa);
  float ws = sin(wa);
  vec2 wd = vec2(position.y - aPart.z, position.z - aPart.w);
  transformed.y = aPart.z + wd.x * wc - wd.y * ws;
  transformed.z = aPart.w + wd.x * ws + wd.y * wc;
}
`;

const COLOR_EMIT = /* glsl */ `
vec3 paintC = vec3(1.0);
#ifdef USE_INSTANCING_COLOR
  paintC = mix(vec3(1.0), instanceColor, aPart.y);
#endif
vColor = color * paintC;
vEmit = vec3(0.0);
vSnowPaint = aPart.y;
vBodyPos = position;
float pk = aPart.x;
if (pk > 1.5) {
  float lit = aMotion.z;
  float brake = aMotion.y;
  if (pk < 2.5) {
    vEmit = vec3(1.0, 0.93, 0.7) * (0.05 + uNight * 2.4) * lit;
  } else if (pk < 3.5) {
    vEmit = vec3(1.0, 0.07, 0.04) * (lit * (0.1 + uNight * 0.5) + brake * 1.9);
  } else if (pk < 4.5) {
    vEmit = vec3(1.0, 0.07, 0.04) * (brake * 2.0);
  } else if (pk < 5.5) {
    float side = position.x > 0.0 ? 1.0 : -1.0;
    float on = step(0.5, aMotion.w * side) * step(fract(uTime * 1.5), 0.5);
    vEmit = vec3(1.0, 0.55, 0.05) * on * 2.2;
  } else if (pk < 6.5) {
    vEmit = vec3(1.0, 0.82, 0.5) * uNight * 0.3 * lit;
  } else if (pk > 7.5) {
    vEmit = vec3(1.0, 0.72, 0.15) * (0.3 + uNight * 0.9);
  }
}
`;

const SNOW_FRAG = /* glsl */ `
uniform float uSnow;
varying float vSnowUp;
varying float vSnowPaint;
varying float vFrontGlass;
varying vec3 vBodyPos;
void vehicleSnow(inout vec3 albedo) {
  if (uSnow < 0.001) return;
  // Roof, bonnet and boot: white where the surface faces up, most of it at full snow.
  float roof = smoothstep(0.6, 0.9, vSnowUp) * vSnowPaint * clamp(uSnow * 1.5, 0.0, 1.0);
  albedo = mix(albedo, vec3(0.94, 0.96, 1.0), roof);
  // Windscreen frost, not where the two wiper fans have just swept (fans pivot near the base corners).
  float fanL = length(vec2(vBodyPos.x + 0.45, vBodyPos.y - 1.45));
  float fanR = length(vec2(vBodyPos.x - 0.45, vBodyPos.y - 1.45));
  float swept = max(step(fanL, 1.0), step(fanR, 1.0));
  float frost = vFrontGlass * (1.0 - swept) * clamp(uSnow * 1.2, 0.0, 1.0);
  albedo = mix(albedo, vec3(0.78, 0.82, 0.86), frost * 0.55);
}
`;

export function patchMaterial(material: THREE.MeshLambertMaterial, uniforms: VehicleMeshes['uniforms']): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = uniforms.night;
    shader.uniforms.uTime = uniforms.time;
    shader.uniforms.uSnow = uniforms.snow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
${VERT_PARS}`)
      .replace('#include <beginnormal_vertex>', NORMAL_SPIN)
      .replace('#include <begin_vertex>', POSITION_SPIN)
      .replace('#include <color_vertex>', COLOR_EMIT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vEmit;
${SNOW_FRAG}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\nvehicleSnow(diffuseColor.rgb);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmit;');
  };
  material.customProgramCacheKey = () => 'vehicle-shader-v2';
}
