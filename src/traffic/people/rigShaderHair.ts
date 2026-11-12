// GLSL for hair and skin shading of the NEAR person material (T-0026), compiled only under `#define PERSON_NEAR`.
// vSurf.w (set in setSurface, rigShaderSurface.ts) marks the surface: 1 hair (region HAIR), 2 skin (region SKIN, bare
// shins and short sleeves).
//   - Hair strands: stretched hash noise (fine across, coarse along model y), +/- 19 percent luminance at hairSheen 1 (0.38 * 0.5), faded by
//     view distance. A Kajiya-Kay-like specular band from the sun direction, the view vector and an upright tangent,
//     tinted by the hair colour and stronger for light hair; coloured by the sun colour (already scaled by its
//     intensity), so it follows the light level at night.
//   - Skin: a warm, more saturated grazing edge (cheap subsurface look) for every skin surface; on the head also a
//     cheek and nose tint and darker ears and neck crease, from the head-local coordinates of the face code. The tint
//     runs BEFORE faceColour(), so eyes, brows and lips stay crisp. The edge term is monotonic in each colour channel, so palette skin
//     luminance order is kept by construction (a darker skin never ends up brighter than a lighter one); nothing is clamped.
// Strengths: uHairK (hairSheen) and uSkinK (skinWarmth); 1 is the strong end of the useful range.

export const HAIR_FRAG = /* glsl */ `
#ifdef PERSON_NEAR
uniform float uHairK;
uniform float uSkinK;
vec3 hairColour(vec3 col, float dist) {
  float fade = 1.0 - smoothstep(3.0, 9.0, dist);
  vec3 p = vPatPos;
  float across = floor((p.x + 0.7 * p.z) * 220.0);
  float strand = sHash(vec2(across, floor(p.y * 24.0))) - 0.5;
  float fine = sHash(vec2(across * 1.7 + 3.0, floor(p.y * 90.0))) - 0.5;
  return col * (1.0 + uHairK * 0.38 * (0.7 * strand + 0.3 * fine) * fade);
}
vec3 skinTint(vec3 skin) {
  vec3 q = (vPatPos - uHeadC) / uHeadR;
  float front = smoothstep(0.45, 0.6, q.z);
  vec3 blush = vec3(1.14, 0.68, 0.62);
  float cheek = (1.0 - smoothstep(0.1, 0.34, length(vec2(abs(q.x) - 0.52, q.y + 0.2)))) * front;
  float nose = (1.0 - smoothstep(0.04, 0.16, length(vec2(q.x, q.y + 0.26)))) * front;
  vec3 c = mix(skin, skin * blush, clamp(0.9 * cheek + 0.7 * nose, 0.0, 1.0) * uSkinK);
  float ear = smoothstep(0.82, 0.98, abs(q.x)) * (1.0 - smoothstep(0.1, 0.4, q.z));
  float neck = 1.0 - smoothstep(-1.15, -0.95, q.y);
  return c * (1.0 - uSkinK * (0.14 * ear + 0.1 * neck));
}
#endif
`;

/** Inserted after the rim light: hair sheen and the skin warm edge, both added to the indirect diffuse. */
export const HAIR_LIGHT = /* glsl */ `
#ifdef PERSON_NEAR
if (vSurf.w > 0.5) {
  vec3 nrm = normalize(normal);
  vec3 vdir = normalize(vViewPosition);
  float ndv = clamp(dot(nrm, vdir), 0.0, 1.0);
  if (vSurf.w < 1.5) {
    #if NUM_DIR_LIGHTS > 0
    vec3 sun = directionalLights[0].direction;
    vec3 hv = normalize(sun + vdir);
    vec3 tang = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    float th = dot(tang, hv);
    float band = pow(sqrt(max(0.0, 1.0 - th * th)), 36.0);
    float lit = smoothstep(-0.1, 0.4, dot(nrm, sun));
    float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    vec3 tint = mix(vec3(1.0), diffuseColor.rgb / max(lum, 0.05), 0.35);
    reflectedLight.indirectDiffuse += directionalLights[0].color * tint * band * lit * uHairK * (0.3 + 2.2 * lum);
    #endif
  } else {
    vec3 sky = vec3(0.0);
    #if NUM_HEMI_LIGHTS > 0
    sky += hemisphereLights[0].skyColor * 0.8;
    #endif
    #if NUM_DIR_LIGHTS > 0
    sky += directionalLights[0].color * 0.3;
    #endif
    vec3 warm = min(pow(diffuseColor.rgb, vec3(0.9, 1.35, 1.8)) * 1.25, diffuseColor.rgb * 1.6 + 0.02);
    float edge = pow(1.0 - ndv, 3.0);
    reflectedLight.indirectDiffuse += sky * warm * edge * uSkinK * 3.0;
  }
}
#endif
`;
