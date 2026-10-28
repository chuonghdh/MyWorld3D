// Fog: a density function for scene.fog and a drifting bank of soft low sprites (1 draw call).
import * as THREE from 'three';
import type { WeatherKind } from './weatherState';

/**
 * Multiplier for the scene fog density (1 = untouched). Linear fog: divide the near/far distances
 * by this value, see applyFogRange. `fog` is the eased 0..1 fog thickness from the controller,
 * `rain` the eased rain amount.
 */
export function fogDensityMultiplier(fog: number, rain = 0, snowfall = 0): number {
  const f = Math.min(1, Math.max(0, fog));
  return 1 + f * f * 11 + f * 2 + rain * 1.2 + snowfall * 1.5;
}

/** Applies the multiplier to a linear fog given its clear-weather near and far. */
export function applyFogRange(fog: THREE.Fog, baseNear: number, baseFar: number, mul: number): void {
  fog.near = baseNear / mul;
  fog.far = Math.max(fog.near + 10, baseFar / mul);
}

const GREY_FOG = new THREE.Color('#aeb4bb');
const STORM_GREY = new THREE.Color('#5c6672');
const SNOW_GREY = new THREE.Color('#c8cfd8');

/**
 * Colour the fog and sky tint toward for a weather state. Writes into `out` (no allocation) and
 * returns it. Strength 0..1 is how far to blend from the untouched scene colour.
 */
export function fogTintFor(kind: WeatherKind, amount: number, light: number, out: THREE.Color): THREE.Color {
  const base = kind === 'storm' ? STORM_GREY : kind === 'snow' ? SNOW_GREY : GREY_FOG;
  out.copy(base).multiplyScalar(0.25 + 0.75 * Math.min(1, Math.max(0, light)));
  void amount;
  return out;
}

const BANK_VERT = /* glsl */ `
attribute vec4 aBank; // x,z in 0..1 within the area, size, phase
uniform float uTime;
uniform vec2 uCamXZ;
uniform float uArea;
uniform vec2 uDrift;
uniform float uHeight;
varying vec2 vUv;
varying float vA;
void main() {
  vec2 p = aBank.xy * uArea + uDrift * uTime * (0.6 + 0.4 * aBank.w);
  vec2 rel = mod(p - uCamXZ + uArea * 0.5, uArea) - uArea * 0.5;
  float size = aBank.z;
  float bob = 0.04 * (1.0 + sin(uTime * 0.1 + aBank.w * 6.28));
  vec3 wp = vec3(uCamXZ.x + rel.x, 0.15 + size * bob, uCamXZ.y + rel.y);
  // vertical sprite that faces the camera horizontally
  vec3 toCam = cameraPosition - wp;
  vec2 f = normalize(toCam.xz + vec2(1e-4));
  vec3 right = vec3(f.y, 0.0, -f.x);
  wp += right * position.x * size * 2.0;
  wp.y += position.y * size * 0.8 * uHeight;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  vUv = position.xy * 2.0;
  float dist = length(toCam);
  float edge = 1.0 - smoothstep(0.38, 0.5, max(abs(rel.x), abs(rel.y)) / uArea);
  // Fade out well before the camera is inside a sprite, or it becomes a white curtain.
  vA = edge * smoothstep(size * 1.2, size * 3.5, dist);
}
`;

const BANK_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
varying float vA;
void main() {
  vec2 q = vec2(vUv.x, vUv.y - 1.0);
  float d = length(q);
  float a = pow(clamp(1.0 - d, 0.0, 1.0), 1.6) * vA * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

export const MAX_BANKS = 48;

export interface FogBankParams {
  /** Eased fog thickness 0..1. */
  fog: number;
  wind: { x: number; z: number };
  camera: { x: number; y: number; z: number };
  tint: THREE.Color;
  /** Seconds are accumulated internally. */
}

/** Soft ground-hugging fog sprites around the camera. Visible only when fog > 0.05. */
export class FogBanks {
  readonly mesh: THREE.Mesh;
  private geo = new THREE.InstancedBufferGeometry();
  private mat: THREE.ShaderMaterial;
  private clock = 0;
  count = 0;

  constructor() {
    const quad = new THREE.BufferGeometry();
    quad.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3),
    );
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    let s = 24681357;
    const rnd = () => {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296;
    };
    const a = new Float32Array(MAX_BANKS * 4);
    for (let i = 0; i < MAX_BANKS; i++) {
      a[i * 4] = rnd();
      a[i * 4 + 1] = rnd();
      a[i * 4 + 2] = 14 + rnd() * 22;
      a[i * 4 + 3] = rnd();
    }
    this.geo.setAttribute('aBank', new THREE.InstancedBufferAttribute(a, 4));
    this.geo.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: BANK_VERT,
      fragmentShader: BANK_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uCamXZ: { value: new THREE.Vector2() },
        uArea: { value: 300 },
        uDrift: { value: new THREE.Vector2() },
        uHeight: { value: 1 },
        uColor: { value: new THREE.Color('#b9bfc6') },
        uAlpha: { value: 0.2 },
      },
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 18;
    this.mesh.visible = false;
    this.mesh.name = 'weather-fog-banks';
  }

  update(dt: number, p: FogBankParams): void {
    this.clock += dt;
    this.count = p.fog > 0.05 ? Math.ceil(MAX_BANKS * Math.min(1, p.fog)) : 0;
    this.mesh.visible = this.count > 0;
    if (this.count === 0) return;
    this.geo.instanceCount = this.count;
    const u = this.mat.uniforms;
    u.uTime.value = this.clock;
    (u.uCamXZ.value as THREE.Vector2).set(p.camera.x, p.camera.z);
    // Slow, capped drift: fog banks creep, they do not race with the wind.
    (u.uDrift.value as THREE.Vector2).set(THREE.MathUtils.clamp(p.wind.x * 0.1, -0.6, 0.6), THREE.MathUtils.clamp(p.wind.z * 0.1, -0.6, 0.6));
    u.uArea.value = THREE.MathUtils.clamp(160 + p.camera.y * 1.5, 160, 420);
    // Banks lie low, so from high above they thin out instead of hiding the town.
    u.uAlpha.value = 0.4 * Math.min(1, p.fog) / (1 + p.camera.y / 90);
    (u.uColor.value as THREE.Color).copy(p.tint);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
