// Stylised people: three body types (adult, child, elder with a slight stoop). Each model is one flat-shaded,
// non-indexed geometry of roughly 230 triangles with head, hair, torso, pelvis, two-segment legs with shoes,
// two-segment arms with hands, and optional hat, scarf and backpack (the shader hides the ones a person does
// not wear). Vertex attribute aRig = (part id, colour region, pivotY, pivotZ) drives the walk cycle and the
// per-instance clothing colours in rigShader.ts. Models face +Z, feet at y = 0, left side is +X.

import * as THREE from 'three';
import { RigBuilder } from './rigBuilder';

/** Part ids (aRig.x). The shader swings limbs by part. */
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

export interface PersonModel {
  geometry: THREE.BufferGeometry;
  /** (y, z) of the hip, shoulder and neck pivots after any stoop shift. */
  hip: [number, number];
  shoulder: [number, number];
  neck: [number, number];
  /** How far the body drops when seated (hip height minus bench seat height). */
  seatDrop: number;
  /** Total height of the standing model without hat. */
  height: number;
  /** Length of one full gait cycle in metres (two steps). */
  cycleLength: number;
  /** Swing amplitude multiplier. */
  amplitude: number;
  /** Height of the top of the head, used to place umbrellas. */
  headTop: number;
}

export type BodyKind = 'adult' | 'child' | 'elder';

interface Spec {
  k: number;
  w: number;
  headK: number;
  stoop: number;
  bagK: number;
  cycle: number;
  amp: number;
}

const SPECS: Record<BodyKind, Spec> = {
  adult: { k: 1, w: 1, headK: 1.08, stoop: 0, bagK: 1, cycle: 1.45, amp: 1 },
  child: { k: 0.64, w: 1.05, headK: 1.3, stoop: 0, bagK: 1.3, cycle: 0.95, amp: 1.15 },
  elder: { k: 0.95, w: 0.97, headK: 1.05, stoop: 0.2, bagK: 0.9, cycle: 1.1, amp: 0.65 },
};

const SEAT_HEIGHT = 0.47;
const SHOE = 0x2b2a2e;

export function buildPerson(kind: BodyKind): PersonModel {
  const sp = SPECS[kind];
  const K = sp.k;
  const W = sp.w;
  const k = (v: number): number => v * K;
  const hipY = k(0.95);
  const kneeY = k(0.51);
  const ankleY = k(0.08);
  const shY = k(1.42);
  const torsoTop = k(1.48);
  const elbowY = k(1.14);
  const wristY = k(0.9);

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
    const x = s * k(0.088) * W;
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
  b.box(0, hipY - k(0.05), hipY + k(0.1), 0, k(0.3) * W, k(0.19), k(0.31) * W, k(0.2), 0, false, false);
  b.transform(stoop ? stoopM : null);
  b.set(PART.BODY, REGION.TOP, 0xffffff);
  b.box(0, hipY + k(0.09), torsoTop, 0, k(0.31) * W, k(0.19), k(0.42) * W, k(0.23), 0, false, true);
  b.transform(null);

  // Arms hang from the (possibly shifted) shoulder.
  b.shift(dy(shY), dz(shY));
  for (const s of [1, -1]) {
    const left = s > 0;
    const x = s * k(0.235) * W;
    b.set(left ? PART.ARM_L : PART.ARM_R, REGION.TOP, 0xf0f0f0);
    b.box(x, elbowY, shY + k(0.035), 0, k(0.08) * W, k(0.085), k(0.1) * W, k(0.1), 0, false, true);
    const fore = left ? PART.FORE_L : PART.FORE_R;
    b.set(fore, REGION.SLEEVE, 0xffffff, elbowY, 0);
    b.box(x, wristY, elbowY, 0, k(0.062) * W, k(0.07), k(0.08) * W, k(0.085), 0, false, false);
    b.set(fore, REGION.SKIN, 0xffffff, elbowY, 0);
    b.box(x, wristY - k(0.075), wristY, 0, k(0.06) * W, k(0.045), k(0.065) * W, k(0.05), 0, false, true);
  }

  // Head, hair and hat sit on the shifted neck.
  b.shift(dy(torsoTop) + (stoop ? k(0.03) : 0), dz(torsoTop) + (stoop ? k(0.05) : 0));
  const hk = sp.headK;
  const headY = torsoTop + k(0.1) * hk;
  const rx = k(0.092) * hk;
  const ry = k(0.115) * hk;
  const rz = k(0.1) * hk;
  b.set(PART.HEAD, REGION.SKIN, 0xffffff, torsoTop, 0);
  b.ellipsoid(0, headY, k(0.01), rx, ry, rz, 6, 4);
  // Two dark eyes and a nose give the head a front.
  b.set(PART.HEAD, REGION.FIXED, 0x22201f, torsoTop, 0);
  const ez = k(0.01) + rz * 0.93;
  for (const s of [1, -1]) {
    const ex = s * rx * 0.42;
    const ey = headY + ry * 0.12;
    const hw = rx * 0.14;
    const hh = ry * 0.1;
    b.quad([ex - hw, ey - hh, ez + 0.006], [ex + hw, ey - hh, ez + 0.006], [ex + hw, ey + hh, ez + 0.006], [ex - hw, ey + hh, ez + 0.006]);
  }
  b.set(PART.HEAD, REGION.HAIR, 0xffffff, torsoTop, 0);
  b.ellipsoid(0, headY + k(0.012) * hk, -k(0.014) * hk, rx * 1.08, ry * 1.06, rz * 1.1, 6, 3, Math.PI * 0.6);
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

  const geometry = b.build();
  const headTop = headY + ry + (stoop ? k(0.03) : 0);
  return {
    geometry,
    hip: [hipY, 0],
    shoulder: [shY + dy(shY), dz(shY)],
    neck: [torsoTop + dy(torsoTop), dz(torsoTop)],
    seatDrop: Math.max(0, hipY - SEAT_HEIGHT),
    height: headTop,
    cycleLength: sp.cycle,
    amplitude: sp.amp,
    headTop,
  };
}

export function triangleCount(geo: THREE.BufferGeometry): number {
  const n = geo.index ? geo.index.count : geo.getAttribute('position').count;
  return n / 3;
}
