// Vehicle silhouettes. Each builder returns a merged geometry in the local frame
// (origin on the ground, +Z forward, +X left). Paint parts take the per-instance colour.

import type * as THREE from 'three';
import { busModel, truckModel } from './modelsHeavy';
import type { VehicleClass } from '../../audio';
import {
  BOARD,
  BRAKE,
  CHROME,
  GLASS,
  GeoBuilder,
  HEAD,
  INDICATOR,
  PAINT,
  PLATE,
  TAIL,
  TRIM,
  fixed,
  type Style,
  type V3,
} from './builder';

export interface VariantInfo {
  id: number;
  name: string;
  cls: VehicleClass;
  /** Wheel radius in metres (documentation; the shader reads it from the vertices). */
  wheelRadius: number;
  /** Instance paint palette (hex strings). Empty = fixed colours only. */
  palette: string[];
  build(): THREE.BufferGeometry;
}

interface CarSpec {
  L: number;
  W: number;
  r: number;
  y0: number;
  zf: number; // front axle z
  zr: number; // rear axle z (negative)
  noseTop: number;
  hoodTop: number;
  deckTop: number;
  tailTop: number;
  zWb: number; // windscreen base
  zWt: number; // windscreen top
  zRt: number; // rear window top
  zRb: number; // rear window base
  roofH: number;
  roofHalf: number; // half width at the roof
  /** Walls behind the front door are solid paint (vans). */
  cargo?: boolean;
  /** Rear window is solid paint (vans). */
  solidRear?: boolean;
  /** Body colour is fixed instead of instance paint. */
  bodyColour?: number;
  /** Paint stripe along the sides (delivery van). */
  band?: boolean;
  sign?: boolean;
  /** Roof rails (suv, estate). */
  rails?: boolean;
}

function carModel(sp: CarSpec): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const body: Style = sp.bodyColour !== undefined ? fixed(sp.bodyColour) : PAINT;
  const hw = sp.W / 2;
  const L2 = sp.L / 2;

  // ---- lower body: rings from nose to tail
  const st: { z: number; yt: number; w: number; y0: number }[] = [
    { z: L2, yt: sp.noseTop, w: hw * 0.9, y0: sp.y0 + 0.1 },
    { z: L2 - 0.22, yt: sp.noseTop + 0.1, w: hw * 0.99, y0: sp.y0 + 0.04 },
    { z: sp.zWb, yt: sp.hoodTop, w: hw, y0: sp.y0 },
    { z: sp.zRb, yt: sp.deckTop, w: hw, y0: sp.y0 },
    { z: -L2 + 0.2, yt: sp.tailTop + 0.06, w: hw * 0.98, y0: sp.y0 + 0.04 },
    { z: -L2, yt: sp.tailTop, w: hw * 0.9, y0: sp.y0 + 0.1 },
  ];
  const rings: V3[][] = st.map((s) => {
    const ys = s.yt - 0.13;
    const wt = s.w * 0.9;
    return [
      [s.w, s.y0, s.z],
      [s.w, ys, s.z],
      [wt, s.yt, s.z],
      [-wt, s.yt, s.z],
      [-s.w, ys, s.z],
      [-s.w, s.y0, s.z],
    ] as V3[];
  });
  b.loft(rings, (e) => (e === 5 ? TRIM : e === 0 || e === 4 ? body : body), {
    ref: [0, (sp.y0 + sp.hoodTop) / 2, 0],
    capA: body,
    capB: body,
  });

  // ---- greenhouse
  const wb = hw * 0.93;
  const cab = (z: number, yBase: number, yTop: number, halfTop: number): V3[] => [
    [wb, yBase, z],
    [halfTop, yTop, z],
    [-halfTop, yTop, z],
    [-wb, yBase, z],
  ];
  const cabRings: V3[][] = [
    cab(sp.zWb, sp.hoodTop, sp.hoodTop + 0.01, wb * 0.96),
    cab(sp.zWt, sp.hoodTop, sp.roofH, sp.roofHalf),
    cab(sp.zRt, sp.deckTop, sp.roofH, sp.roofHalf),
    cab(sp.zRb, sp.deckTop, sp.deckTop + 0.01, wb * 0.96),
  ];
  const cargoStart = sp.cargo ? 1 : 99; // segment index from which walls are paint
  b.loft(
    cabRings,
    (e, seg) => {
      if (e === 3) return null; // underside
      if (e === 1) {
        // roof strip
        if (seg === 0) return GLASS; // windscreen
        if (seg === 1) return body; // roof
        return sp.solidRear ? body : GLASS; // rear window
      }
      // side walls
      return seg >= cargoStart ? body : GLASS;
    },
    { ref: [0, sp.hoodTop - 0.4, (sp.zWb + sp.zRb) / 2] },
  );

  // Pillars and window frames (black trim on the walls).
  const wallPt = (z: number, yBase: number, yTop: number, half: number, side: number): [V3, V3] => [
    [side * (wb + 0.012), yBase, z],
    [side * (half + 0.012), yTop, z],
  ];
  for (const side of [1, -1]) {
    const [a0, a1] = wallPt(sp.zWb, sp.hoodTop, sp.hoodTop + 0.01, wb * 0.96, side);
    const [t0, t1] = wallPt(sp.zWt, sp.hoodTop, sp.roofH, sp.roofHalf, side);
    const [r0, r1] = wallPt(sp.zRt, sp.deckTop, sp.roofH, sp.roofHalf, side);
    const [d0, d1] = wallPt(sp.zRb, sp.deckTop, sp.deckTop + 0.01, wb * 0.96, side);
    void a1; void d1;
    b.bar(a0, t1, 0.045, 0.045, body); // A pillar
    if (!sp.solidRear) b.bar(r1, d0, 0.05, 0.05, body); // C pillar
    // B pillar between the doors
    const zb = sp.cargo ? sp.zWt + 0.1 : (sp.zWt + sp.zRt) / 2;
    const k = (zb - sp.zWt) / (sp.zRt - sp.zWt || 1);
    const yB = sp.hoodTop + (sp.deckTop - sp.hoodTop) * Math.min(1, Math.max(0, k));
    const wH = wb + (sp.roofHalf - wb) * 0.0;
    b.bar([side * (wH + 0.012), yB, zb], [side * (sp.roofHalf + 0.012), sp.roofH, zb], 0.06, 0.05, TRIM);
    // sill line under the glass
    b.bar([side * (wb + 0.012), sp.hoodTop + 0.005, sp.zWb], [side * (wb + 0.012), sp.deckTop + 0.005, sp.zRb], 0.03, 0.03, TRIM);
    void t0; void r0;
  }

  // ---- wheels, arches
  const wheelW = 0.2;
  for (const z of [sp.zf, sp.zr]) {
    for (const side of [1, -1] as const) {
      const xo = side * (hw + 0.025);
      b.arch(side * (hw + 0.008), sp.r, z, sp.r + 0.085, sp.y0 + 0.02, side);
      b.wheel(xo - side * wheelW / 2, sp.r, z, wheelW, side);
    }
  }

  // ---- bumpers, grille, lights, plates
  b.box(0, 0.33, L2 - 0.02, sp.W * 0.98, 0.2, 0.14, TRIM);
  b.box(0, 0.33, -L2 + 0.02, sp.W * 0.98, 0.2, 0.14, TRIM);
  b.box(0, sp.noseTop - 0.14, L2 + 0.002, sp.W * 0.42, 0.12, 0.04, TRIM); // grille
  for (const side of [1, -1]) {
    const hx = side * (hw * 0.72);
    b.box(hx, sp.noseTop - 0.04, L2 - 0.03, 0.34, 0.12, 0.08, HEAD);
    b.box(side * (hw * 0.93), sp.noseTop - 0.11, L2 - 0.12, 0.08, 0.07, 0.1, INDICATOR);
    b.box(side * (hw * 0.78), sp.tailTop - 0.12, -L2 + 0.03, 0.34, 0.14, 0.08, TAIL);
    b.box(side * (hw * 0.95), sp.tailTop - 0.04, -L2 + 0.12, 0.08, 0.07, 0.1, INDICATOR);
    // mirrors
    b.box(side * (wb + 0.1), sp.hoodTop + 0.17, sp.zWb - 0.08, 0.14, 0.1, 0.08, body);
    // door seams and handles
    const zd1 = sp.zWb - 0.12;
    const zd2 = sp.cargo ? sp.zWt - 0.3 : (sp.zWt + sp.zRt) / 2;
    const xs = side * (hw + 0.006);
    for (const zd of sp.cargo ? [zd1] : [zd1, zd2, sp.zRb + 0.1]) {
      b.box(xs, (sp.y0 + 0.1 + sp.hoodTop - 0.13) / 2, zd, 0.012, sp.hoodTop - 0.13 - sp.y0 - 0.1, 0.014, TRIM);
    }
    for (const zh of sp.cargo ? [zd1 - 0.35] : [zd1 - 0.35, zd2 - 0.35]) {
      b.box(xs + side * 0.004, sp.hoodTop - 0.17, zh, 0.014, 0.025, 0.14, CHROME);
    }
    // wheel arch lip is the dark arch itself; side skirt
    b.box(side * (hw + 0.004), sp.y0 + 0.04, (sp.zf + sp.zr) / 2, 0.02, 0.05, Math.abs(sp.zf - sp.zr) - 0.5, TRIM);
  }
  b.box(0, 0.35, L2 + 0.05, 0.52, 0.11, 0.012, PLATE);
  b.box(0, 0.35, -L2 - 0.05, 0.52, 0.11, 0.012, PLATE);
  b.box(0, 0.35, L2 + 0.044, 0.44, 0.012, 0.01, TRIM);
  b.box(0, 0.35, -L2 - 0.044, 0.44, 0.012, 0.01, TRIM);
  // high-mounted brake lamp under the rear glass edge / above the tailgate
  b.box(0, sp.solidRear ? sp.roofH - 0.25 : sp.deckTop + 0.06, sp.zRb - (sp.solidRear ? 0.0 : 0.04), 0.42, 0.04, 0.03, BRAKE);

  if (sp.band) {
    for (const side of [1, -1]) {
      b.box(side * (hw + 0.012), 0.72, 0, 0.012, 0.22, sp.L * 0.92, PAINT);
    }
  }
  if (sp.rails) {
    for (const side of [1, -1]) {
      b.box(side * (sp.roofHalf - 0.04), sp.roofH + 0.04, (sp.zWt + sp.zRt) / 2, 0.04, 0.04, Math.abs(sp.zWt - sp.zRt) * 0.9, TRIM);
    }
  }
  if (sp.sign) {
    b.box(0, sp.roofH + 0.1, (sp.zWt + sp.zRt) / 2, 0.52, 0.17, 0.2, BOARD);
    b.box(0, sp.roofH + 0.015, (sp.zWt + sp.zRt) / 2, 0.38, 0.03, 0.16, TRIM);
  }
  return b.build();
}

const HATCH: CarSpec = {
  L: 3.95, W: 1.72, r: 0.3, y0: 0.2, zf: 1.2, zr: -1.2, noseTop: 0.66, hoodTop: 0.92, deckTop: 1.0, tailTop: 0.98,
  zWb: 0.92, zWt: 0.2, zRt: -0.8, zRb: -1.97, roofH: 1.46, roofHalf: 0.62,
};
const SEDAN: CarSpec = {
  L: 4.65, W: 1.8, r: 0.32, y0: 0.2, zf: 1.4, zr: -1.4, noseTop: 0.66, hoodTop: 0.9, deckTop: 0.98, tailTop: 0.94,
  zWb: 1.0, zWt: 0.3, zRt: -0.75, zRb: -1.3, roofH: 1.44, roofHalf: 0.64,
};
const SUV: CarSpec = {
  L: 4.5, W: 1.88, r: 0.37, y0: 0.27, zf: 1.35, zr: -1.35, noseTop: 0.84, hoodTop: 1.08, deckTop: 1.2, tailTop: 1.18,
  zWb: 0.95, zWt: 0.35, zRt: -1.25, zRb: -2.2, roofH: 1.72, roofHalf: 0.7, rails: true,
};
const MICROVAN: CarSpec = {
  L: 4.3, W: 1.8, r: 0.31, y0: 0.2, zf: 1.28, zr: -1.28, noseTop: 0.72, hoodTop: 0.96, deckTop: 1.02, tailTop: 1.0,
  zWb: 1.15, zWt: 0.62, zRt: -1.8, zRb: -2.14, roofH: 1.82, roofHalf: 0.76, rails: true,
};
const TAXI: CarSpec = { ...SEDAN, sign: true };
const DELIVERY: CarSpec = {
  L: 5.3, W: 2.0, r: 0.36, y0: 0.24, zf: 1.7, zr: -1.6, noseTop: 0.82, hoodTop: 1.1, deckTop: 1.1, tailTop: 1.1,
  zWb: 2.0, zWt: 1.45, zRt: -2.6, zRb: -2.62, roofH: 2.45, roofHalf: 0.92, cargo: true, solidRear: true, bodyColour: 0xf2f2ee, band: true,
};

// ---- scooter with rider --------------------------------------------------------------------

function scooterModel(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const jacket = fixed(0x2a3447);
  const jeans = fixed(0x39445c);
  const glove = fixed(0x1d1d20);
  // wheels (single wheel on the centre line: show both faces)
  b.wheel(0.0, 0.22, 0.6, 0.12, 1, 10);
  b.wheel(0.0, 0.22, 0.6, 0.12, -1, 10);
  b.wheel(0.0, 0.22, -0.55, 0.14, 1, 10);
  b.wheel(0.0, 0.22, -0.55, 0.14, -1, 10);
  // front fork and mudguard
  b.bar([0, 0.22, 0.6], [0, 0.95, 0.5], 0.06, 0.06, TRIM);
  b.box(0, 0.5, 0.62, 0.17, 0.05, 0.4, PAINT);
  // leg shield
  b.bar([0, 0.3, 0.55], [0, 0.95, 0.42], 0.36, 0.07, PAINT);
  // floor and body shell
  b.box(0, 0.27, 0.06, 0.36, 0.06, 0.62, PAINT);
  b.box(0, 0.5, -0.5, 0.4, 0.42, 0.7, PAINT);
  b.box(0, 0.4, -0.88, 0.3, 0.22, 0.14, PAINT);
  b.box(0, 0.72, -0.4, 0.3, 0.1, 0.62, fixed(0x17171a)); // seat
  // lights
  b.box(0, 0.98, 0.55, 0.2, 0.15, 0.1, HEAD);
  b.box(0, 0.55, -0.97, 0.2, 0.1, 0.05, TAIL);
  b.box(0, 0.64, -0.96, 0.1, 0.04, 0.04, BRAKE);
  b.box(0.17, 1.0, 0.5, 0.06, 0.06, 0.06, INDICATOR);
  b.box(-0.17, 1.0, 0.5, 0.06, 0.06, 0.06, INDICATOR);
  b.box(0.13, 0.62, -0.95, 0.05, 0.05, 0.05, INDICATOR);
  b.box(-0.13, 0.62, -0.95, 0.05, 0.05, 0.05, INDICATOR);
  // handlebar
  b.box(0, 1.03, 0.45, 0.62, 0.04, 0.05, TRIM);
  b.box(0.32, 1.1, 0.45, 0.07, 0.07, 0.07, CHROME); // mirrors
  b.box(-0.32, 1.1, 0.45, 0.07, 0.07, 0.07, CHROME);
  // rider
  b.bar([0, 0.82, -0.3], [0, 1.28, -0.2], 0.34, 0.2, jacket); // torso
  b.sphere(0, 1.46, -0.16, 0.14, 0.15, 0.16, 8, 6, PAINT); // helmet
  b.box(0, 1.46, -0.03, 0.2, 0.07, 0.04, GLASS); // visor
  for (const side of [1, -1]) {
    b.bar([side * 0.12, 0.8, -0.3], [side * 0.18, 0.76, 0.18], 0.13, 0.13, jeans); // thigh
    b.bar([side * 0.18, 0.76, 0.18], [side * 0.18, 0.34, 0.3], 0.11, 0.11, jeans); // shin
    b.box(side * 0.18, 0.28, 0.34, 0.1, 0.08, 0.2, glove);
    b.bar([side * 0.2, 1.22, -0.2], [side * 0.28, 1.0, 0.18], 0.1, 0.1, jacket); // upper arm to hand
    b.bar([side * 0.28, 1.0, 0.18], [side * 0.28, 1.03, 0.43], 0.09, 0.09, glove);
  }
  return b.build();
}

// ---- registry -------------------------------------------------------------------------------

const CAR_COLOURS = ['#c8c9cc', '#f0f0ee', '#2d3a4f', '#2f5d8a', '#8d1f2b', '#3b3f46', '#6a7077', '#e8e4d8', '#4a6a54', '#b9461f', '#d9a21a', '#7c8f9f', '#1f1f22', '#9b2d5a'];
const SMALL_COLOURS = ['#e8edf0', '#d94a38', '#2f6fb2', '#f2b52c', '#7aa5c8', '#4f8f6a', '#d5d0c5', '#2e2e32', '#e07a9a', '#8bb9a0'];
const BUS_COLOURS = ['#2d7d4f', '#1c5aa6', '#c0272d', '#e1a32a'];
const TRUCK_COLOURS = ['#2d5f8e', '#b3262d', '#e5e5e1', '#2e7d4f', '#d9962a', '#6b7078'];
const SCOOTER_COLOURS = ['#c92d36', '#f2f2f2', '#1a1a1c', '#3a7ab5', '#e8b82a', '#2f8f6a', '#9aa0a6'];
const VAN_BANDS = ['#c0272d', '#1c5aa6', '#f0a81e', '#2d7d4f', '#7a3b8f'];

export const VARIANTS: VariantInfo[] = [
  { id: 0, name: 'hatchback', cls: 'car', wheelRadius: HATCH.r, palette: SMALL_COLOURS, build: () => carModel(HATCH) },
  { id: 1, name: 'sedan', cls: 'car', wheelRadius: SEDAN.r, palette: CAR_COLOURS, build: () => carModel(SEDAN) },
  { id: 2, name: 'suv', cls: 'car', wheelRadius: SUV.r, palette: CAR_COLOURS, build: () => carModel(SUV) },
  { id: 3, name: 'microvan', cls: 'car', wheelRadius: MICROVAN.r, palette: SMALL_COLOURS, build: () => carModel(MICROVAN) },
  { id: 4, name: 'taxi', cls: 'car', wheelRadius: TAXI.r, palette: ['#f1e6c4', '#f4c430', '#efe3b8'], build: () => carModel(TAXI) },
  { id: 5, name: 'delivery-van', cls: 'car', wheelRadius: DELIVERY.r, palette: VAN_BANDS, build: () => carModel(DELIVERY) },
  { id: 6, name: 'bus', cls: 'bus', wheelRadius: 0.5, palette: BUS_COLOURS, build: busModel },
  { id: 7, name: 'truck', cls: 'truck', wheelRadius: 0.45, palette: TRUCK_COLOURS, build: truckModel },
  { id: 8, name: 'scooter', cls: 'motorbike', wheelRadius: 0.22, palette: SCOOTER_COLOURS, build: scooterModel },
];

