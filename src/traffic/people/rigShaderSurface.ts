// GLSL for the surface shading of the NEAR person material (T-0025), compiled only under `#define PERSON_NEAR`
// (rigShader.ts). The far material never sees it.
//   - Occlusion (fake AO): a per-vertex term from part id and model height (under the chin and at the neck base,
//     armpits and the inner upper arm, crotch and inner thighs, shoe tops, under hair and hat brims, the torso
//     bottom against the coat flare). It darkens the diffuse colour by uAoK.
//   - Cloth: a fine woven pattern (two orthogonal sine stripes plus a coarse hash) on the clothing regions only,
//     faded with the view distance, and fold darkening around the elbow and knee heights. Scaled by uClothK.
//     It runs before the dots, hearts and stripes of patternColour(), which stay on top.
//   - Rim: a soft view-dependent edge light added to the indirect light, coloured by the scene's hemisphere and sun
//     light colours (already multiplied by their intensity, so it fades at night). Scaled by uRimK.
// Model heights scale with the age group: s = hip height / 0.95 (adult 1).

export const SURF_VERT = /* glsl */ `
#ifdef PERSON_NEAR
varying vec4 vSurf; // x: cloth 0/1, y: fold 0..1, z: occlusion 0..1
void setSurface() {
  int part = int(aRig.x + 0.5);
  int r = int(aRig.y + 0.5);
  int flags = int(aLook2.y + 0.5);
  float s = uHip.x / 0.95;
  float y = position.y;
  float neckY = uNeck.x + (uNeck.y > 0.001 ? 0.03 * s : 0.0);
  float occ = 0.0;
  if (part == 9) occ = max(occ, (1.0 - smoothstep(neckY, neckY + 0.07 * s, y)) * 0.8);
  bool hair = (part >= 14 && part <= 20) || part == 24;
  if (hair) occ = max(occ, (1.0 - smoothstep(neckY + 0.05 * s, neckY + 0.17 * s, y)) * 0.6);
  if (part == 10) occ = max(occ, (1.0 - smoothstep(neckY + 0.16 * s, neckY + 0.22 * s, y)) * 0.6);
  if (part == 0 && r == 4) occ = max(occ, (1.0 - smoothstep(uHip.x - 0.05 * s, uHip.x + 0.04 * s, y)) * 0.7);
  if (part == 0 && r == 3) occ = max(occ, (1.0 - smoothstep(uHip.x + 0.09 * s, uHip.x + 0.22 * s, y)) * 0.35);
  if (part == 5 || part == 6) {
    float inner = clamp((0.225 * s - abs(position.x)) / (0.05 * s), 0.0, 1.0);
    occ = max(occ, inner * (1.0 - smoothstep(1.42 * s - 0.22 * s, 1.42 * s - 0.03 * s, y)) * 0.8);
  }
  if (part == 1 || part == 2) {
    float inner = clamp((0.092 * s - abs(position.x)) / (0.05 * s), 0.0, 1.0);
    occ = max(occ, inner * smoothstep(uHip.x - 0.3 * s, uHip.x, y) * 0.7);
  }
  if ((part == 3 || part == 4) && r == 0) {
    float top = smoothstep(0.02 * s, 0.09 * s, y) * (1.0 - smoothstep(0.09 * s, 0.14 * s, y)) * 0.6;
    occ = max(occ, top + (1.0 - smoothstep(0.0, 0.02 * s, y)) * 0.5);
  }
  bool cloth = r == 3 || r == 4 || r == 5 || (r == 6 && (flags & 8) == 0) || (r == 7 && (flags & 16) == 0);
  float fold = 0.0;
  if (part >= 5 && part <= 8) fold = exp(-pow((y - 1.14 * s) / (0.04 * s), 2.0));
  if (part >= 1 && part <= 4) fold = exp(-pow((y - 0.51 * s) / (0.05 * s), 2.0));
  vSurf = vec4(cloth ? 1.0 : 0.0, fold, min(occ, 1.0), 0.0);
}
#endif
`;

export const SURF_FRAG = /* glsl */ `
#ifdef PERSON_NEAR
varying vec4 vSurf;
uniform float uAoK;
uniform float uRimK;
uniform float uClothK;
float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 clothColour(vec3 col, float dist) {
  if (vSurf.x < 0.5 || uClothK <= 0.0) return col;
  float fade = 1.0 - smoothstep(4.0, 14.0, dist);
  vec3 p = vPatPos;
  float weave = 0.5 * sin(p.x * 1100.0) + 0.5 * sin(p.y * 1100.0);
  float grain = sHash(floor(p.xy * 170.0) + floor(p.z * 170.0)) - 0.5;
  float m = (0.2 * weave + 0.16 * grain) * fade;
  float fold = vSurf.y * (0.75 + 0.25 * sin(p.x * 90.0 + p.z * 60.0));
  return col * (1.0 + uClothK * m) * (1.0 - uClothK * 0.9 * fold);
}
#endif
`;

/** Inserted after lights_fragment_end: adds the rim light to the indirect diffuse. */
export const RIM_CODE = /* glsl */ `
#ifdef PERSON_NEAR
{
  vec3 rimLight = vec3(0.0);
  #if NUM_HEMI_LIGHTS > 0
  rimLight += hemisphereLights[0].skyColor * 0.8;
  #endif
  #if NUM_DIR_LIGHTS > 0
  rimLight += directionalLights[0].color * 0.25;
  #endif
  float rimF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.5) * 3.0;
  reflectedLight.indirectDiffuse += rimLight * rimF * uRimK * diffuseColor.rgb;
}
#endif
`;
