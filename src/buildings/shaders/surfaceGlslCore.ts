// GLSL core for the house surface patterns: hashes, noise, pixel filter and the brick, tile, slate,
// timber, stucco, stone, concrete and zinc patterns. Spliced by surface.ts (split from surface.ts).

export const SURFACE_GLSL_CORE = /* glsl */ `
flat varying float vSurface;
flat varying float vSurfCode;
varying vec3 vObjPos;
varying vec3 vObjNormal;
float gSurfH;
uniform float uRoofMoss;
uniform float uWallWeather;
uniform float uTrimAge;
uniform float uTrimTop;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Coverage of a signed distance d (metres, positive inside) for a pixel of width w.
float aaStep(float d, float w) {
  return clamp(d / max(w, 1e-5) + 0.5, 0.0, 1.0);
}
// 1 when a cell of this size (metres) is comfortably larger than a pixel, 0 when under 1.5 px.
float cellFade(float cell, float px) {
  return smoothstep(1.5, 3.0, cell / max(px, 1e-5));
}

// Running-bond brick 0.48375 x 0.14625 m (2.25x the original 0.215 x 0.065 m), 4 mm joints, low-contrast mortar. Used only by SURFACE.BRICK.
vec3 patBrick(vec3 c, vec2 p, float px, out float h) {
  vec2 sz = vec2(0.48375, 0.14625);
  float row = floor(p.y / sz.y);
  float cu = p.x / sz.x + 0.5 * mod(row, 2.0);
  vec2 cell = vec2(floor(cu), row);
  vec2 lm = vec2(fract(cu) * sz.x, fract(p.y / sz.y) * sz.y);
  vec2 hh = hash22(cell);
  float hs = hash12(cell + 17.3);
  float tone = 1.0 + (hh.x - 0.5) * 0.12;
  float hue = (hh.y - 0.5) * 0.04;
  if (hs < 0.035) tone *= 1.2; else if (hs < 0.07) tone *= 0.8;
  vec3 b = c * 0.94 * tone * vec3(1.0 + hue * 2.0, 1.0, 1.0 - hue * 2.0);
  vec2 sh = vec2(0.0);
  float hs2 = fract(hs * 91.7);
  if (hs2 < 0.03) {
    float sg = fract(hs * 53.1) < 0.5 ? -1.0 : 1.0;
    float mag = 0.001 + 0.002 * fract(hs * 33.3);
    sh = vec2(sg * mag, -sg * mag * 0.6);
  }
  float dx = min(lm.x - (0.004 + sh.x), (sz.x - 0.004 + sh.x) - lm.x);
  float dy = min(lm.y - (0.004 + sh.y), (sz.y - 0.004 + sh.y) - lm.y);
  float m = aaStep(dx, px) * aaStep(dy, px);
  vec3 jc = mix(c * 1.02, vec3(0.78, 0.74, 0.67), 0.24);
  vec3 full = mix(jc, b, m);
  vec3 avg = mix(jc, c * 0.94, 0.845);
  float f = cellFade(sz.y, px);
  h = (m - 1.0) * 0.004 * f;
  return mix(avg, full, f);
}

// Curved clay tiles 0.30 m wide, rows 0.30 m, each row offset half a tile.
vec3 patTerracotta(vec3 c, vec2 p, float px, out float h) {
  float row = floor(p.y / 0.30);
  float cu = p.x / 0.30 + 0.5 * mod(row, 2.0);
  vec2 cell = vec2(floor(cu), row);
  vec2 l = vec2(fract(cu), fract(p.y / 0.30));
  vec2 hh = hash22(cell);
  float tone = 1.0 + (hh.x - 0.5) * 0.18;
  if (hh.y < 0.06) tone *= 0.84;
  float hue = (hh.y - 0.5) * 0.05;
  vec3 b = c * tone * vec3(1.0 + hue, 1.0, 1.0 - hue);
  float curve = 0.82 + 0.30 * sin(3.14159265 * l.x);
  float groove = 0.62 + 0.38 * smoothstep(0.0, 0.07, min(l.x, 1.0 - l.x));
  float shadow = 0.55 + 0.45 * smoothstep(0.0, 0.16, l.y);
  float rim = 1.0 + 0.16 * smoothstep(0.88, 0.98, l.y);
  vec3 full = b * curve * groove * shadow * rim;
  float f = cellFade(0.30, px);
  h = (0.010 * sin(3.14159265 * l.x) + 0.014 * l.y) * f;
  return mix(c * 0.96, full, f);
}

// Slate or dark concrete tiles 0.30 x 0.30, staggered, thin dark gaps.
vec3 patSlate(vec3 c, vec2 p, float px, out float h) {
  float row = floor(p.y / 0.30);
  float cu = p.x / 0.30 + 0.5 * mod(row, 2.0);
  vec2 cell = vec2(floor(cu), row);
  vec2 lm = vec2(fract(cu), fract(p.y / 0.30)) * 0.30;
  vec2 hh = hash22(cell);
  float tone = 1.0 + (hh.x - 0.5) * 0.14;
  if (hh.y < 0.05) tone *= 0.86;
  float d = min(min(lm.x, 0.30 - lm.x), min(lm.y, 0.30 - lm.y)) - 0.003;
  float m = aaStep(d, px);
  vec3 tile = c * tone * (0.94 + 0.12 * (lm.y / 0.30));
  vec3 full = mix(c * 0.35, tile, m);
  float f = cellFade(0.30, px);
  h = (m - 1.0) * 0.003 * f;
  return mix(c * 0.97, full, f);
}

// Standing-seam zinc: seams every 0.6 m, soft sheen, panel joints every 2 m.
vec3 patZinc(vec3 c, vec2 p, float px, out float h) {
  float cu = p.x / 0.6;
  float col = floor(cu);
  float lx = fract(cu);
  float sx = (lx - 0.5) * 0.6;
  float dd = 0.3 - abs(sx);
  float seam = aaStep(0.028 - dd, px);
  float side = sx > 0.0 ? 0.80 : 1.10;
  float sheen = 0.95 + 0.07 * (0.5 - 0.5 * cos(6.2831853 * lx));
  float panel = 1.0 + (hash12(vec2(col, 2.3)) - 0.5) * 0.03;
  float ly = fract(p.y / 2.0) * 2.0;
  float joint = 1.0 - 0.22 * (1.0 - aaStep(min(ly, 2.0 - ly) - 0.0015, px));
  vec3 full = c * mix(sheen * panel, side, seam) * joint;
  float f = cellFade(0.6, px);
  h = seam * 0.012 * f;
  return mix(c * 0.99, full, f);
}

// Horizontal timber boards 0.14 m with grain streaks.
vec3 patTimber(vec3 c, vec2 p, float px, out float h) {
  float row = floor(p.y / 0.14);
  float lyn = fract(p.y / 0.14);
  float hr = hash12(vec2(row, 7.7));
  float cu = floor((p.x + hr * 2.4) / 2.4);
  vec2 hh = hash22(vec2(cu, row));
  float tone = 1.0 + (hh.x - 0.5) * 0.16;
  float grainAmp = 1.0 - smoothstep(0.02, 0.08, px);
  float g = vnoise(vec2(p.x * 2.0 + hh.y * 40.0, p.y * 55.0));
  float grain = 1.0 + (g - 0.5) * 0.16 * grainAmp;
  float gap = 1.0 - 0.45 * (1.0 - aaStep(min(lyn, 1.0 - lyn) * 0.14 - 0.003, px));
  vec3 full = c * tone * grain * gap;
  float f = cellFade(0.14, px);
  h = (gap - 1.0) * 0.006 * f;
  return mix(c * 0.97, full, f);
}

// Rendered plaster: fine noise, stains, darker foot.
vec3 patStucco(vec3 c, vec2 p, float wy, float px, out float h) {
  float fine = vnoise(p * 45.0);
  float fineAmp = cellFade(1.0 / 45.0, px);
  float stain = vnoise(p * 0.9 + 3.0);
  float foot = 0.90 + 0.10 * smoothstep(0.0, 0.5, wy);
  float m = (1.0 + (fine - 0.5) * 0.08 * fineAmp + (stain - 0.5) * 0.10) * foot;
  h = (fine - 0.5) * 0.0015 * fineAmp;
  return c * m;
}

// Ashlar: courses 0.6 m, blocks 0.5-1.2 m, fine joints.
vec3 patStone(vec3 c, vec2 p, float px, out float h) {
  float row = floor(p.y / 0.6);
  float hr = hash12(vec2(row, 3.7));
  float L = mix(0.5, 1.2, hr);
  float cu = (p.x + hr * 7.3) / L;
  float col = floor(cu);
  vec2 l = vec2(fract(cu) * L, fract(p.y / 0.6) * 0.6);
  vec2 hh = hash22(vec2(col, row) + 11.0);
  float tone = 1.0 + (hh.x - 0.5) * 0.10;
  if (hh.y < 0.08) tone *= 1.06;
  float d = min(min(l.x, L - l.x), min(l.y, 0.6 - l.y)) - 0.003;
  float m = aaStep(d, px);
  float f = cellFade(0.5, px);
  float wthr = 0.97 + 0.06 * vnoise(p * 1.3 + hr * 9.0);
  vec3 full = mix(c * 0.80, c * tone * wthr, m);
  h = (m - 1.0) * 0.003 * f;
  return mix(c * 0.985, full, f);
}

// Weathered ashlar: the ashlar pattern, darker grime at the foot fading upward, faint vertical rain
// streaks and a few lighter weathered patches. wy is the object-space height in metres.
vec3 patStoneAged(vec3 c, vec2 p, float wy, float px, out float h) {
  vec3 s = patStone(c, p, px, h);
  float grime = 0.22 * (1.0 - smoothstep(0.0, 4.5, wy));
  float st = vnoise(vec2(p.x * 11.0, p.y * 0.3));
  float streakAmp = (1.0 - smoothstep(0.03, 0.12, px)) * smoothstep(0.55, 0.85, st) * 0.10 * smoothstep(0.0, 6.0, wy);
  float weather = 1.0 + (vnoise(p * 0.35 + 7.0) - 0.5) * 0.10;
  return s * (1.0 - grime) * (1.0 - streakAmp) * weather;
}

// House walls: weathering on brick, stone, stucco, concrete and timber. wy is the object height (m), nrm the
// object normal, amt = uWallWeather times the surface share. Layers: grime and splash in the ground band (0-1.4 m),
// vertical rain streaks everywhere (their strength is not tied to sills or cornices), damp and efflorescence
// blotches near the base, chipped patches showing lighter substrate, and a slow facade-wide sun fade.
vec3 patWallWeather(vec3 c, vec2 p, float wy, vec3 nrm, float px, float amt) {
  float base = 1.0 - smoothstep(0.0, 1.4, wy);
  float splash = smoothstep(0.45, 0.7, vnoise(vec2(p.x * 1.6, wy * 3.0)));
  float grime = (0.10 + 0.14 * splash) * base;
  float st = vnoise(vec2(p.x * 9.0, p.y * 0.25));
  float streak = (1.0 - smoothstep(0.03, 0.12, px)) * smoothstep(0.55, 0.85, st) * 0.09;
  float damp = smoothstep(0.62, 0.8, vnoise(p * 0.9 + 5.0)) * (1.0 - smoothstep(0.0, 2.5, wy));
  float chip = smoothstep(0.82, 0.86, vnoise(p * 3.1 + 2.0));
  float fade = 1.0 + (vnoise(p * 0.12 + 1.0) - 0.5) * 0.08 - 0.05 * abs(nrm.x);
  float lum = dot(c, vec3(0.33));
  vec3 efflo = mix(c, vec3(0.86, 0.84, 0.78) * lum, 0.6);
  vec3 r = c * fade * (1.0 - amt * (grime + streak));
  r = mix(r, efflo, amt * damp * 0.35);
  r = mix(r, r * 1.08 + vec3(0.02), amt * chip * 0.8);
  return r;
}

`;
