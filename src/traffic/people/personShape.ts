// Builds one person shape (male or female variant) from primitives. Vertex order must not depend on sex.

import * as THREE from 'three';
import { RigBuilder } from './rigBuilder';
import { PART, REGION } from './personParts';
import { shapeDims } from './personDims';
import type { BodyKind } from './personSpec';

const SHOE = 0x2b2a2e;
const EYE_WHITE = 0xf4f4f0;
const PUPIL = 0x22201f;
const MOUTH = 0x9a4a4a;

export interface Shape {
  geometry: THREE.BufferGeometry;
  hip: [number, number];
  shoulder: [number, number];
  neck: [number, number];
  headTop: number;
  /** Head ellipsoid centre and radii in model space (stoop shift included), used by the near face shader. */
  head: { c: [number, number, number]; r: [number, number, number] };
}

/** Builds one shape. sex is 0 for the male and 1 for the female variant; only widths change, never heights. */
export function buildShape(kind: BodyKind, sex: number): Shape {
  const d = shapeDims(kind, sex);
  const { sp, W, k, hipY, kneeY, ankleY, shY, torsoTop, elbowY, wristY, legX, armX, pelvisW, torsoBotW, shoulderW, torsoBotD, torsoTopD } = d;
  const { stoop, dy, dz, stoopM } = d;

  const b = new RigBuilder();

  // Legs.
  for (const s of [1, -1]) {
    const left = s > 0;
    const x = s * legX;
    b.set(left ? PART.THIGH_L : PART.THIGH_R, REGION.PANTS, 0xffffff);
    b.box(x, kneeY, hipY + k(0.03), 0, k(0.105) * W, k(0.115), k(0.14) * W, k(0.14), 0, false, false);
    const shin = left ? PART.SHIN_L : PART.SHIN_R;
    b.set(shin, REGION.SHIN, 0xffffff, kneeY, 0);
    // The shin runs 0.058 m above the knee pivot, as wide as the thigh end at the knee, and is closed on top: when the
    // knee bends the open thigh end would otherwise show a see-through wedge (T-0032, tests/peopleJoints.test.ts).
    b.box(x, ankleY, kneeY + k(0.058), 0, k(0.075) * W, k(0.085), k(0.1135) * W, k(0.1225), 0, false, true);
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
    // Same at the elbow: the forearm runs 0.045 m above the pivot, as wide as the upper arm end, closed on top.
    b.box(x, wristY, elbowY + k(0.045), 0, k(0.062) * W, k(0.07), k(0.0868) * W, k(0.0915), 0, false, true);
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
    head: { c: [0, headY + dy(torsoTop) + (stoop ? k(0.03) : 0), k(0.01) + dz(torsoTop) + (stoop ? k(0.05) : 0)], r: [rx, ry, rz] },
  };
}
