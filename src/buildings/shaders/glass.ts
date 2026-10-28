// GLSL for the cheap glass reflection (docs/DESIGN-3D.md 8.3): Fresnel blend toward the sky colour,
// a soft diagonal gradient across each pane (from the object-space position), a sun glint, and a
// faint curtain tint from the vertex colour. Emissive light (lit windows at night) is left alone.

export const GLASS_VERTEX_COMMON = /* glsl */ `
varying vec3 vGlassPos;
`;

export const GLASS_VERTEX_MAIN = /* glsl */ `
vGlassPos = position;
`;

export const GLASS_FRAGMENT_COMMON = /* glsl */ `
varying vec3 vGlassPos;
uniform vec3 uSkyColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
`;

/** Replaces `#include <opaque_fragment>`. */
export const GLASS_FRAGMENT_END = /* glsl */ `
{
  vec3 gV = normalize(vViewPosition);
  float gNdV = clamp(dot(normal, gV), 0.0, 1.0);
  float gFres = 0.10 + 0.80 * pow(1.0 - gNdV, 3.0);
  float gGrad = 0.5 + 0.5 * sin(dot(vGlassPos, vec3(1.0, 1.7, 0.8)) * 3.1);
  vec3 gRefl = uSkyColor * (0.72 + 0.40 * gGrad);
  gRefl *= mix(vec3(1.0), vColor.rgb * 1.6, 0.3);
  vec3 gSunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float gGlint = pow(max(dot(reflect(-gV, normal), gSunV), 0.0), 48.0);
  vec3 gLit = outgoingLight - totalEmissiveRadiance;
  gLit = mix(gLit, gRefl, gFres * 0.85) + uSunColor * gGlint * 0.9;
  outgoingLight = gLit + totalEmissiveRadiance;
}
#include <opaque_fragment>
`;
