// Fountain water: one small ShaderMaterial with rolling ripples and moving glints.
// It needs no lights or textures; `uBright` darkens it at night. Time is written from the mesh's
// onBeforeRender (see index.ts), so the scene needs no extra per-frame hook.

import * as THREE from 'three';

export interface WaterMaterial {
  material: THREE.ShaderMaterial;
  /** 0 = night (dark water) .. 1 = day. */
  setBrightness(k: number): void;
  /** Writes the shader clock in seconds. */
  setTime(seconds: number): void;
}

const VERTEX = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vW = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uBright;
varying vec3 vW;
void main() {
  vec2 p = vW.xz;
  float t = uTime;
  float w = sin(p.x * 5.0 + t * 1.3) + sin(p.y * 6.3 - t * 1.1)
          + sin((p.x + p.y) * 7.7 + t * 1.9) + sin((p.x - p.y) * 11.0 - t * 2.3);
  w *= 0.25;
  vec3 deep = vec3(0.07, 0.30, 0.38);
  vec3 shallow = vec3(0.30, 0.62, 0.70);
  vec3 col = mix(deep, shallow, 0.5 + 0.5 * w);
  // Glints: sparse bright cells that drift and twinkle.
  float g = sin(p.x * 23.0 + t * 3.1) * sin(p.y * 27.0 - t * 2.7);
  col += vec3(0.9, 0.95, 1.0) * pow(max(0.0, g), 14.0) * 0.9;
  // Sky reflection grows toward grazing view angles.
  vec3 v = normalize(cameraPosition - vW);
  float fres = pow(1.0 - abs(v.y), 3.0);
  col = mix(col, vec3(0.62, 0.78, 0.88), fres * 0.55);
  col *= uBright;
  gl_FragColor = vec4(col, 0.84);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createWaterMaterial(): WaterMaterial {
  const uniforms = { uTime: { value: 0 }, uBright: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return {
    material,
    setBrightness(k) {
      uniforms.uBright.value = 0.25 + 0.75 * Math.min(1, Math.max(0, k));
    },
    setTime(seconds) {
      uniforms.uTime.value = seconds;
    },
  };
}
