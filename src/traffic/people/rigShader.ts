// Materials with the walk cycle in the vertex shader. MeshLambertMaterial is patched through onBeforeCompile:
//   - applyRig() swings legs, knees, arms and elbows by part id, bobs the body, seats people, gestures when
//     chatting and hides the hat, scarf and bag a person does not wear,
//   - pickColour() resolves the per-instance clothing colours from palette uniform arrays.
// Per-instance attributes: aGait (omega, phase, pose, amplitude), aLook (top, pants, hair, skin),
// aLook2 (accent, flag bits, 0, 0). Flag bits: 1 hat, 2 scarf, 4 bag, 8 shorts, 16 short sleeves, 32 umbrella.
// Time is one shared uniform, so animation costs no CPU. A matching depth material keeps shadows animated.

import * as THREE from 'three';
import {
  ACCENT_COLORS,
  DOG_COATS,
  HAIR_COLORS,
  PALETTE_SIZES,
  PANTS_COLORS,
  SKIN_COLORS,
  TOP_COLORS,
  type SeasonName,
} from './palettes';
import type { PersonModel } from './personGeometry';

type Uniform<T> = { value: T };

/** Uniforms shared by all people and dog materials. */
export interface PeopleUniforms {
  uTime: Uniform<number>;
  uSkinC: Uniform<THREE.Color[]>;
  uHairC: Uniform<THREE.Color[]>;
  uTopC: Uniform<THREE.Color[]>;
  uPantsC: Uniform<THREE.Color[]>;
  uAccC: Uniform<THREE.Color[]>;
  uCoatC: Uniform<THREE.Color[]>;
}

function colors(list: string[]): THREE.Color[] {
  return list.map((c) => new THREE.Color(c));
}

export function createPeopleUniforms(): PeopleUniforms {
  return {
    uTime: { value: 0 },
    uSkinC: { value: colors(SKIN_COLORS) },
    uHairC: { value: colors(HAIR_COLORS) },
    uTopC: { value: colors(TOP_COLORS.summer) },
    uPantsC: { value: colors(PANTS_COLORS.summer) },
    uAccC: { value: colors(ACCENT_COLORS.summer) },
    uCoatC: { value: colors(DOG_COATS) },
  };
}

/** Swaps the seasonal wardrobe in place (no allocation). */
export function applySeasonPalette(u: PeopleUniforms, season: SeasonName): void {
  const set = (target: THREE.Color[], list: string[]): void => {
    for (let i = 0; i < target.length; i++) target[i].set(list[i]);
  };
  set(u.uTopC.value, TOP_COLORS[season]);
  set(u.uPantsC.value, PANTS_COLORS[season]);
  set(u.uAccC.value, ACCENT_COLORS[season]);
}

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

const PERSON_DECL = /* glsl */ `
attribute vec4 aRig;
attribute vec4 aGait;
attribute vec4 aLook;
attribute vec4 aLook2;
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
bool applyRig(inout vec3 p, inout vec3 n) {
  int part = int(aRig.x + 0.5);
  int flags = int(aLook2.y + 0.5);
  if (part == 10 && (flags & 1) == 0) return false;
  if (part == 11 && (flags & 2) == 0) return false;
  if (part == 12 && (flags & 4) == 0) return false;
  float pose = aGait.z;
  float walk = pose < 0.5 ? 1.0 : 0.0;
  float chat = (pose > 1.5 && pose < 2.5) ? 1.0 : 0.0;
  float sit = pose > 2.5 ? 1.0 : 0.0;
  float amp = aGait.w;
  float a = uTime * aGait.x + aGait.y;
  float bob = walk * amp * 0.026 * abs(sin(a));
  bool isLeft = (part == 1 || part == 3 || part == 5 || part == 7);
  float side = isLeft ? 0.0 : 3.14159265;
  float sa = sin(a + side);
  float ca = cos(a + side);
  if (part >= 1 && part <= 4) {
    float thigh = walk * amp * 0.55 * sa + sit * 1.45;
    if (part >= 3) {
      float knee = walk * amp * 0.85 * max(0.0, ca) + sit * 1.45;
      rotYZ(p, n, aRig.zw, -knee);
    }
    rotYZ(p, n, uHip, thigh);
  } else if (part >= 5 && part <= 8) {
    bool isRight = !isLeft;
    float swing = -walk * amp * 0.5 * sa + sit * 0.45;
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
  } else if (part == 9 || part == 10) {
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
  if (r == 1) c = uSkinC[int(aLook.w + 0.5)];
  else if (r == 2) c = uHairC[int(aLook.z + 0.5)];
  else if (r == 3) c = uTopC[int(aLook.x + 0.5)];
  else if (r == 4) c = uPantsC[int(aLook.y + 0.5)];
  else if (r == 5) c = uAccC[int(aLook2.x + 0.5)];
  else if (r == 6) c = ((flags & 8) != 0) ? uSkinC[int(aLook.w + 0.5)] : uPantsC[int(aLook.y + 0.5)];
  else c = ((flags & 16) != 0) ? uSkinC[int(aLook.w + 0.5)] : uTopC[int(aLook.x + 0.5)];
  return c * base;
}
`;

const DOG_DECL = /* glsl */ `
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

export interface PersonMaterials {
  material: THREE.MeshLambertMaterial;
  depth: THREE.MeshDepthMaterial;
}

export function createPersonMaterials(model: PersonModel, shared: PeopleUniforms): PersonMaterials {
  const typeUniforms = {
    uHip: { value: new THREE.Vector2(model.hip[0], model.hip[1]) },
    uShoulder: { value: new THREE.Vector2(model.shoulder[0], model.shoulder[1]) },
    uNeck: { value: new THREE.Vector2(model.neck[0], model.neck[1]) },
    uSeatDrop: { value: model.seatDrop },
  };
  const bind = (shader: THREE.WebGLProgramParametersWithUniforms): void => {
    Object.assign(shader.uniforms, shared, typeUniforms);
  };

  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    bind(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + PERSON_DECL)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 rigP = position;\nbool rigOk = applyRig(rigP, objectNormal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = rigOk ? rigP : vec3(0.0);')
      .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_COLOR\nvColor = pickColour(vColor);\n#endif');
  };
  material.customProgramCacheKey = () => 'person-rig-v1';

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    bind(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + PERSON_DECL)
      .replace('#include <begin_vertex>', 'vec3 rigP = position;\nvec3 rigN = vec3(0.0, 1.0, 0.0);\nbool rigOk = applyRig(rigP, rigN);\nvec3 transformed = rigOk ? rigP : vec3(0.0);');
  };
  depth.customProgramCacheKey = () => 'person-rig-depth-v1';
  return { material, depth };
}

export function createDogMaterials(shared: PeopleUniforms): PersonMaterials {
  const bind = (shader: THREE.WebGLProgramParametersWithUniforms): void => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uCoatC = shared.uCoatC;
  };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    bind(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + DOG_DECL)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 rigP = position;\napplyDog(rigP, objectNormal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = rigP;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_COLOR\nvColor = pickCoat(vColor);\n#endif');
  };
  material.customProgramCacheKey = () => 'dog-rig-v1';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    bind(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + DOG_DECL)
      .replace('#include <begin_vertex>', 'vec3 rigP = position;\nvec3 rigN = vec3(0.0, 1.0, 0.0);\napplyDog(rigP, rigN);\nvec3 transformed = rigP;');
  };
  depth.customProgramCacheKey = () => 'dog-rig-depth-v1';
  return { material, depth };
}
