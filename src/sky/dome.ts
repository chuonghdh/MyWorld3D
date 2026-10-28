// Procedural sky dome: gradient by time of day, sun disc and glow, moon with phase, stars,
// soft cloud layer and a lightning flash. One draw call, no textures, no shadows.
// The vertex shader keeps the dome at the far plane and ignores camera translation, so it always
// follows the camera and never interacts with the dynamic near/far planes of the scene.

import * as THREE from 'three';
import type { SkyUniformValues } from './state';

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p;
  gl_Position.z = p.w * 0.99999;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uMoonLight;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform float uSunVis;
uniform float uMoonVis;
uniform float uStars;
uniform float uGlowK;
uniform float uNight;
uniform float uCloud;
uniform float uFlash;
uniform float uTime;
varying vec3 vDir;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec3 hash33(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yxz + 19.19);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.02 + 11.7;
    a *= 0.5;
  }
  return s / 0.9375;
}

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;

  // Gradient: horizon colour (equals the fog colour) up to the zenith colour.
  float t = pow(clamp(h, 0.0, 1.0), 0.5);
  vec3 col = mix(uHorizon, uZenith, t);
  // Brighter haze band hugging the horizon.
  col = mix(col, uHorizon * 1.08, exp(-max(h, 0.0) * 9.0) * 0.35);
  // Below the horizon the dome is the horizon colour (the ground disc covers it anyway).
  col = mix(col, uHorizon, smoothstep(0.0, -0.08, h));

  // Stars: sparse points on a 3D grid, twinkling, hidden near the horizon and by the moon glow.
  if (uStars > 0.001 && h > 0.0) {
    vec3 q = dir * 70.0;
    vec3 cell = floor(q);
    vec3 r = hash33(cell);
    vec3 pos = cell + 0.2 + 0.6 * hash33(cell + 7.7);
    float d = length(q - pos);
    float present = step(0.9, r.x);
    float size = mix(0.08, 0.2, r.y * r.y);
    float tw = 0.75 + 0.25 * sin(uTime * (1.5 + r.z * 3.0) + r.z * 40.0);
    float star = present * smoothstep(size, 0.0, d) * tw * (0.5 + r.y);
    vec3 starCol = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.9, 0.75), r.z);
    float fade = smoothstep(0.0, 0.25, h) * (1.0 - 0.8 * pow(max(dot(dir, uMoonDir), 0.0), 20.0));
    col += starCol * star * uStars * fade * 1.6;
  }

  // Sun glow and disc, both soft. The glow widens at golden hour.
  float sd = max(dot(dir, uSunDir), 0.0);
  float wide = mix(6.0, 2.5, uGlowK);
  float glow = pow(sd, wide) * 0.28 + pow(sd, 48.0) * 0.55 + pow(sd, 900.0) * 0.6;
  col += uSunColor * glow * uSunVis * (0.6 + 0.8 * uGlowK);
  float disc = smoothstep(0.99935, 0.99975, sd);
  col = mix(col, uSunColor * 1.6 + vec3(0.2), disc * uSunVis);

  // Moon: lit disc with a soft terminator, faint craters and a glow.
  float md = dot(dir, uMoonDir);
  if (uMoonVis > 0.001 && md > 0.0) {
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir));
    vec3 up = cross(uMoonDir, right);
    float radius = 0.045;
    vec2 p = vec2(dot(dir, right), dot(dir, up)) / radius;
    float rr = length(p);
    col += vec3(0.55, 0.65, 0.95) * pow(md, 90.0) * 0.35 * uMoonVis;
    if (rr < 1.15) {
      vec3 n = vec3(p, sqrt(max(1.0 - rr * rr, 0.0)));
      float lit = smoothstep(-0.08, 0.18, dot(n, normalize(uMoonLight)));
      float crater = 0.82 + 0.18 * vnoise(p * 4.0 + 3.1) + 0.1 * vnoise(p * 9.0);
      vec3 moonCol = vec3(0.93, 0.94, 0.88) * crater;
      moonCol = mix(vec3(0.05, 0.06, 0.1), moonCol, lit);
      float edge = smoothstep(1.0, 0.9, rr);
      col = mix(col, moonCol * 1.5, edge * uMoonVis * (0.2 + 0.8 * lit));
    }
  }

  // Cloud layer: drifting noise projected on a plane above the viewer.
  if (h > 0.0 && uCloud > 0.02) {
    vec2 cp = dir.xz / (h + 0.18) * 1.6 + vec2(uTime * 0.004, 0.0);
    float n = fbm(cp);
    float thr = 0.72 - 0.42 * uCloud;
    float dens = smoothstep(thr, thr + 0.28, n) * smoothstep(0.0, 0.12, h);
    float light = clamp(dot(uHorizon, vec3(0.33)) * 1.6 + 0.12, 0.0, 1.0);
    vec3 cloudCol = mix(uHorizon, vec3(1.0), 0.55 * (1.0 - uNight)) * (0.55 + 0.45 * light);
    cloudCol = mix(cloudCol, cloudCol * vec3(0.62, 0.65, 0.72), uCloud * 0.7);
    cloudCol += uSunColor * pow(sd, 6.0) * 0.25 * uSunVis;
    col = mix(col, cloudCol, dens * 0.85);
  }

  // Overcast: desaturate toward grey.
  float luma = dot(col, vec3(0.3, 0.59, 0.11));
  col = mix(col, vec3(luma), uCloud * 0.35);

  // Lightning flash lights up the whole sky.
  col += uFlash * vec3(0.55, 0.6, 0.8) * (0.4 + 0.6 * smoothstep(-0.1, 0.6, h));

  gl_FragColor = vec4(col, 1.0);
}
`;

export interface SkyDome {
  readonly mesh: THREE.Mesh;
  /** Push a new sky state into the shader. Cheap; call when time, season or weather change. */
  set(values: SkyUniformValues): void;
  /** Call every frame for star twinkle and cloud drift. */
  tick(elapsedSeconds: number): void;
  dispose(): void;
}

export function createSkyDome(): SkyDome {
  const geometry = new THREE.SphereGeometry(1, 48, 24);
  const u = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uMoonLight: { value: new THREE.Vector3(0, 0, 1) },
    uZenith: { value: new THREE.Color(0.2, 0.4, 0.8) },
    uHorizon: { value: new THREE.Color(0.55, 0.78, 0.94) },
    uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
    uSunVis: { value: 1 },
    uMoonVis: { value: 0 },
    uStars: { value: 0 },
    uGlowK: { value: 0 },
    uNight: { value: 0 },
    uCloud: { value: 0.25 },
    uFlash: { value: 0 },
    uTime: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'sky-dome';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // Nothing may pick the sky.
  mesh.raycast = () => undefined;

  return {
    mesh,
    set(v) {
      u.uSunDir.value.set(...v.sunDir);
      u.uMoonDir.value.set(...v.moonDir);
      u.uMoonLight.value.set(...v.moonLight);
      u.uZenith.value.setRGB(...v.zenith);
      u.uHorizon.value.setRGB(...v.horizon);
      u.uSunColor.value.setRGB(...v.sunColor);
      u.uSunVis.value = v.sunVis;
      u.uMoonVis.value = v.moonVis;
      u.uStars.value = v.stars;
      u.uGlowK.value = v.glowK;
      u.uNight.value = v.nightness;
      u.uCloud.value = v.cloudiness;
      u.uFlash.value = v.flash;
    },
    tick(t) {
      u.uTime.value = t;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
