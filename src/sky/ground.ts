// Ground disc beyond the town: a big flat disc under everything, tinted by season with soft
// field patches, fading into the horizon colour with the same distance fog as the town.
// It sits GROUND_DISC_Y below the town base (y = 0), so it never fights the grass ring, and it
// follows the camera so the edge of the world is never visible.

import * as THREE from 'three';
import { GROUND_Y } from '../streets/surfaces';
import type { SkyUniformValues } from './state';

/** A few centimetres under the town's base plane (GROUND_Y = 0); the stone edge reaches -0.1. */
export const GROUND_DISC_Y = GROUND_Y - 0.06;
/** Disc radius in metres at full size; scaled down when the camera far plane is closer. */
export const GROUND_DISC_RADIUS = 1100;

const VERTEX = /* glsl */ `
varying vec2 vWorld;
varying float vDist;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xz;
  vec4 mv = viewMatrix * w;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uLight;
uniform vec3 uHorizon;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFlash;
varying vec2 vWorld;
varying float vDist;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  // Large soft fields plus fine grain; no hard edges.
  float fields = vnoise(vWorld / 140.0) * 0.6 + vnoise(vWorld / 47.0) * 0.4;
  float grain = vnoise(vWorld / 6.0);
  vec3 tint = mix(vec3(0.82, 0.9, 0.78), vec3(1.12, 1.06, 0.86), fields);
  vec3 col = uColor * tint * (0.94 + 0.12 * grain) * uLight;
  col += uFlash * 0.15;
  float f = smoothstep(uFogNear, uFogFar, vDist);
  gl_FragColor = vec4(mix(col, uHorizon, f), 1.0);
}
`;

export interface GroundDisc {
  readonly mesh: THREE.Mesh;
  set(values: SkyUniformValues, fogNear: number, fogFar: number): void;
  /** Call every frame: keeps the disc centred under the camera and inside its far plane. */
  follow(camera: THREE.Camera): void;
  dispose(): void;
}

export function createGroundDisc(): GroundDisc {
  const geometry = new THREE.CircleGeometry(1, 64);
  geometry.rotateX(-Math.PI / 2);
  const u = {
    uColor: { value: new THREE.Color('#7f9a5a') },
    uLight: { value: new THREE.Color(1, 1, 1) },
    uHorizon: { value: new THREE.Color(0.55, 0.78, 0.94) },
    uFogNear: { value: 500 },
    uFogFar: { value: 1400 },
    uFlash: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERTEX, fragmentShader: FRAGMENT, fog: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ground-disc';
  mesh.position.y = GROUND_DISC_Y;
  mesh.scale.setScalar(GROUND_DISC_RADIUS);
  mesh.frustumCulled = false;
  mesh.renderOrder = -900;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = () => undefined;

  let fogFar = 1400;

  return {
    mesh,
    set(v, near, far) {
      u.uColor.value.setRGB(...v.groundColor);
      u.uLight.value.setRGB(...v.groundLight);
      u.uHorizon.value.setRGB(...v.horizon);
      u.uFlash.value = v.flash;
      u.uFogNear.value = near;
      fogFar = far;
      u.uFogFar.value = far;
    },
    follow(camera) {
      const far = (camera as THREE.PerspectiveCamera).far ?? 2000;
      const radius = Math.min(GROUND_DISC_RADIUS, far * 0.85);
      mesh.scale.setScalar(radius);
      mesh.position.x = camera.position.x;
      mesh.position.z = camera.position.z;
      // Fully fogged before the rim so the edge never shows against the sky.
      u.uFogFar.value = Math.min(fogFar, radius * 0.8);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
