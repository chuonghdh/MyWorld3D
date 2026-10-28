// Snowfall: one THREE.Points draw call, animated entirely in the vertex shader inside a box that
// follows the camera. Flakes drift with the wind and swirl a little; the count scales with intensity.
import * as THREE from 'three';

export const MAX_FLAKES = 12000;

const VERT = /* glsl */ `
attribute float aW;
uniform float uTime;
uniform vec3 uVel;
uniform vec3 uBox;
uniform vec2 uCamXZ;
uniform float uSize;
uniform float uPixelScale;
varying float vA;
void main() {
  float k = 0.7 + 0.6 * aW;
  vec3 start = position * uBox;
  vec3 p = start + uVel * k * uTime;
  float ph = aW * 40.0 + uTime * (0.6 + aW);
  p.x += sin(ph) * 0.5;
  p.z += cos(ph * 0.83) * 0.5;
  vec2 rel = mod(p.xz - uCamXZ + uBox.xz * 0.5, uBox.xz) - uBox.xz * 0.5;
  float y = mod(p.y, uBox.y);
  vec3 wp = vec3(uCamXZ.x + rel.x, y, uCamXZ.y + rel.y);
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 0.1);
  gl_PointSize = clamp(uSize * uPixelScale / dist, 1.5, 14.0) * (0.7 + 0.6 * aW);
  float edge = 1.0 - smoothstep(0.38, 0.5, max(abs(rel.x) / uBox.x, abs(rel.y) / uBox.z));
  vA = edge * smoothstep(0.4, 2.0, dist) * (0.55 + 0.45 * aW);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = (1.0 - smoothstep(0.18, 0.5, d)) * vA * uAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

export interface SnowParams {
  /** 0..1 snowfall (eased). */
  snow: number;
  wind: { x: number; z: number };
  camera: { x: number; y: number; z: number };
  light: number;
  /** Drawing buffer height in pixels / (2 tan(fov/2)); pass 600 if unknown. */
  pixelScale?: number;
}

export class Snow {
  readonly points: THREE.Points;
  readonly group = new THREE.Group();
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;
  private clock = 0;
  count = 0;

  constructor() {
    let s = 987654321;
    const rnd = () => {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296;
    };
    const pos = new Float32Array(MAX_FLAKES * 3);
    const w = new Float32Array(MAX_FLAKES);
    for (let i = 0; i < MAX_FLAKES; i++) {
      pos[i * 3] = rnd();
      pos[i * 3 + 1] = rnd();
      pos[i * 3 + 2] = rnd();
      w[i] = rnd();
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('aW', new THREE.BufferAttribute(w, 1));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uVel: { value: new THREE.Vector3(0, -1.4, 0) },
        uBox: { value: new THREE.Vector3(50, 30, 50) },
        uCamXZ: { value: new THREE.Vector2() },
        uSize: { value: 0.06 },
        uPixelScale: { value: 600 },
        uColor: { value: new THREE.Color('#ffffff') },
        uAlpha: { value: 0.85 },
      },
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 21;
    this.points.visible = false;
    this.group.add(this.points);
    this.group.name = 'weather-snow';
  }

  update(dt: number, p: SnowParams): void {
    this.clock += dt;
    const snow = Math.min(1, Math.max(0, p.snow));
    this.count = Math.floor(MAX_FLAKES * snow);
    this.points.visible = this.count > 0;
    if (this.count === 0) return;
    this.geo.setDrawRange(0, this.count);
    const u = this.mat.uniforms;
    const side = THREE.MathUtils.clamp(22 + p.camera.y * 0.7, 26, 120);
    u.uTime.value = this.clock;
    (u.uBox.value as THREE.Vector3).set(side, 30, side);
    (u.uCamXZ.value as THREE.Vector2).set(p.camera.x, p.camera.z);
    (u.uVel.value as THREE.Vector3).set(p.wind.x * 0.4, -(1.1 + 0.8 * snow), p.wind.z * 0.4);
    u.uPixelScale.value = p.pixelScale ?? 600;
    u.uSize.value = 0.05 + 0.04 * snow;
    const l = 0.55 + 0.45 * p.light;
    (u.uColor.value as THREE.Color).setRGB(l, l, Math.min(1, l * 1.04));
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
