// GLSL for the aged walls, trims and roofs: weathering, window trims, moss, roof patterns (split from surface.ts).
// Spliced by surface.ts after the core patterns, in the original order.

export const SURFACE_GLSL_ROOF = /* glsl */ `// Window trims, sills and lintels. amt = uTrimAge (mould and stains on the faces), top = uTrimTop (how much darker
// the upward faces are, where rain pools). nrm is the object normal; faces with nrm.y near 1 count as tops.
vec3 patTrimAged(vec3 c, vec2 p, vec3 nrm, float amt, float top) {
  float up = smoothstep(0.6, 0.9, nrm.y);
  float mottle = vnoise(p * 4.0 + 3.0);
  float mould = smoothstep(0.55, 0.8, mottle);
  float blotch = smoothstep(0.5, 0.75, vnoise(p * 0.9 + 6.0));
  float stain = smoothstep(0.6, 0.85, vnoise(vec2(p.x * 12.0, p.y * 0.4)));
  vec3 mouldCol = c * vec3(0.62, 0.68, 0.58);
  vec3 r = mix(c, mouldCol, amt * (0.30 * mould + 0.25 * blotch + 0.35 * up * blotch));
  r *= 1.0 - amt * 0.12 * stain * (0.5 + up);
  return r * (1.0 - top * up);
}

// Weathered roofs (cathedral): the slate or zinc pattern, then moss and lichen toward the eaves and on
// the north-facing side (object frame), soft streaks down the slope, and a faded, warmer upper slope.
// wy is the object-space height (m), nrm the object-space normal.
// Moss and lichen layer of the cathedral roofs, 0..1 before strength: strongest at the eaves (eave factor),
// on the north-facing side (object frame) and in lichen patches (noise on the tangent plane). Used by ageRoof.
float roofMossLayer(vec2 p, float eave, vec3 nrm) {
  float north = smoothstep(0.2, -0.6, nrm.z);
  float lichen = smoothstep(0.45, 0.75, vnoise(p * 1.7));
  return eave * (0.35 + 0.65 * north) * lichen;
}
vec3 ageRoof(vec3 s, vec2 p, float wy, vec3 nrm, float px) {
  float eave = 1.0 - smoothstep(12.0, 18.0, wy);
  float moss = roofMossLayer(p, eave, nrm) * 0.55;
  vec3 mossCol = s * vec3(0.72, 0.86, 0.55);
  vec3 r = mix(s, mossCol, moss);
  float st = vnoise(vec2(p.x * 14.0, p.y * 0.2));
  float streakAmp = (1.0 - smoothstep(0.03, 0.12, px)) * smoothstep(0.55, 0.85, st) * 0.08;
  r *= 1.0 - streakAmp;
  float upper = smoothstep(12.0, 24.0, wy);
  r = mix(r, r * vec3(1.06, 1.0, 0.92), upper * 0.5);
  return r * (1.0 - 0.06 * upper);
}
// House roofs. wy is the object height, wallTop the house wall head (packed in vSurfCode). The band runs from
// the wall head up about 3 m: full at the eaves, gone by 4.5 m up, so ridges stay clean. Inside it, broad
// patches (noise on the tangent plane) and fine crevice streaks take the moss; the north side takes more.
// amt = uRoofMoss times the surface share.
vec3 patRoofMoss(vec3 s, vec2 p, float wy, vec3 nrm, float wallTop, float amt) {
  float eave = 1.0 - smoothstep(wallTop + 1.5, wallTop + 4.5, wy);
  float north = smoothstep(0.3, -0.5, nrm.z);
  float blot = smoothstep(0.35, 0.65, vnoise(p * 1.7));
  float crev = smoothstep(0.5, 0.8, vnoise(p * 6.5));
  float m = eave * (0.45 + 0.55 * north) * (0.6 * blot + 0.5 * crev);
  float moss = clamp(m * amt, 0.0, 1.0);
  return mix(s, s * vec3(0.66, 0.84, 0.48), moss);
}
vec3 patSlateAged(vec3 c, vec2 p, float wy, vec3 nrm, float px, out float h) {
  vec3 s = patSlate(c, p, px, h);
  return ageRoof(s, p, wy, nrm, px);
}
vec3 patZincAged(vec3 c, vec2 p, float wy, vec3 nrm, float px, out float h) {
  vec3 s = patZinc(c, p, px, h);
  return ageRoof(s, p, wy, nrm, px);
}

// Flat roof membrane: gravel speckle (6 cm cells, a few pale stones), tar and bitumen blotches on a 1.4 m scale,
// membrane seams every 3 m, and faint pale drainage scuffs running down the slope (along object y).
vec3 patRoofFlat(vec3 c, vec2 p, float px, out float h) {
  vec2 gc = floor(p / 0.06);
  vec2 hg = hash22(gc);
  float peb = 1.0 + (hg.x - 0.5) * 0.14;
  if (hg.y < 0.06) peb *= 1.25;
  float gf = cellFade(0.06, px);
  float tar = smoothstep(0.55, 0.8, vnoise(p * 0.7 + 4.0));
  vec2 sd = abs(fract(p / 3.0 + 0.5) - 0.5) * 3.0;
  float seam = aaStep(0.012 - min(sd.x, sd.y), px);
  float scuff = smoothstep(0.6, 0.9, vnoise(vec2(p.x * 2.5, p.y * 0.25 + 9.0)));
  scuff *= (1.0 - smoothstep(0.03, 0.12, px)) * 0.10;
  float grav = mix(1.0, peb, gf);
  float v = grav * (1.0 - 0.12 * tar) * (1.0 - 0.10 * seam) * (1.0 + scuff);
  h = (hg.x - 0.5) * 0.004 * gf;
  return c * v;
}

// Raw concrete: 0.3 m shuttering boards, tie holes, vertical streaks.
vec3 patConcrete(vec3 c, vec2 p, float px, out float h) {
  float row = floor(p.y / 0.3);
  float ly = fract(p.y / 0.3);
  float tone = 1.0 + (hash12(vec2(row, 5.1)) - 0.5) * 0.05;
  float joint = 1.0 - 0.18 * (1.0 - aaStep(min(ly, 1.0 - ly) * 0.3 - 0.0015, px));
  vec2 q = vec2(mod(p.x, 1.2) - 0.6, mod(p.y, 0.6) - 0.3);
  float hole = 1.0 - aaStep(0.017 - length(q), px);
  float streakAmp = 1.0 - smoothstep(0.03, 0.12, px);
  float streak = 1.0 + (vnoise(vec2(p.x * 7.0, p.y * 0.35)) - 0.5) * 0.12 * streakAmp;
  vec3 full = c * tone * joint * streak * (1.0 - 0.45 * hole);
  float f = cellFade(0.3, px);
  h = (joint - 1.0) * 0.004 * f - hole * 0.01 * f;
  return mix(c * 0.96, full, f);
}
`;
