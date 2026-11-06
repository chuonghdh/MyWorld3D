// GLSL for the procedural wall and roof patterns (docs/DESIGN-3D.md 8.1), as string constants that
// materials.ts splices into MeshStandardMaterial through onBeforeCompile.
//
// Pattern coordinates come from the object-space position and normal, so merged blocks need no UVs.
// Every pattern returns a colour already filtered for the pixel footprint `px` (metres per pixel):
// joints and seams use an analytic box filter, tone jitter fades to the average colour once a cell
// is smaller than about 1.5 px. None of the pattern functions use derivatives themselves, so the
// branch on the surface id is safe; the derivatives are all taken once, outside the branch.

export const SURFACE_VERTEX_COMMON = /* glsl */ `
attribute float aSurface;
flat varying float vSurface;
flat varying float vSurfCode;
varying vec3 vObjPos;
varying vec3 vObjNormal;
`;

export const SURFACE_VERTEX_MAIN = /* glsl */ `
vSurface = floor(aSurface + 0.5);
vSurfCode = aSurface - vSurface;
vObjPos = position;
vObjNormal = normal;
`;

export const SURFACE_FRAGMENT_COMMON = /* glsl */ `
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

// Window trims, sills and lintels. amt = uTrimAge (mould and stains on the faces), top = uTrimTop (how much darker
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

/** Replaces `#include <color_fragment>`: pattern selection. */
export const SURFACE_FRAGMENT_COLOR = /* glsl */ `
#include <color_fragment>
gSurfH = 0.0;
{
  // Pixel footprint in metres, from screen-space derivatives (taken outside any branch).
  float surfPx = length(fwidth(vObjPos)) * 0.7;
  vec3 sn = normalize(vObjNormal);
  vec3 tg = cross(vec3(0.0, 1.0, 0.0), sn);
  float tgl = length(tg);
  tg = tgl > 0.2 ? tg / tgl : vec3(1.0, 0.0, 0.0);
  vec3 bt = cross(sn, tg);
  vec2 sp = vec2(dot(vObjPos, tg), dot(vObjPos, bt));
  float sh = 0.0;
  vec3 sc = diffuseColor.rgb;
  if (vSurface > 0.5) {
    if (vSurface < 1.5) sc = patBrick(sc, sp, surfPx, sh);
    else if (vSurface < 2.5) sc = patTerracotta(sc, sp, surfPx, sh);
    else if (vSurface < 3.5) sc = patSlate(sc, sp, surfPx, sh);
    else if (vSurface < 4.5) sc = patTimber(sc, sp, surfPx, sh);
    else if (vSurface < 5.5) sc = patStucco(sc, sp, vObjPos.y, surfPx, sh);
    else if (vSurface < 6.5) sc = patStone(sc, sp, surfPx, sh);
    else if (vSurface < 7.5) sc = patConcrete(sc, sp, surfPx, sh);
    else if (vSurface < 8.5) sc = patZinc(sc, sp, surfPx, sh);
    else if (vSurface < 9.5) sc = patStoneAged(sc, sp, vObjPos.y, surfPx, sh);
    else if (vSurface < 10.5) sc = patSlateAged(sc, sp, vObjPos.y, sn, surfPx, sh);
    else if (vSurface < 11.5) sc = patZincAged(sc, sp, vObjPos.y, sn, surfPx, sh);
    else if (vSurface < 12.5) sc = patRoofFlat(sc, sp, surfPx, sh);
    else if (vSurface < 13.5) sc = patTrimAged(sc, sp, sn, uTrimAge, uTrimTop);
    // House roofs (tile, slate, zinc, membrane): moss and lichen. Zinc takes less, the membrane less again.
    // House walls (brick, timber, stucco, stone, concrete): weathering layer.
    if (vSurface < 1.5 || vSurface > 3.5 && vSurface < 7.5) {
      float wshare = vSurface < 1.5 ? 1.0 : vSurface < 4.5 ? 0.5 : vSurface < 5.5 ? 0.8 : vSurface < 6.5 ? 1.0 : 0.7;
      sc = patWallWeather(sc, sp, vObjPos.y, sn, surfPx, uWallWeather * wshare);
    }
    if (vSurface > 1.5 && vSurface < 3.5 || vSurface > 7.5 && vSurface < 8.5 || vSurface > 11.5 && vSurface < 12.5) {
      float share = vSurface > 7.5 && vSurface < 8.5 ? 0.6 : vSurface > 11.5 ? 0.6 : 1.0;
      float wallTop = vSurfCode > 0.0005 ? vSurfCode * 100.0 : 12.0;
      sc = patRoofMoss(sc, sp, vObjPos.y, sn, wallTop, uRoofMoss * share);
    }
  }
  diffuseColor.rgb = sc;
  gSurfH = sh;
}
`;

/** Replaces `#include <normal_fragment_maps>`: fake relief from the pattern height (metres). */
export const SURFACE_FRAGMENT_NORMAL = /* glsl */ `
#include <normal_fragment_maps>
{
  float dhx = dFdx(gSurfH);
  float dhy = dFdy(gSurfH);
  vec3 rsx = dFdx(-vViewPosition);
  vec3 rsy = dFdy(-vViewPosition);
  vec3 rr1 = cross(rsy, normal);
  vec3 rr2 = cross(normal, rsx);
  float rdet = dot(rsx, rr1);
  if (abs(rdet) > 1e-12) {
    vec3 rgrad = sign(rdet) * (dhx * rr1 + dhy * rr2);
    normal = normalize(abs(rdet) * normal - rgrad);
  }
}
`;
