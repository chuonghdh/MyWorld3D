// Near-detail person shape (T-0023): smooth lofted limbs, a rounded torso with a waist taper, a neck, a 12x8 head,
// block hands with a thumb and shaped shoes. Same part ids, regions, pivots and joint heights as personShape.ts (both
// read personDims.ts), so the materials and uniforms built from the far model stay valid. Built from one call
// sequence for both sexes, so the vertex order does not depend on sex. Joints are hidden by overlap (a limb ends
// inside the next part), never by two equal planes.

import { RigBuilder, type Ring } from './rigBuilder';
import { PART, REGION } from './personParts';
import { shapeDims } from './personDims';
import type { BodyKind } from './personSpec';
import type { Shape } from './personShape';

const SHOE = 0x2b2a2e;

export function buildShapeNear(kind: BodyKind, sex: number): Shape {
  const d = shapeDims(kind, sex);
  const { sp, W, k, hipY, kneeY, ankleY, shY, torsoTop, elbowY, wristY, legX, armX, pelvisW, torsoBotW, shoulderW, torsoBotD, torsoTopD } = d;
  const { stoop, dy, dz, stoopM } = d;
  const b = new RigBuilder();
  const ring = (y: number, rx: number, rz: number, cz = 0): Ring => ({ y, rx, rz, cz });
  const mid = (a: number, c: number, t = 0.5): number => a + (c - a) * t;

  // Legs: thigh, shin and shoe per side. Each joint ring sits inside the neighbour.
  for (const s of [1, -1]) {
    const left = s > 0;
    const x = s * legX;
    const thTop = hipY + k(0.03);
    b.set(left ? PART.THIGH_L : PART.THIGH_R, REGION.PANTS, 0xffffff);
    b.loft(x, [ring(kneeY, k(0.054) * W, k(0.056)), ring(mid(kneeY, thTop), k(0.062) * W, k(0.065)), ring(thTop, k(0.066) * W, k(0.07))], 8);
    const shin = left ? PART.SHIN_L : PART.SHIN_R;
    b.set(shin, REGION.SHIN, 0xffffff, kneeY, 0);
    // The shin runs 0.065 m above the knee pivot at least as wide as the thigh end and is capped: a bent knee must not open a wedge (T-0032).
    b.loft(x, [ring(ankleY, k(0.036) * W, k(0.04)), ring(kneeY, k(0.0555) * W, k(0.0575)), ring(kneeY + k(0.065), k(0.0555) * W, k(0.0575))], 8, true);
    b.set(shin, REGION.FIXED, SHOE, kneeY, 0);
    b.box(x, 0, k(0.03), k(0.05), k(0.088) * W, k(0.23), k(0.084) * W, k(0.22), 0, true, true); // sole
    b.box(x, 0, k(0.045), -k(0.04), k(0.07) * W, k(0.07), k(0.066) * W, k(0.066), 0, false, true); // heel
    b.loft(x, [ring(k(0.02), k(0.043) * W, k(0.1), k(0.05)), ring(ankleY + k(0.03), k(0.04) * W, k(0.06), k(0.02))], 8); // upper
    b.ellipsoid(x, k(0.03), k(0.115), k(0.04) * W, k(0.03), k(0.06), 8, 4); // toe cap
  }

  // Pelvis and torso. The torso starts inside the pelvis, narrows at the waist and rounds off at the shoulders.
  b.set(PART.BODY, REGION.PANTS, 0xffffff);
  b.transform(stoop ? stoopM : null);
  b.loft(0, [ring(hipY - k(0.05), (pelvisW / 2) * 0.92, k(0.095)), ring(hipY + k(0.03), (pelvisW / 2) * 1.04, k(0.1)), ring(hipY + k(0.1), (pelvisW / 2) * 1.03, k(0.1))], 10, false, true);
  b.set(PART.BODY, REGION.TOP, 0xffffff);
  const t0 = hipY + k(0.09);
  b.loft(0, [
    ring(t0, (torsoBotW / 2) * 0.94, torsoBotD * 0.47),
    ring(mid(t0, torsoTop, 0.4), (torsoBotW / 2) * 0.92, (torsoBotD / 2) * 1.04),
    ring(torsoTop - k(0.06), (shoulderW / 2) * 0.98, torsoTopD / 2),
    ring(torsoTop, (shoulderW / 2) * 0.7, (torsoTopD / 2) * 0.75),
  ], 10, true);
  b.transform(null);

  // Coat tails: an open flare from the waist to the upper thigh.
  b.set(PART.COAT, REGION.TOP, 0xffffff);
  b.loft(0, [ring(hipY - k(0.2), k(0.19) * W, k(0.152) * W), ring(hipY + k(0.09), k(0.17) * W, k(0.136) * W)], 12);

  // Arms hang from the (possibly shifted) shoulder: upper arm, sleeve, hand block with a thumb.
  b.shift(dy(shY), dz(shY));
  for (const s of [1, -1]) {
    const left = s > 0;
    const x = s * armX;
    const top = shY + k(0.012);
    b.set(left ? PART.ARM_L : PART.ARM_R, REGION.TOP, 0xf0f0f0);
    b.loft(x, [ring(elbowY, k(0.036) * W, k(0.038)), ring(mid(elbowY, top), k(0.041) * W, k(0.043)), ring(top, k(0.046) * W, k(0.048)), ring(top + k(0.016), k(0.03) * W, k(0.032))], 8, true);
    const fore = left ? PART.FORE_L : PART.FORE_R;
    b.set(fore, REGION.SLEEVE, 0xffffff, elbowY, 0);
    // Same at the elbow: the forearm runs 0.045 m above the pivot at least as wide as the upper arm end and is capped.
    b.loft(x, [ring(wristY, k(0.031) * W, k(0.034)), ring(elbowY, k(0.0365) * W, k(0.0385)), ring(elbowY + k(0.045), k(0.0372) * W, k(0.0392))], 8, true);
    b.set(fore, REGION.SKIN, 0xffffff, elbowY, 0);
    b.box(x, wristY - k(0.045), wristY + k(0.012), 0, k(0.058) * W, k(0.044), k(0.052) * W, k(0.04), 0, false, true); // palm
    b.box(x, wristY - k(0.085), wristY - k(0.04), k(0.004), k(0.054) * W, k(0.036), k(0.056) * W, k(0.042), 0, true, false); // fingers
    b.box(x - s * k(0.036) * W, wristY - k(0.065), wristY - k(0.02), k(0.012), k(0.022) * W, k(0.024), k(0.02) * W, k(0.02), 0, true, true); // thumb
  }

  // Neck, head, face, hair and hat sit on the shifted neck and nod together.
  b.shift(dy(torsoTop) + (stoop ? k(0.03) : 0), dz(torsoTop) + (stoop ? k(0.05) : 0));
  const hk = sp.headK;
  const headY = torsoTop + k(0.1) * hk;
  const rx = k(0.092) * hk;
  const ry = k(0.115) * hk;
  const rz = k(0.1) * hk;
  const cz0 = k(0.01);
  b.set(PART.HEAD, REGION.SKIN, 0xffffff, torsoTop, 0);
  b.loft(0, [ring(torsoTop - k(0.03), k(0.038), k(0.042)), ring(torsoTop + k(0.06) * hk, k(0.034), k(0.038))], 8);
  b.ellipsoid(0, headY, cz0, rx, ry, rz, 12, 8);
  for (const s of [1, -1]) b.ellipsoid(s * rx * 0.98, headY - ry * 0.2, 0, k(0.014), k(0.028), k(0.018), 6, 3); // ears
  b.box(0, headY - ry * 0.3, headY - ry * 0.02, rz * 0.92, rx * 0.2, rz * 0.14, rx * 0.12, rz * 0.1, 0, false, true); // nose
  // The face (eyes, brows, nostrils, lips, moustache) is drawn in the fragment shader (rigShaderFace.ts); the nose wedge and ears stay geometry.

  // Hair. The cap stops above the brows; the other styles hang from it.
  const h = (v: number): number => k(v) * hk;
  b.set(PART.HAIR_CAP, REGION.HAIR, 0xffffff, torsoTop, 0);
  b.ellipsoid(0, headY + h(0.012), -h(0.014), rx * 1.08, ry * 1.06, rz * 1.1, 12, 4, Math.PI * 0.36);
  b.set(PART.HAIR_FRINGE, REGION.HAIR, 0xffffff, torsoTop, 0);
  b.box(0, headY + ry * 0.4, headY + ry * 0.56, rz * 0.78, rx * 1.9, rz * 0.22, rx * 1.9, rz * 0.22, 0, false, true);
  const lo = (yTop: number, yBot: number, rb: number, rt: number, sz: number, cz: number): Ring[] => [
    ring(yBot, rb, rb * sz, cz),
    ring(mid(yBot, yTop), mid(rb, rt), mid(rb, rt) * sz, cz),
    ring(yTop, rt, rt * sz, cz),
  ];
  b.set(PART.HAIR_LONG, REGION.HAIR, 0xffffff, torsoTop, 0);
  b.loft(0, lo(headY + ry * 0.1, headY - ry * 1.5, rx * 1.06, rx * 0.98, 0.5, -rz * 0.9), 8);
  b.set(PART.HAIR_BOB, REGION.HAIR, 0xffffff, torsoTop, 0);
  b.loft(0, lo(headY + ry * 0.1, headY - ry * 0.95, rx * 1.04, rx * 1.0, 0.8, -rz * 0.55), 8);
  b.set(PART.HAIR_PONY, REGION.HAIR, 0xffffff, torsoTop, 0);
  b.loft(0, [ring(headY - ry * 1.3, h(0.035), h(0.035), -rz), ring(headY + ry * 0.2, h(0.06), h(0.06), -rz)], 8);
  b.set(PART.HAIR_BUN, REGION.HAIR, 0xffffff, torsoTop, 0);
  b.ellipsoid(0, headY + ry * 0.3, -rz, rx * 0.45, ry * 0.42, rz * 0.45, 8, 3);
  b.set(PART.HAIR_PIGTAILS, REGION.HAIR, 0xffffff, torsoTop, 0);
  for (const s of [1, -1]) b.loft(s * rx * 0.95, [ring(headY - ry * 1.2, h(0.04), h(0.04), -rz * 0.1), ring(headY + ry * 0.1, h(0.06), h(0.06), -rz * 0.1)], 8);
  b.set(PART.HAIR_WAIST, REGION.HAIR, 0xffffff, torsoTop, 0);
  b.loft(0, lo(headY, headY - ry * 4.4, rx * 0.95, rx * 0.98, 0.45 / 0.98, -rz), 8);
  // Beard (chin and jaw) and moustache.
  b.set(PART.BEARD, REGION.HAIR, 0xffffff, torsoTop, 0);
  b.loft(0, [ring(headY - ry * 1.02, rx * 0.6, rz * 0.45, rz * 0.42), ring(headY - ry * 0.8, rx * 0.74, rz * 0.52, rz * 0.38), ring(headY - ry * 0.55, rx * 0.66, rz * 0.46, rz * 0.4)], 8, false, true);
  b.set(PART.HAT, REGION.ACCENT, 0xffffff, torsoTop, 0);
  b.loft(0, [ring(headY + ry * 0.55, h(0.118), h(0.118), k(0.005)), ring(headY + ry * 0.55 + h(0.085), h(0.095), h(0.095), k(0.005))], 10, true);

  // Scarf ring and backpack follow the torso.
  b.shift(0, 0);
  b.transform(stoop ? stoopM : null);
  b.set(PART.SCARF, REGION.ACCENT, 0xffffff, torsoTop, 0);
  b.loft(0, [ring(torsoTop - k(0.045), k(0.17) * 1.15 * W, k(0.17) * 0.95), ring(torsoTop + k(0.04), k(0.125) * 1.15 * W, k(0.125) * 0.95)], 10);
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
    head: { c: [0, headY + dy(torsoTop) + (stoop ? k(0.03) : 0), cz0 + dz(torsoTop) + (stoop ? k(0.05) : 0)], r: [rx, ry, rz] },
  };
}
