// Materials with the walk cycle in the vertex shader. MeshLambertMaterial is patched through onBeforeCompile:
//   - applyRig() swings legs, knees, arms and elbows by part id, bobs the body, seats people, gestures when
//     chatting and hides the hat, scarf and bag a person does not wear,
//   - pickColour() resolves the per-instance clothing colours from palette uniform arrays.
// Per-instance attributes: aGait (walk-cycle angle accumulated on the CPU, phase offset, pose, amplitude), aGait2 (swing ease, knee, arm, bob multipliers;
// adults 0, 1, 1, 1), aLook (top, pants, hair, skin),
// aLook2 (accent, flag bits, sex 0 man or 1 woman, hair style). Flag bits (see outfit.ts): 1 hat, 2 scarf, 4 bag,
// 8 bare shins, 16 short sleeves, 32 umbrella, 256 coat, 512 beard, 1024 moustache, then pattern bits.
// Per-vertex morph attributes aMorph and aMorphN move a male shape towards the female shape by the sex value.
// partShows() hides the parts a person does not wear (hair styles, garments, facial hair), so one mesh per age
// group serves every look. Time is one shared uniform, so animation costs no CPU. A matching depth material
// keeps shadows animated.

import * as THREE from 'three';
import {
  ACCENT_COLORS,
  DOG_COATS,
  HAIR_COLORS,
  PANTS_COLORS,
  SKIN_COLORS,
  TOP_COLORS,
  type SeasonName,
} from './palettes';
import type { PersonModel } from './personGeometry';
import { trafficLife } from '../../config/tuning';
import { DOG_DECL, PATTERN_FRAG, PERSON_DECL } from './rigShaderGlsl';
import { FACE_FRAG, FACE_VERT } from './rigShaderFace';
import { RIM_CODE, SURF_FRAG, SURF_VERT } from './rigShaderSurface';

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


export interface PersonMaterials {
  material: THREE.MeshLambertMaterial;
  depth: THREE.MeshDepthMaterial;
}

/** `near` builds the variant with the fragment-shader face (`#define PERSON_NEAR`, own program); the far one is the original. */
export function createPersonMaterials(model: PersonModel, shared: PeopleUniforms, near = false): PersonMaterials {
  const typeUniforms = {
    uHip: { value: new THREE.Vector2(model.hip[0], model.hip[1]) },
    uShoulder: { value: new THREE.Vector2(model.shoulder[0], model.shoulder[1]) },
    uNeck: { value: new THREE.Vector2(model.neck[0], model.neck[1]) },
    uSeatDrop: { value: model.seatDrop },
    uHeadC: { value: new THREE.Vector3(...model.head.c) },
    uHeadR: { value: new THREE.Vector3(...model.head.r) },
    uBlinkS: { value: trafficLife.blinkIntervalS },
    uAoK: { value: trafficLife.aoStrength },
    uRimK: { value: trafficLife.rimStrength },
    uClothK: { value: trafficLife.clothDetail },
  };
  const bind = (shader: THREE.WebGLProgramParametersWithUniforms): void => {
    Object.assign(shader.uniforms, shared, typeUniforms);
  };

  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  if (near) material.defines = { PERSON_NEAR: '' };
  material.onBeforeCompile = (shader) => {
    bind(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + PERSON_DECL + (near ? FACE_VERT + SURF_VERT : ''))
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 rigP = position;\nbool rigOk = applyRig(rigP, objectNormal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = rigOk ? rigP : vec3(0.0);')
      .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_COLOR\nvColor = pickColour(vColor);\n#endif\nsetPattern();\nvPatPos = position;' + (near ? '\n#ifdef PERSON_NEAR\nsetFace();\nsetSurface();\n#endif' : ''));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PATTERN_FRAG + (near ? FACE_FRAG + SURF_FRAG : ''))
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>' +
          (near ? '\n#ifdef PERSON_NEAR\ndiffuseColor.rgb = clothColour(diffuseColor.rgb, length(vViewPosition));\n#endif' : '') +
          '\nif (vPatOn > 0.5) diffuseColor.rgb = patternColour(diffuseColor.rgb, vPatPos, vPatKind);' +
          (near ? '\n#ifdef PERSON_NEAR\nif (vFace.x > 0.5) diffuseColor.rgb = faceColour(diffuseColor.rgb);\ndiffuseColor.rgb *= 1.0 - 1.6 * uAoK * vSurf.z;\n#endif' : ''),
      )
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>' + (near ? RIM_CODE : ''));
  };
  material.customProgramCacheKey = () => (near ? 'person-rig-near-v3' : 'person-rig-v4');

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    bind(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + PERSON_DECL)
      .replace('#include <begin_vertex>', 'vec3 rigP = position;\nvec3 rigN = vec3(0.0, 1.0, 0.0);\nbool rigOk = applyRig(rigP, rigN);\nvec3 transformed = rigOk ? rigP : vec3(0.0);');
  };
  depth.customProgramCacheKey = () => 'person-rig-depth-v4';
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
