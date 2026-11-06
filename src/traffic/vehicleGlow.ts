// Additive headlight pools on the road ahead of moving cars (night only).

import * as THREE from 'three';

export function glowMaterial(night: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: { uNight: night },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vCol;
      void main() {
        vUv = vec2(position.x + 0.5, position.z);
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #else
          vCol = vec3(1.0);
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uNight;
      varying vec2 vUv;
      varying vec3 vCol;
      void main() {
        // Interpolation can push v a hair past 1 at the far edge; pow() of a negative base is NaN,
        // and a NaN added to the frame shows up as black dashes along the edge of the pool.
        float v = clamp(vUv.y, 0.0, 1.0);
        float half_w = mix(0.3, 1.0, v);
        float xn = min(abs(vUv.x * 2.0 - 1.0) / half_w, 1.0);
        float a = pow(max(1.0 - v, 0.0), 1.7) * (1.0 - smoothstep(0.35, 1.0, xn));
        a *= smoothstep(0.0, 0.06, v);
        gl_FragColor = vec4(vCol * a * 0.55 * uNight, 1.0);
      }
    `,
  });
}
