// Stylised dog: body, chest, neck, head with snout, nose and floppy ears, collar, tail and four legs
// (about 130 triangles). Faces +Z, paws at y = 0. aRig = (part, region, pivotY, pivotZ):
// part 0 body, 1 legs front-left and back-right, 2 legs front-right and back-left, 3 tail, 4 head group.
// Regions: 0 fixed colour, 1 coat, 2 darker coat (ears, tail, snout).

import * as THREE from 'three';
import { RigBuilder } from './rigBuilder';

export const DOG_PART = { BODY: 0, LEGS_A: 1, LEGS_B: 2, TAIL: 3, HEAD: 4 } as const;
export const DOG_REGION = { FIXED: 0, COAT: 1, COAT_DARK: 2 } as const;

export interface DogModel {
  geometry: THREE.BufferGeometry;
  /** Leg pivot height and nod pivot (y, z). */
  hipY: number;
  headPivot: [number, number];
  tailPivot: [number, number];
  /** Length of one trot cycle in metres. */
  cycleLength: number;
  /** y of the collar, used for the leash end. */
  collarY: number;
  /** z of the collar centre along the body. */
  collarZ: number;
}

const COLLAR = 0xb8322a;
const NOSE = 0x1a1a1a;

export function buildDog(): DogModel {
  const b = new RigBuilder();
  const hipY = 0.3;

  // Legs: diagonal pairs move together.
  const legs: { x: number; z: number; part: number }[] = [
    { x: 0.065, z: 0.17, part: DOG_PART.LEGS_A },
    { x: -0.065, z: -0.2, part: DOG_PART.LEGS_A },
    { x: -0.065, z: 0.17, part: DOG_PART.LEGS_B },
    { x: 0.065, z: -0.2, part: DOG_PART.LEGS_B },
  ];
  for (const l of legs) {
    b.set(l.part, DOG_REGION.COAT, 0xffffff, hipY, l.z);
    b.box(l.x, 0, hipY + 0.02, l.z, 0.045, 0.055, 0.06, 0.07, 0, false, false);
  }

  // Body and chest.
  b.set(DOG_PART.BODY, DOG_REGION.COAT, 0xffffff);
  b.box(0, 0.27, 0.51, -0.06, 0.16, 0.44, 0.19, 0.44, 0, true, true);
  b.box(0, 0.25, 0.53, 0.15, 0.17, 0.16, 0.2, 0.15, 0, false, true);

  // Collar, neck and head group.
  b.set(DOG_PART.BODY, DOG_REGION.FIXED, COLLAR);
  b.box(0, 0.47, 0.515, 0.245, 0.115, 0.105, 0.115, 0.105, 0, false, false);
  b.set(DOG_PART.HEAD, DOG_REGION.COAT, 0xffffff, 0.5, 0.2);
  b.box(0, 0.44, 0.6, 0.255, 0.09, 0.1, 0.09, 0.1, 0.07, false, false);
  b.box(0, 0.53, 0.67, 0.34, 0.115, 0.15, 0.11, 0.13, 0, false, true);
  b.set(DOG_PART.HEAD, DOG_REGION.COAT_DARK, 0xffffff, 0.5, 0.2);
  b.box(0, 0.545, 0.615, 0.455, 0.068, 0.1, 0.056, 0.09, 0, false, true);
  b.set(DOG_PART.HEAD, DOG_REGION.FIXED, NOSE, 0.5, 0.2);
  b.box(0, 0.575, 0.61, 0.512, 0.04, 0.02, 0.04, 0.02, 0, false, true);
  for (const s of [1, -1]) {
    b.set(DOG_PART.HEAD, DOG_REGION.COAT_DARK, 0xffffff, 0.5, 0.2);
    b.box(s * 0.062, 0.6, 0.725, 0.305, 0.03, 0.06, 0.05, 0.07, -0.015, false, true);
  }

  // Tail: pivots at its root and wags in the shader.
  b.set(DOG_PART.TAIL, DOG_REGION.COAT_DARK, 0xffffff, 0.49, -0.285);
  b.box(0, 0.49, 0.66, -0.29, 0.045, 0.05, 0.03, 0.04, -0.07, false, true);

  return {
    geometry: b.build(),
    hipY,
    headPivot: [0.5, 0.2],
    tailPivot: [0.49, -0.285],
    cycleLength: 0.9,
    collarY: 0.49,
    collarZ: 0.245,
  };
}
