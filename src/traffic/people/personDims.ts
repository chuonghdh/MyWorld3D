// Body dimensions shared by the far and near shapes (personShape.ts, personShapeNear.ts), so both place the same
// pivots and joints. Only widths depend on sex, never heights or depths (the stoop would turn a depth change into a height change).

import * as THREE from 'three';
import { SPECS, type BodyKind } from './personSpec';

export function shapeDims(kind: BodyKind, sex: number) {
  const sp = SPECS[kind];
  const K = sp.k;
  const W = sp.w;
  const k = (v: number): number => v * K;
  const mix = (m: number, f: number): number => m + (f - m) * sex;
  const hipY = k(0.95);
  const stoop = sp.stoop;
  const rel = (y: number): number => y - hipY;
  const stoopM = new THREE.Matrix4()
    .makeTranslation(0, hipY, 0)
    .multiply(new THREE.Matrix4().makeRotationX(stoop))
    .multiply(new THREE.Matrix4().makeTranslation(0, -hipY, 0));
  return {
    sp,
    W,
    k,
    hipY,
    kneeY: k(0.51),
    ankleY: k(0.08),
    shY: k(1.42),
    torsoTop: k(1.48),
    elbowY: k(1.14),
    wristY: k(0.9),
    legX: k(mix(0.088, 0.096)) * W,
    armX: k(mix(0.235, 0.215)) * W,
    pelvisW: k(mix(0.3, 0.35)) * W,
    torsoBotW: k(mix(0.31, 0.33)) * W,
    shoulderW: k(mix(0.42, 0.36)) * W,
    torsoBotD: k(0.19),
    torsoTopD: k(0.23),
    stoop,
    dy: (y: number): number => (stoop ? rel(y) * (Math.cos(stoop) - 1) : 0),
    dz: (y: number): number => (stoop ? rel(y) * Math.sin(stoop) : 0),
    stoopM,
  };
}
