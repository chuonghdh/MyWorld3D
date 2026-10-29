// Stylised people: four age groups (child, teen, adult, elder with a slight stoop). One geometry per age group
// serves both sexes: the male and female shapes are built from the same call sequence (so both have the same
// vertices in the same order) and the difference is stored as two morph attributes, aMorph (position) and aMorphN
// (normal). The shader adds them scaled by the instance's sex (aLook2.z, 0 man or 1 woman), so women get narrower
// shoulders and wider hips without an extra draw call.
//
// Every model holds all of its parts: head with ears, eyes, brows, nose, mouth and moustache, hair styles (cap,
// fringe, long, bob, ponytail, bun, pigtails, waist-length), beard, coat tails, torso, pelvis,
// two-segment legs with shoes, two-segment arms with hands, hat, scarf and backpack. The shader shows only the
// parts a person wears (see partShows in rigShader.ts); hidden parts are still drawn but collapse to a point.
// Vertex attribute aRig = (part id, colour region, pivotY, pivotZ) drives the walk cycle and the per-instance
// clothing colours. Models face +Z, feet at y = 0, left side is +X.

import * as THREE from 'three';
import { RigBuilder } from './rigBuilder';

/** Part ids (aRig.x). The shader swings limbs by part and shows or hides parts per person. */
export const PART = {
  BODY: 0,
  THIGH_L: 1,
  THIGH_R: 2,
  SHIN_L: 3,
  SHIN_R: 4,
  ARM_L: 5,
  ARM_R: 6,
  FORE_L: 7,
  FORE_R: 8,
  HEAD: 9,
  HAT: 10,
  SCARF: 11,
  BAG: 12,
  /** Coat tails over the hips and upper thighs (shown only with the coat flag); trousers show below. */
  COAT: 13,
  /** Hair cap. Curly hair is the same cap, widened in the shader. */
  HAIR_CAP: 14,
  HAIR_FRINGE: 15,
  /** Hair to the shoulders. */
  HAIR_LONG: 16,
  HAIR_BOB: 17,
  HAIR_PONY: 18,
  HAIR_BUN: 19,
  HAIR_PIGTAILS: 20,
  BEARD: 21,
  MOUSTACHE: 22,
  /** Hair to the waist. */
  HAIR_WAIST: 24,
} as const;

/** Colour regions (aRig.y). Region 0 keeps the fixed vertex colour. */
export const REGION = {
  FIXED: 0,
  SKIN: 1,
  HAIR: 2,
  TOP: 3,
  PANTS: 4,
  ACCENT: 5,
  /** Lower leg: trousers, or skin when the person wears shorts (flag bit 8). */
  SHIN: 6,
  /** Forearm: top, or skin with short sleeves (flag bit 16). */
  SLEEVE: 7,
} as const;

export type BodyKind = 'adult' | 'child' | 'elder' | 'teen';

export interface PersonModel {
  /** Male shape with the morph attributes aMorph and aMorphN for the female shape. */
  geometry: THREE.BufferGeometry;
  /** (y, z) of the hip, shoulder and neck pivots after any stoop shift. */
  hip: [number, number];
  shoulder: [number, number];
  neck: [number, number];
  /** How far the body drops when seated (hip height minus bench seat height). */
  seatDrop: number;
  /** Height of the top of the head (standing, without hat), used to place umbrellas. */
  headTop: number;
}

/** Gait and build of one age group and sex. Read per instance by peopleMeshes.ts. */
export interface GaitSpec {
  /** Metres per full gait cycle (two steps). Short for children and elders: short, quick steps. */
  cycle: number;
  /** Swing amplitude multiplier. */
  amp: number;
  /** Height multiplier applied to the instance scale (women a little shorter than men). */
  heightK: number;
}

interface Spec {
  k: number;
  w: number;
  headK: number;
  stoop: number;
  bagK: number;
}

const SPECS: Record<BodyKind, Spec> = {
  adult: { k: 1, w: 1, headK: 1.08, stoop: 0, bagK: 1 },
  teen: { k: 0.87, w: 0.98, headK: 1.1, stoop: 0, bagK: 1.1 },
  child: { k: 0.64, w: 1.05, headK: 1.3, stoop: 0, bagK: 1.3 },
  elder: { k: 0.95, w: 0.97, headK: 1.05, stoop: 0.2, bagK: 0.9 },
};

/** Gait per age group: [male, female]. Women take slightly shorter steps; elders take short, slow steps. */
const GAIT: Record<BodyKind, [GaitSpec, GaitSpec]> = {
  adult: [
    { cycle: 1.5, amp: 1, heightK: 1 },
    { cycle: 1.38, amp: 0.93, heightK: 0.95 },
  ],
  teen: [
    { cycle: 1.22, amp: 1.1, heightK: 1 },
    { cycle: 1.14, amp: 1.02, heightK: 0.97 },
  ],
  child: [
    { cycle: 0.8, amp: 1.25, heightK: 1 },
    { cycle: 0.8, amp: 1.22, heightK: 1 },
  ],
  elder: [
    { cycle: 1.0, amp: 0.66, heightK: 0.94 },
    { cycle: 0.94, amp: 0.6, heightK: 0.92 },
  ],
};

export function gaitOf(kind: BodyKind, female: number): GaitSpec {
  return GAIT[kind][female ? 1 : 0];
}

const SEAT_HEIGHT = 0.47;
const SHOE = 0x2b2a2e;
const EYE_WHITE = 0xf4f4f0;
const PUPIL = 0x22201f;
const MOUTH = 0x9a4a4a;

interface Shape {
  geometry: THREE.BufferGeometry;
  hip: [number, number];
  shoulder: [number, number];
  neck: [number, number];
  headTop: number;
}

/** Builds one shape. sex is 0 for the male and 1 for the female variant; only widths change, never heights. */
function buildShape(kind: BodyKind, sex: number): Shape {
  const sp = SPECS[kind];
  const K = sp.k;
  const W = sp.w;
  const k = (v: number): number => v * K;
  const mix = (m: number, f: number): number => m + (f - m) * sex;
  const hipY = k(0.95);
  const kneeY = k(0.51);
  const ankleY = k(0.08);
  const shY = k(1.42);
  const torsoTop = k(1.48);
  const elbowY = k(1.14);
  const wristY = k(0.9);
  // Sex-dependent widths only: hips and thighs wider, shoulders narrower. Depths stay the same for both sexes,
  // because the stoop rotates the torso and a depth change would turn into a height change.
  const legX = k(mix(0.088, 0.096)) * W;
  const armX = k(mix(0.235, 0.215)) * W;
  const pelvisW = k(mix(0.3, 0.35)) * W;
  const torsoBotW = k(mix(0.31, 0.33)) * W;
  const shoulderW = k(mix(0.42, 0.36)) * W;
  const torsoBotD = k(0.19);
  const torsoTopD = k(0.23);

  const b = new RigBuilder();

  // Stoop: rotate the torso about the hip, and shift head and arms to follow without tilting them.
  const stoop = sp.stoop;
  const rel = (y: number): number => y - hipY;
  const dy = (y: number): number => (stoop ? rel(y) * (Math.cos(stoop) - 1) : 0);
  const dz = (y: number): number => (stoop ? rel(y) * Math.sin(stoop) : 0);
  const stoopM = new THREE.Matrix4()
    .makeTranslation(0, hipY, 0)
    .multiply(new THREE.Matrix4().makeRotationX(stoop))
    .multiply(new THREE.Matrix4().makeTranslation(0, -hipY, 0));

  // Legs.
  for (const s of [1, -1]) {
    const left = s > 0;
    const x = s * legX;
    b.set(left ? PART.THIGH_L : PART.THIGH_R, REGION.PANTS, 0xffffff);
    b.box(x, kneeY, hipY + k(0.03), 0, k(0.105) * W, k(0.115), k(0.14) * W, k(0.14), 0, false, false);
    const shin = left ? PART.SHIN_L : PART.SHIN_R;
    b.set(shin, REGION.SHIN, 0xffffff, kneeY, 0);
    b.box(x, ankleY, kneeY, 0, k(0.075) * W, k(0.085), k(0.1) * W, k(0.105), 0, false, false);
    b.set(shin, REGION.FIXED, SHOE, kneeY, 0);
    b.box(x, 0, ankleY + k(0.025), k(0.05), k(0.09) * W, k(0.24), k(0.08) * W, k(0.18), 0, false, true);
  }

  // Pelvis (trousers colour) and torso (top colour, wider at the shoulders for readability from above).
  b.set(PART.BODY, REGION.PANTS, 0xffffff);
  b.box(0, hipY - k(0.05), hipY + k(0.1), 0, pelvisW, k(0.19), pelvisW * 1.03, k(0.2), 0, false, false);
  b.transform(stoop ? stoopM : null);
  b.set(PART.BODY, REGION.TOP, 0xffffff);
  b.box(0, hipY + k(0.09), torsoTop, 0, torsoBotW, torsoBotD, shoulderW, torsoTopD, 0, false, true);
  b.transform(null);

  // Coat tails: a short open flare from the waist to the upper thigh, so trousers show below it (not a skirt).
  // Its radii stay just outside the pelvis and the torso bottom.
  b.set(PART.COAT, REGION.TOP, 0xffffff);
  b.frustum(0, hipY - k(0.2), hipY + k(0.09), 0, k(0.19) * W, k(0.17) * W, 8, 1, 0.8);

  // Arms hang from the (possibly shifted) shoulder.
  b.shift(dy(shY), dz(shY));
  for (const s of [1, -1]) {
    const left = s > 0;
    const x = s * armX;
    b.set(left ? PART.ARM_L : PART.ARM_R, REGION.TOP, 0xf0f0f0);
    b.box(x, elbowY, shY + k(0.035), 0, k(0.08) * W, k(0.085), k(0.1) * W, k(0.1), 0, false, true);
    const fore = left ? PART.FORE_L : PART.FORE_R;
    b.set(fore, REGION.SLEEVE, 0xffffff, elbowY, 0);
    b.box(x, wristY, elbowY, 0, k(0.062) * W, k(0.07), k(0.08) * W, k(0.085), 0, false, false);
    b.set(fore, REGION.SKIN, 0xffffff, elbowY, 0);
    b.box(x, wristY - k(0.075), wristY, 0, k(0.06) * W, k(0.045), k(0.065) * W, k(0.05), 0, false, true);
  }

  // Head, face, hair and hat sit on the shifted neck and nod together.
  b.shift(dy(torsoTop) + (stoop ? k(0.03) : 0), dz(torsoTop) + (stoop ? k(0.05) : 0));
  const hk = sp.headK;
  const headY = torsoTop + k(0.1) * hk;
  const rx = k(0.092) * hk;
  const ry = k(0.115) * hk;
  const rz = k(0.1) * hk;
  b.set(PART.HEAD, REGION.SKIN, 0xffffff, torsoTop, 0);
  b.ellipsoid(0, headY, k(0.01), rx, ry, rz, 6, 4);
  // Ears: small skin boxes on the sides of the head (partly inside the head, so they read from the side).
  for (const s of [1, -1]) {
    b.box(s * rx * 1.0, headY - ry * 0.2, headY + ry * 0.2, 0, k(0.035), k(0.05), k(0.035), k(0.05), 0, false, false);
  }
  // Nose: a small skin wedge in front of the face.
  b.box(0, headY - ry * 0.3, headY - ry * 0.02, rz * 0.92, rx * 0.2, rz * 0.14, rx * 0.12, rz * 0.1, 0, false, true);
  // Eyes: white with a dark pupil, brows in the hair colour, mouth. All are flat quads just in front of the skin.
  const ez = k(0.01) + rz * 0.93;
  b.set(PART.HEAD, REGION.FIXED, EYE_WHITE, torsoTop, 0);
  for (const s of [1, -1]) {
    const ex = s * rx * 0.42;
    const ey = headY + ry * 0.12;
    const hw = rx * 0.16;
    const hh = ry * 0.12;
    b.quad([ex - hw, ey - hh, ez + 0.004], [ex + hw, ey - hh, ez + 0.004], [ex + hw, ey + hh, ez + 0.004], [ex - hw, ey + hh, ez + 0.004]);
  }
  b.set(PART.HEAD, REGION.FIXED, PUPIL, torsoTop, 0);
  for (const s of [1, -1]) {
    const ex = s * rx * 0.42;
    const ey = headY + ry * 0.12;
    const hw = rx * 0.08;
    const hh = ry * 0.09;
    b.quad([ex - hw, ey - hh, ez + 0.007], [ex + hw, ey - hh, ez + 0.007], [ex + hw, ey + hh, ez + 0.007], [ex - hw, ey + hh, ez + 0.007]);
  }
  b.set(PART.HEAD, REGION.HAIR, 0xffffff, torsoTop, 0);
  for (const s of [1, -1]) {
    const ex = s * rx * 0.42;
    const ey = headY + ry * 0.32;
    const hw = rx * 0.2;
    const hh = ry * 0.035;
    b.quad([ex - hw, ey - hh, ez + 0.009], [ex + hw, ey - hh, ez + 0.009], [ex + hw, ey + hh, ez + 0.009], [ex - hw, ey + hh, ez + 0.009]);
  }
  b.set(PART.HEAD, REGION.FIXED, MOUTH, torsoTop, 0);
  {
    const my = headY - ry * 0.5;
    const hw = rx * 0.22;
    const hh = ry * 0.035;
    b.quad([-hw, my - hh, ez + 0.004], [hw, my - hh, ez + 0.004], [hw, my + hh, ez + 0.004], [-hw, my + hh, ez + 0.004]);
  }

  // Hair. The cap stops above the brows; the other styles hang from it.
  b.set(PART.HAIR_CAP, REGION.HAIR, 0xffffff, torsoTop, 0);
  b.ellipsoid(0, headY + k(0.012) * hk, -k(0.014) * hk, rx * 1.08, ry * 1.06, rz * 1.1, 6, 2, Math.PI * 0.36);
  b.set(PART.HAIR_FRINGE, REGION.HAIR, 0xffffff, torsoTop, 0);
  b.box(0, headY + ry * 0.4, headY + ry * 0.56, rz * 0.78, rx * 1.9, rz * 0.22, rx * 1.9, rz * 0.22, 0, false, true);
  b.set(PART.HAIR_LONG, REGION.HAIR, 0xffffff, torsoTop, 0);
  b.frustum(0, headY - ry * 1.5, headY + ry * 0.1, -rz * 0.9, rx * 1.06, rx * 0.98, 6, 1, 0.5);
  b.set(PART.HAIR_BOB, REGION.HAIR, 0xffffff, torsoTop, 0);
  b.frustum(0, headY - ry * 0.95, headY + ry * 0.1, -rz * 0.55, rx * 1.04, rx * 1.0, 6, 1, 0.8);
  b.set(PART.HAIR_PONY, REGION.HAIR, 0xffffff, torsoTop, 0);
  b.frustum(0, headY - ry * 1.3, headY + ry * 0.2, -rz * 1.0, k(0.035) * hk, k(0.06) * hk, 6, 1, 1);
  b.set(PART.HAIR_BUN, REGION.HAIR, 0xffffff, torsoTop, 0);
  b.ellipsoid(0, headY + ry * 0.3, -rz * 1.0, rx * 0.45, ry * 0.42, rz * 0.45, 4, 2);
  b.set(PART.HAIR_PIGTAILS, REGION.HAIR, 0xffffff, torsoTop, 0);
  for (const s of [1, -1]) {
    b.frustum(s * rx * 0.95, headY - ry * 1.2, headY + ry * 0.1, -rz * 0.1, k(0.04) * hk, k(0.06) * hk, 6, 1, 1);
  }
  b.set(PART.HAIR_WAIST, REGION.HAIR, 0xffffff, torsoTop, 0);
  b.frustum(0, headY - ry * 4.4, headY, -rz * 1.0, rx * 0.95, rx * 0.98, 6, 1, 0.45);
  // Beard (chin and jaw) and moustache: shown for men who own them, in the hair colour.
  b.set(PART.BEARD, REGION.HAIR, 0xffffff, torsoTop, 0);
  b.box(0, headY - ry * 1.02, headY - ry * 0.55, rz * 0.42, rx * 1.5, rz * 1.0, rx * 1.3, rz * 0.9, 0, false, false);
  b.set(PART.MOUSTACHE, REGION.HAIR, 0xffffff, torsoTop, 0);
  {
    const y0 = headY - ry * 0.36;
    const y1 = headY - ry * 0.27;
    const hw = rx * 0.24;
    const z = ez + 0.012;
    b.quad([-hw, y0, z], [hw, y0, z], [hw, y1, z], [-hw, y1, z]);
  }
  b.set(PART.HAT, REGION.ACCENT, 0xffffff, torsoTop, 0);
  b.frustum(0, headY + ry * 0.55, headY + ry * 0.55 + k(0.085) * hk, k(0.005), k(0.118) * hk, k(0.095) * hk, 6, 1, 1, true);

  // Scarf ring and backpack follow the torso.
  b.shift(0, 0);
  b.transform(stoop ? stoopM : null);
  b.set(PART.SCARF, REGION.ACCENT, 0xffffff, torsoTop, 0);
  b.frustum(0, torsoTop - k(0.045), torsoTop + k(0.04), 0, k(0.155), k(0.115), 6, 1.15 * W, 0.95);
  b.set(PART.BAG, REGION.ACCENT, 0xe6e6e6, torsoTop, 0);
  const bk = sp.bagK;
  b.box(0, hipY + k(0.16), hipY + k(0.44) * (bk > 1 ? 1.05 : 1), -k(0.18) * bk, k(0.27) * W * bk, k(0.12) * bk, k(0.25) * W * bk, k(0.11) * bk);
  b.transform(null);

  return {
    geometry: b.build(),
    hip: [hipY, 0],
    shoulder: [shY + dy(shY), dz(shY)],
    neck: [torsoTop + dy(torsoTop), dz(torsoTop)],
    headTop: headY + ry + (stoop ? k(0.03) : 0),
  };
}

/**
 * Builds the model of one age group: the male shape, plus the morph deltas to the female shape. Both shapes come
 * from the same primitives in the same order, so the vertex counts match (checked here).
 */
export function buildPerson(kind: BodyKind): PersonModel {
  const male = buildShape(kind, 0);
  const female = buildShape(kind, 1);
  const pm = male.geometry.getAttribute('position').array as Float32Array;
  const pf = female.geometry.getAttribute('position').array as Float32Array;
  if (pm.length !== pf.length) throw new Error(`people: ${kind} male and female shapes differ in vertex count`);
  const nm = male.geometry.getAttribute('normal').array as Float32Array;
  const nf = female.geometry.getAttribute('normal').array as Float32Array;
  const dP = new Float32Array(pm.length);
  const dN = new Float32Array(nm.length);
  for (let i = 0; i < pm.length; i++) {
    dP[i] = pf[i] - pm[i];
    dN[i] = nf[i] - nm[i];
  }
  const geometry = male.geometry;
  geometry.setAttribute('aMorph', new THREE.Float32BufferAttribute(dP, 3));
  geometry.setAttribute('aMorphN', new THREE.Float32BufferAttribute(dN, 3));
  const seatDrop = Math.max(0, male.hip[0] - SEAT_HEIGHT);
  return {
    geometry,
    hip: male.hip,
    shoulder: male.shoulder,
    neck: male.neck,
    seatDrop,
    headTop: male.headTop,
  };
}

export function triangleCount(geo: THREE.BufferGeometry): number {
  const n = geo.index ? geo.index.count : geo.getAttribute('position').count;
  return n / 3;
}
