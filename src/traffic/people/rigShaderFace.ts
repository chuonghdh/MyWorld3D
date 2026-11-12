// GLSL for the procedural face of the NEAR person material (T-0024), compiled only under `#define PERSON_NEAR`
// (rigShader.ts). The far material never sees it, so it compiles to the same program as before.
//
// The face is drawn on the head part (part 9, region SKIN) from head-local coordinates: q = (position - head centre)
// / head radii, where `position` is the model position BEFORE the rig (vPatPos), so the face follows the nod and the
// stoop (the head centre comes from the model and already includes the stoop shift). Only the front of the head
// (q.z > 0.5) is painted, never the sides or the back. Eyes (white, iris, pupil, highlight, lid line), brows, nostrils,
// lips and the moustache are 2D shapes in q.xy with soft edges that are a few percent of the head radius, so no
// screen-space derivatives are needed. Blink and gaze depend on uTime and the walker phase only.

export const FACE_VERT = /* glsl */ `
#ifdef PERSON_NEAR
varying vec4 vFace; // x: 1 on skin head parts, y: walker phase, z: sex (0 man, 1 woman), w: 1 with a moustache
varying vec3 vHair;
void setFace() {
  bool head = int(aRig.x + 0.5) == 9 && int(aRig.y + 0.5) == 1;
  int flags = int(aLook2.y + 0.5);
  vFace = vec4(head ? 1.0 : 0.0, aGait.y, aLook2.z, (flags & 1024) != 0 ? 1.0 : 0.0);
  vHair = uHairC[int(aLook.z + 0.5)];
}
#endif
`;

export const FACE_FRAG = /* glsl */ `
#ifdef PERSON_NEAR
varying vec4 vFace;
varying vec3 vHair;
uniform float uTime;
uniform vec3 uHeadC;
uniform vec3 uHeadR;
uniform float uBlinkS;
float fHash(float x) { return fract(sin(x * 12.9898 + 4.1414) * 43758.5453); }
float fSoft(float d, float w) { return 1.0 - smoothstep(-w, w, d); }
vec3 irisColour(float h) {
  if (h < 0.3) return vec3(0.22, 0.12, 0.06);
  if (h < 0.6) return vec3(0.38, 0.22, 0.1);
  if (h < 0.8) return vec3(0.4, 0.33, 0.12);
  if (h < 0.92) return vec3(0.18, 0.36, 0.2);
  return vec3(0.22, 0.34, 0.5);
}
vec3 faceColour(vec3 skin) {
  vec3 q = (vPatPos - uHeadC) / uHeadR;
  float front = smoothstep(0.45, 0.6, q.z);
  if (front <= 0.0) return skin;
  float ph = vFace.y;
  float sex = vFace.z;
  float h1 = fHash(ph);
  float h2 = fHash(ph + 7.3);
  float h3 = fHash(ph + 13.1);
  // Blink: period blinkIntervalS +/- 40 percent per person, lasting 0.15 s, offset per person.
  float period = uBlinkS * (0.6 + 0.8 * h1);
  float t = mod(uTime + h2 * period, period);
  float blink = t < 0.15 ? sin(t / 0.15 * 3.14159265) : 0.0;
  // Slow gaze drift, a small fraction of the eye width.
  vec2 gaze = vec2(sin(uTime * 0.37 + ph * 3.0), 0.5 * sin(uTime * 0.23 + ph * 5.0)) * 0.12;
  vec3 col = skin;
  float side = q.x < 0.0 ? -1.0 : 1.0;
  vec2 e = vec2(0.42 * side, 0.12);
  vec2 el = (q.xy - e) / vec2(0.18, 0.105);
  // Eye: ellipse, closed from above by the lid (blink 0 open, 1 shut).
  float eyeD = length(el) - 1.0;
  float lid = 1.05 - 2.1 * blink;
  float open = fSoft(eyeD, 0.12) * (1.0 - smoothstep(lid - 0.08, lid + 0.08, el.y));
  vec3 white = vec3(0.93, 0.92, 0.9);
  col = mix(col, white, open);
  // Iris, pupil and highlight (clipped by the eye shape through open).
  vec2 ip = el - gaze;
  float irisD = length(ip) - 0.62;
  vec3 ic = irisColour(h3);
  col = mix(col, ic * (0.7 + 0.5 * (1.0 - length(ip))), fSoft(irisD, 0.1) * open);
  col = mix(col, vec3(0.04), fSoft(length(ip) - 0.3, 0.08) * open);
  col = mix(col, vec3(1.0), fSoft(length(ip - vec2(0.2, 0.22)) - 0.12, 0.06) * open);
  // Upper lid line: dark rim along the top of the eye, and a fine lash line when shut.
  float rim = fSoft(abs(eyeD) - 0.1, 0.1) * smoothstep(-0.2, 0.3, el.y);
  col = mix(col, skin * 0.35, rim * 0.8);
  float shut = fSoft(abs(el.y - (lid - 1.0) * 0.5) - 0.08, 0.06) * fSoft(abs(el.x) - 0.95, 0.1) * blink;
  col = mix(col, skin * 0.4, shut);
  // Brow: an arc in the hair colour, thickness and tilt vary a little per person.
  float tilt = (h2 - 0.5) * 0.18;
  float thick = 0.045 + 0.03 * h3;
  float bx = (q.x - 0.42 * side);
  float by = q.y - (0.33 + tilt * bx * side - 0.2 * bx * bx);
  float brow = fSoft(abs(by) - thick, 0.02) * fSoft(abs(bx) - 0.24, 0.03);
  col = mix(col, vHair * 0.85, brow * 0.9);
  // Nostril shadows under the nose.
  vec2 nl = (vec2(abs(q.x), q.y) - vec2(0.075, -0.36)) / vec2(0.055, 0.03);
  col = mix(col, skin * 0.5, fSoft(length(nl) - 1.0, 0.25) * 0.8);
  // Lips: a smile-curved band, lower lip fuller, redder for women.
  float mx = q.x / 0.22;
  float curve = 0.03 * mx * mx;
  float my = q.y - (-0.5 + curve);
  float width = fSoft(abs(mx) - 1.0, 0.1);
  vec3 lipC = mix(skin * 0.72, vec3(0.72, 0.28, 0.32) * (skin * 0.5 + 0.5), 0.25 + 0.4 * sex);
  float upper = fSoft(abs(my - 0.015) - 0.014 * (1.0 - mx * mx * 0.6), 0.012) * width;
  float lower = fSoft(abs(my + 0.022) - 0.02 * (1.0 - mx * mx * 0.7), 0.014) * width;
  col = mix(col, lipC * 0.85, upper);
  col = mix(col, lipC, lower);
  col = mix(col, skin * 0.45, fSoft(abs(my) - 0.005, 0.006) * width * 0.7);
  // Moustache: a band above the lip, in the hair colour.
  float mo = fSoft(abs(q.y + 0.31) - 0.05 * (1.0 - 0.5 * abs(q.x) / 0.25), 0.02) * fSoft(abs(q.x) - 0.26, 0.03) * vFace.w;
  col = mix(col, vHair, mo * 0.95);
  return mix(skin, col, front);
}
#endif
`;
