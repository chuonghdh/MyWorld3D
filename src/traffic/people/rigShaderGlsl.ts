// GLSL chunks for the person and dog materials (rigShader.ts). Strings are used verbatim; the chunk contents and
// their insertion order are part of the shader output and must not change.

import { PALETTE_SIZES } from './palettes';

const ROT = /* glsl */ `
void rotYZ(inout vec3 p, inout vec3 n, vec2 pv, float th) {
  float c = cos(th);
  float s = sin(th);
  float y = p.y - pv.x;
  float z = p.z - pv.y;
  p.y = pv.x + c * y + s * z;
  p.z = pv.y - s * y + c * z;
  float ny = n.y;
  float nz = n.z;
  n.y = c * ny + s * nz;
  n.z = -s * ny + c * nz;
}
`;

export const PERSON_DECL = /* glsl */ `
attribute vec4 aRig;
attribute vec4 aGait;
attribute vec4 aGait2;
attribute vec4 aLook;
attribute vec4 aLook2;
attribute vec3 aMorph;
attribute vec3 aMorphN;
uniform float uTime;
uniform vec2 uHip;
uniform vec2 uShoulder;
uniform vec2 uNeck;
uniform float uSeatDrop;
uniform vec3 uSkinC[${PALETTE_SIZES.skin}];
uniform vec3 uHairC[${PALETTE_SIZES.hair}];
uniform vec3 uTopC[${PALETTE_SIZES.top}];
uniform vec3 uPantsC[${PALETTE_SIZES.pants}];
uniform vec3 uAccC[${PALETTE_SIZES.accent}];
${ROT}
// Patterned tops: the vertex side passes the model position and the pattern kind (0 none, 1 dots, 2 hearts,
// 3 horizontal stripes, 4 vertical stripes) for torso and sleeves that are not coated or bare; the fragment side
// paints the pattern in the cream colour from patternColour(). No extra draw calls or textures.
varying vec3 vPatPos;
varying float vPatKind;
varying float vPatOn;
void setPattern() {
  int r = int(aRig.y + 0.5);
  int flags = int(aLook2.y + 0.5);
  float kind = 0.0;
  if ((flags & 2048) != 0) kind = 1.0;
  else if ((flags & 4096) != 0) kind = 2.0;
  else if ((flags & 8192) != 0) kind = 3.0;
  else if ((flags & 16384) != 0) kind = 4.0;
  else if ((flags & 32768) != 0) kind = 5.0;
  else if ((flags & 65536) != 0) kind = 6.0;
  bool sleeves = r == 7 && (flags & 16) == 0;
  bool top = r == 3 || sleeves;
  vPatOn = (top && kind > 0.0 && (flags & 256) == 0) ? 1.0 : 0.0;
  vPatKind = kind;
}

// Which parts a person wears. Parts 14-24 are hair, beard and garments (ids in personGeometry.ts).
bool partShows(int part, int flags, int style) {
  if (part == 10) return (flags & 1) != 0;
  if (part == 11) return (flags & 2) != 0;
  if (part == 12) return (flags & 4) != 0;
  if (part == 13) return (flags & 256) != 0; // coat tails
  if (part == 14) return style != 3; // cap: every style but bald
  if (part == 15) return style == 1 || style == 7; // fringe
  if (part == 16) return style == 4; // hair to the shoulders
  if (part == 17) return style == 7; // bob
  if (part == 18) return style == 5; // ponytail
  if (part == 19) return style == 6; // bun
  if (part == 20) return style == 9; // pigtails
  if (part == 21) return (flags & 512) != 0; // beard
  if (part == 22) return (flags & 1024) != 0; // moustache
  if (part == 24) return style == 8; // hair to the waist
  return true;
}
bool applyRig(inout vec3 p, inout vec3 n) {
  int part = int(aRig.x + 0.5);
  int flags = int(aLook2.y + 0.5);
  int style = int(aLook2.w + 0.5);
  // Sex morph: the female shape is narrower at the shoulders and wider at the hips (same vertices, see personGeometry.ts).
  p += aMorph * aLook2.z;
  n += aMorphN * aLook2.z;
  if (!partShows(part, flags, style)) return false;
  // Curly hair: the cap widened sideways (style 2).
  if (part == 14 && style == 2) {
    p.x *= 1.22;
    p.z *= 1.14;
  }
  float pose = aGait.z;
  float walk = pose < 0.5 ? 1.0 : 0.0;
  float chat = (pose > 1.5 && pose < 2.5) ? 1.0 : 0.0;
  float sit = pose > 2.5 ? 1.0 : 0.0;
  float amp = aGait.w;
  float eased = aGait2.x;
  float kneeK = aGait2.y;
  float armK = aGait2.z;
  float bobK = aGait2.w;
  float a = aGait.x + aGait.y;
  float bob = walk * amp * 0.026 * bobK * abs(sin(a));
  bool isLeft = (part == 1 || part == 3 || part == 5 || part == 7);
  float side = isLeft ? 0.0 : 3.14159265;
  float sa = sin(a + side);
  float ca = cos(a + side);
  // Eased swing: s + e*0.5*(s - s^3) keeps the peaks and dwells longer at the turnaround. e = 0 is the plain sine.
  float ss = sa + eased * 0.5 * (sa - sa * sa * sa);
  if (part >= 1 && part <= 4) {
    float thigh = walk * amp * 0.55 * ss + sit * 1.45;
    if (part >= 3) {
      float knee = walk * amp * 0.85 * kneeK * max(0.0, ca) + sit * 1.45;
      rotYZ(p, n, aRig.zw, -knee);
    }
    rotYZ(p, n, uHip, thigh);
  } else if (part >= 5 && part <= 8) {
    bool isRight = !isLeft;
    float swing = -walk * amp * 0.5 * armK * ss + sit * 0.45;
    float elbow = walk * amp * (0.3 + 0.25 * max(0.0, -sa)) + sit * 0.6;
    if (chat > 0.5) {
      if (isRight) {
        swing = 0.75 + 0.35 * sin(uTime * 2.7 + aGait.y * 3.0);
        elbow = 0.9 + 0.35 * sin(uTime * 3.9 + aGait.y);
      } else {
        swing = 0.2;
        elbow = 0.5;
      }
    }
    if (isRight && (flags & 32) != 0) {
      swing = 0.95;
      elbow = 0.75;
    }
    if (part >= 7) rotYZ(p, n, aRig.zw, elbow);
    rotYZ(p, n, uShoulder, swing);
  } else if (part == 9 || part == 10 || (part >= 14 && part <= 22) || part == 24) {
    float nod = chat * 0.07 * sin(uTime * 2.2 + aGait.y) + walk * amp * 0.03 * sin(a * 2.0);
    rotYZ(p, n, uNeck, nod);
  }
  p.y += bob - sit * uSeatDrop;
  return true;
}
vec3 pickColour(vec3 base) {
  int r = int(aRig.y + 0.5);
  if (r == 0) return base;
  int flags = int(aLook2.y + 0.5);
  vec3 c;
  // A coat (flag 256) takes the accent colour on the top, the sleeves and the coat tails.
  bool coat = (flags & 256) != 0;
  if (r == 1) c = uSkinC[int(aLook.w + 0.5)];
  else if (r == 2) c = uHairC[int(aLook.z + 0.5)];
  else if (r == 3) c = coat ? uAccC[int(aLook2.x + 0.5)] : uTopC[int(aLook.x + 0.5)];
  else if (r == 4) c = uPantsC[int(aLook.y + 0.5)];
  else if (r == 5) c = uAccC[int(aLook2.x + 0.5)];
  else if (r == 6) c = ((flags & 8) != 0) ? uSkinC[int(aLook.w + 0.5)] : uPantsC[int(aLook.y + 0.5)];
  else if ((flags & 16) != 0) c = uSkinC[int(aLook.w + 0.5)];
  else c = coat ? uAccC[int(aLook2.x + 0.5)] : uTopC[int(aLook.x + 0.5)];
  return c * base;
}
`;

export const DOG_DECL = /* glsl */ `
attribute vec4 aRig;
attribute vec4 aDog;
uniform float uTime;
uniform vec3 uCoatC[${PALETTE_SIZES.coat}];
${ROT}
void rotXZ(inout vec3 p, inout vec3 n, float pz, float th) {
  float c = cos(th);
  float s = sin(th);
  float z = p.z - pz;
  float x = p.x;
  p.x = c * x + s * z;
  p.z = pz - s * x + c * z;
  float nx = n.x;
  float nz = n.z;
  n.x = c * nx + s * nz;
  n.z = -s * nx + c * nz;
}
void applyDog(inout vec3 p, inout vec3 n) {
  int part = int(aRig.x + 0.5);
  float mv = aDog.w;
  float a = uTime * aDog.x + aDog.y;
  if (part == 1 || part == 2) {
    float dir = part == 1 ? 1.0 : -1.0;
    rotYZ(p, n, aRig.zw, dir * 0.75 * mv * sin(a));
  } else if (part == 3) {
    float wag = (0.5 + 0.35 * (1.0 - mv)) * sin(uTime * (9.0 + 4.0 * (1.0 - mv)) + aDog.y * 1.7);
    rotXZ(p, n, aRig.w, wag);
  } else if (part == 4) {
    float nod = mv * 0.06 * sin(a * 2.0) + 0.04 * sin(uTime * 1.3 + aDog.y);
    rotYZ(p, n, aRig.zw, nod);
  }
  p.y += mv * 0.014 * abs(sin(a));
}
vec3 pickCoat(vec3 base) {
  int r = int(aRig.y + 0.5);
  if (r == 0) return base;
  vec3 c = uCoatC[int(aDog.z + 0.5)];
  if (r == 2) c *= 0.66;
  return c * base;
}
`;

// Fragment side of the patterns: model-space position decides where the cream pattern falls.
export const PATTERN_FRAG = /* glsl */ `
varying vec3 vPatPos;
varying float vPatKind;
varying float vPatOn;
vec3 patternColour(vec3 base, vec3 p, float kind) {
  float m;
  if (kind < 1.5) {
    vec2 g = fract(p.xy * 14.0) - 0.5;
    m = step(length(g), 0.24);
  } else if (kind < 2.5) {
    vec2 q = (fract(p.xy * 9.0) - 0.5) * 2.6;
    float a = q.x * q.x + q.y * q.y - 1.0;
    m = step(a * a * a - q.x * q.x * q.y * q.y * q.y, 0.0);
  } else if (kind < 3.5) {
    m = step(0.5, fract(p.y * 12.0));
  } else if (kind < 4.5) {
    m = step(0.5, fract(p.x * 12.0));
  } else if (kind < 5.5) {
    m = mod(floor(p.x * 9.0) + floor(p.y * 9.0), 2.0);
  } else {
    m = step(0.5, fract((p.x + p.y) * 11.0));
  }
  return mix(base, vec3(0.95, 0.93, 0.88), m);
}
`;
