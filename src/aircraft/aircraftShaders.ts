// GLSL for the airliner mesh: per-instance livery, night beacons, sun and ambient shading.

export const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aLight;
attribute float aPart;
attribute vec3 iFin;
attribute vec3 iEngine;
attribute vec3 iBelly;
varying vec3 vColor;
varying float vLight;
varying vec3 vNormal;
#include <fog_pars_vertex>
void main() {
  vColor = aColor;
  // Per-aircraft livery: tail fin and engines take the instance colours; the lower fuselage takes the belly colour.
  if (aPart > 2.5) vColor = iFin;
  else if (aPart > 1.5) vColor = iEngine;
  else if (aPart < 0.5) vColor = mix(aColor, iBelly, 1.0 - smoothstep(-0.62, -0.42, position.y));
  vLight = aLight;
  vNormal = mat3(instanceMatrix) * normal;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

export const FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform float uSunK;
uniform float uNight;
uniform float uTime;
varying vec3 vColor;
varying float vLight;
varying vec3 vNormal;
#include <fog_pars_fragment>
void main() {
  vec3 col;
  if (vLight > 0.5) {
    // Red beacon blinks once a second; the white strobe double-flashes every 1.4 s.
    float red = step(fract(uTime * 1.0), 0.18);
    float ph = fract(uTime / 1.4);
    float white = step(ph, 0.06) + step(0.16, ph) * step(ph, 0.22);
    float on = vLight < 1.5 ? red : white;
    vec3 lamp = vLight < 1.5 ? vec3(1.0, 0.1, 0.08) : vec3(1.0, 0.97, 0.9);
    col = mix(vColor * 0.2, lamp * 3.0, on * uNight) ;
    col = mix(col, lamp, (1.0 - uNight) * 0.6);
  } else {
    vec3 n = normalize(vNormal);
    float wrap = dot(n, uSunDir) * 0.5 + 0.5;
    // Flat-ish: the sun only adds a gentle gradient on top of the ambient light.
    col = vColor * (uAmbient + uSunColor * uSunK * (0.35 + 0.65 * wrap));
    col = clamp(col, vec3(0.0), vec3(1.2));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;
