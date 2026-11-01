// Rain streaks and ground ripples. Both are GPU-animated: the CPU only writes a handful of uniforms
// per frame, positions are computed in the vertex shader from a static per-instance seed, wrapped
// inside a box that follows the camera. Streaks: 1 draw call, up to MAX_STREAKS instances.
// Ripples: 1 draw call, up to MAX_RIPPLES flat rings just above the ground.
import { skyEnvironment } from '../config/tuning';
import * as THREE from 'three';

export const MAX_STREAKS = skyEnvironment.weather.maxRainStreaks;
export const MAX_RIPPLES = skyEnvironment.weather.maxRainRipples;

const STREAK_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform vec3 uVel;
uniform vec3 uBox;
uniform float uLen;
uniform float uAlpha;
uniform vec2 uCamXZ;
varying float vA;
void main() {
  float speedK = 0.85 + 0.3 * fract(aSeed.w * 7.31);
  vec3 start = aSeed.xyz * uBox;
  vec3 p = start + uVel * speedK * uTime;
  // wrap into a box centred (horizontally) on the camera, standing on the ground
  vec2 rel = mod(p.xz - uCamXZ + uBox.xz * 0.5, uBox.xz) - uBox.xz * 0.5;
  float y = mod(p.y, uBox.y);
  vec3 head = vec3(uCamXZ.x + rel.x, y, uCamXZ.y + rel.y);
  vec3 tail = head - normalize(uVel) * uLen * (0.7 + 0.6 * fract(aSeed.w * 3.7));
  vec4 v0 = viewMatrix * vec4(head, 1.0);
  vec4 v1 = viewMatrix * vec4(tail, 1.0);
  vec3 d = v1.xyz - v0.xyz;
  vec3 right = normalize(cross(d, normalize(v0.xyz)));
  float dist = -v0.z;
  float w = max(0.012, dist * 0.0011);
  vec4 vp = mix(v0, v1, position.y);
  vp.xyz += right * position.x * w;
  gl_Position = projectionMatrix * vp;
  // fade: box edge, too close to the camera, behind camera, below ground
  float edge = 1.0 - smoothstep(0.35, 0.5, max(abs(rel.x) / uBox.x, abs(rel.y) / uBox.z));
  float near = smoothstep(0.5, 2.5, dist);
  float tailFade = 1.0 - 0.7 * position.y;
  // thin streaks shimmer when sub-pixel; the min width above plus a lower alpha keeps them calm
  vA = uAlpha * edge * near * tailFade * (0.55 + 0.45 * fract(aSeed.w * 13.7));
}
`;

const STREAK_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  if (vA < 0.004) discard;
  gl_FragColor = vec4(uColor, vA);
}
`;

const RIPPLE_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform vec2 uCamXZ;
uniform float uRadius;
uniform float uRate;
varying vec2 vUv;
varying float vLife;
varying float vFade;
float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  float t = uTime * uRate * (0.8 + 0.4 * aSeed.w) + aSeed.z * 17.0;
  float cycle = floor(t);
  vLife = fract(t);
  vec2 jit = vec2(h11(cycle + aSeed.x * 91.0), h11(cycle * 1.7 + aSeed.y * 57.0));
  vec2 base = (aSeed.xy + jit * 0.37) * 2.0 * uRadius;
  vec2 rel = mod(base - uCamXZ + uRadius, 2.0 * uRadius) - uRadius;
  float rad = 0.12 + 0.55 * vLife;
  vec3 wp = vec3(uCamXZ.x + rel.x, 0.045, uCamXZ.y + rel.y);
  wp.xz += position.xy * rad * 2.0;
  vUv = position.xy * 2.0;
  vFade = 1.0 - smoothstep(0.55, 1.0, length(rel) / uRadius);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const RIPPLE_FRAG = /* glsl */ `
uniform float uAlpha;
uniform vec3 uColor;
varying vec2 vUv;
varying float vLife;
varying float vFade;
void main() {
  float r = length(vUv);
  float w = max(fwidth(r), 0.02);
  float a = 1.0 - smoothstep(0.04, 0.16 + w, abs(r - 0.8));
  a *= (1.0 - vLife) * (1.0 - vLife);
  a *= uAlpha * vFade;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

function seeds(count: number, seed: number): Float32Array {
  // Small deterministic generator: appearance only, nothing derived from the city seed.
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  const a = new Float32Array(count * 4);
  for (let i = 0; i < a.length; i++) a[i] = rnd();
  return a;
}

export interface RainParams {
  /** 0..1 rain amount (eased). */
  rain: number;
  /** Wind the rain is slanted by, m/s (x east, z south). */
  wind: { x: number; z: number };
  /** Camera world position. */
  camera: { x: number; y: number; z: number };
  /** 0..1 light level, tints the streaks so night rain does not glow. */
  light: number;
  /** Seconds. */
  time: number;
}

export class Rain {
  readonly group = new THREE.Group();
  readonly streaks: THREE.Mesh;
  readonly ripples: THREE.Mesh;
  private streakGeo = new THREE.InstancedBufferGeometry();
  private rippleGeo = new THREE.InstancedBufferGeometry();
  private streakMat: THREE.ShaderMaterial;
  private rippleMat: THREE.ShaderMaterial;
  private clock = 0;
  /** Streaks drawn this frame (for tests and the perf readout). */
  streakCount = 0;
  rippleCount = 0;

  constructor() {
    const quad = new THREE.BufferGeometry();
    quad.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3),
    );
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    this.streakGeo.index = quad.index;
    this.streakGeo.setAttribute('position', quad.getAttribute('position'));
    this.streakGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds(MAX_STREAKS, 12345), 4));
    this.streakGeo.instanceCount = 0;

    const ring = new THREE.BufferGeometry();
    ring.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3),
    );
    ring.setIndex([0, 1, 2, 0, 2, 3]);
    this.rippleGeo.index = ring.index;
    this.rippleGeo.setAttribute('position', ring.getAttribute('position'));
    this.rippleGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds(MAX_RIPPLES, 777), 4));
    this.rippleGeo.instanceCount = 0;

    this.streakMat = new THREE.ShaderMaterial({
      vertexShader: STREAK_VERT,
      fragmentShader: STREAK_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uVel: { value: new THREE.Vector3(0, -9, 0) },
        uBox: { value: new THREE.Vector3(60, 40, 60) },
        uLen: { value: 0.5 },
        uAlpha: { value: 0.3 },
        uCamXZ: { value: new THREE.Vector2() },
        uColor: { value: new THREE.Color('#cfd8e3') },
      },
    });
    this.rippleMat = new THREE.ShaderMaterial({
      vertexShader: RIPPLE_VERT,
      fragmentShader: RIPPLE_FRAG,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uCamXZ: { value: new THREE.Vector2() },
        uRadius: { value: 22 },
        uRate: { value: 1.1 },
        uAlpha: { value: 0.5 },
        uColor: { value: new THREE.Color('#dfe7ef') },
      },
    });
    // The geometries are 4 vertices; the bounds are meaningless because the shader moves everything.
    this.streaks = new THREE.Mesh(this.streakGeo, this.streakMat);
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 20;
    this.ripples = new THREE.Mesh(this.rippleGeo, this.rippleMat);
    this.ripples.frustumCulled = false;
    this.ripples.renderOrder = 19;
    this.streaks.visible = false;
    this.ripples.visible = false;
    this.group.add(this.ripples, this.streaks);
    this.group.name = 'weather-rain';
  }

  update(dt: number, p: RainParams): void {
    this.clock += dt;
    const rain = Math.min(1, Math.max(0, p.rain));
    this.streakCount = Math.floor(MAX_STREAKS * Math.pow(rain, 0.9));
    this.rippleCount = Math.floor(MAX_RIPPLES * Math.min(1, rain * 1.1)) ;
    const on = rain > 0.01;
    this.streaks.visible = on && this.streakCount > 0;
    this.ripples.visible = on && this.rippleCount > 0;
    if (!on) return;

    this.streakGeo.instanceCount = this.streakCount;
    this.rippleGeo.instanceCount = this.rippleCount;

    // Volume follows the camera; it grows with camera height so the rain stays visible from above.
    const side = THREE.MathUtils.clamp(26 + p.camera.y * 0.9, 30, 150);
    const u = this.streakMat.uniforms;
    u.uTime.value = this.clock;
    (u.uBox.value as THREE.Vector3).set(side, 38, side);
    (u.uCamXZ.value as THREE.Vector2).set(p.camera.x, p.camera.z);
    const fall = 8.5 + 3 * rain;
    (u.uVel.value as THREE.Vector3).set(p.wind.x * 0.55, -fall, p.wind.z * 0.55);
    u.uLen.value = 0.35 + 0.35 * rain + THREE.MathUtils.clamp(side / 120, 0, 1) * 0.5;
    u.uAlpha.value = (0.16 + 0.22 * rain) * (0.35 + 0.65 * p.light);
    (u.uColor.value as THREE.Color).setRGB(0.55 + 0.4 * p.light, 0.6 + 0.35 * p.light, 0.68 + 0.3 * p.light);

    const r = this.rippleMat.uniforms;
    r.uTime.value = this.clock;
    (r.uCamXZ.value as THREE.Vector2).set(p.camera.x, p.camera.z);
    r.uRadius.value = THREE.MathUtils.clamp(14 + p.camera.y * 0.25, 16, 45);
    r.uRate.value = 0.7 + 0.9 * rain;
    r.uAlpha.value = 0.25 + 0.4 * rain * (0.4 + 0.6 * p.light);
  }

  dispose(): void {
    this.streakGeo.dispose();
    this.rippleGeo.dispose();
    this.streakMat.dispose();
    this.rippleMat.dispose();
  }
}
