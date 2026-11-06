// GLSL for the procedural wall and roof patterns (docs/DESIGN-3D.md 8.1), as string constants that
// materials.ts splices into MeshStandardMaterial through onBeforeCompile.
//
// Pattern coordinates come from the object-space position and normal, so merged blocks need no UVs.
// Every pattern returns a colour already filtered for the pixel footprint `px` (metres per pixel):
// joints and seams use an analytic box filter, tone jitter fades to the average colour once a cell
// is smaller than about 1.5 px. None of the pattern functions use derivatives themselves, so the
// branch on the surface id is safe; the derivatives are all taken once, outside the branch.

import { SURFACE_GLSL_CORE } from './surfaceGlslCore';
import { SURFACE_GLSL_ROOF } from './surfaceGlslRoof';

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

export const SURFACE_FRAGMENT_COMMON = SURFACE_GLSL_CORE + SURFACE_GLSL_ROOF;

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
