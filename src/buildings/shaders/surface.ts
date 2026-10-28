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
varying vec3 vObjPos;
varying vec3 vObjNormal;
`;

export const SURFACE_VERTEX_MAIN = /* glsl */ `
vSurface = floor(aSurface + 0.5);
vObjPos = position;
vObjNormal = normal;
`;

export const SURFACE_FRAGMENT_COMMON = /* glsl */ `
flat varying float vSurface;
varying vec3 vObjPos;
varying vec3 vObjNormal;
float gSurfH;

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

// Running-bond brick 0.215 x 0.065 m, 10 mm joints.
vec3 patBrick(vec3 c, vec2 p, float px, out float h) {
  vec2 sz = vec2(0.215, 0.065);
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
  float dx = min(lm.x - (0.005 + sh.x), (sz.x - 0.005 + sh.x) - lm.x);
  float dy = min(lm.y - (0.005 + sh.y), (sz.y - 0.005 + sh.y) - lm.y);
  float m = aaStep(dx, px) * aaStep(dy, px);
  vec3 jc = mix(c * 1.02, vec3(0.78, 0.74, 0.67), 0.35);
  vec3 full = mix(jc, b, m);
  vec3 avg = mix(jc, c * 0.94, 0.81);
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
