// Heavy vehicle silhouettes: bus and truck. Same conventions as models.ts (local frame, paint takes the instance colour).

import type * as THREE from 'three';
import {
  BOARD,
  BRAKE,
  GLASS,
  GLASS_LIT,
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

export function busModel(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const L2 = 5.9;
  const hw = 1.25;
  const yb = 0.34;
  const yr = 3.0;
  const roof: Style = fixed(0xe6e8ea);
  const zs: { z: number; w: number; yt: number; yb: number }[] = [
    { z: L2, w: hw * 0.93, yt: yr - 0.12, yb: yb + 0.08 },
    { z: L2 - 0.25, w: hw, yt: yr, yb },
    { z: -L2 + 0.25, w: hw, yt: yr, yb },
    { z: -L2, w: hw * 0.95, yt: yr - 0.06, yb: yb + 0.06 },
  ];
  const rings: V3[][] = zs.map((s) => [
    [s.w, s.yb, s.z],
    [s.w, s.yt - 0.22, s.z],
    [s.w * 0.9, s.yt, s.z],
    [-s.w * 0.9, s.yt, s.z],
    [-s.w, s.yt - 0.22, s.z],
    [-s.w, s.yb, s.z],
  ]);
  b.loft(rings, (e) => (e === 2 ? roof : e === 5 ? TRIM : PAINT), { ref: [0, 1.6, 0], capA: PAINT, capB: PAINT });

  // skirt (dark lower band)
  for (const side of [1, -1]) {
    b.box(side * (hw + 0.004), 0.5, 0, 0.012, 0.3, 2 * L2 - 0.6, TRIM);
  }
  // side windows: panels separated by pillars. Left (+x): continuous bays; right (-x): bays and a double door.
  const bayEdges: [number, number][] = [];
  const nBays = 7;
  const first = L2 - 0.9;
  const span = (2 * L2 - 1.9) / nBays;
  for (let i = 0; i < nBays; i++) bayEdges.push([first - i * span - 0.07, first - (i + 1) * span + 0.07]);
  const y0w = 1.28;
  const y1w = 2.5;
  for (let i = 0; i < nBays; i++) {
    const [za, zb] = bayEdges[i];
    b.quad([hw + 0.01, y0w, za], [hw + 0.01, y1w, za], [hw + 0.01, y1w, zb], [hw + 0.01, y0w, zb], GLASS_LIT, [0, 1.8, (za + zb) / 2]);
    // right side: bay 1 (index 1) is the door
    if (i === 1) {
      b.quad([-hw - 0.01, 0.55, za + 0.1], [-hw - 0.01, y1w, za + 0.1], [-hw - 0.01, y1w, zb - 0.1], [-hw - 0.01, 0.55, zb - 0.1], GLASS_LIT, [0, 1.8, (za + zb) / 2]);
      b.box(-hw - 0.014, 1.5, (za + zb) / 2, 0.02, 2.0, 0.05, TRIM); // door split
      b.box(-hw - 0.02, 1.55, za + 0.1, 0.035, 2.0, 0.035, fixed(0xe0b020)); // yellow grab rails
      b.box(-hw - 0.02, 1.55, zb - 0.1, 0.035, 2.0, 0.035, fixed(0xe0b020));
    } else {
      b.quad([-hw - 0.01, y0w, za], [-hw - 0.01, y1w, za], [-hw - 0.01, y1w, zb], [-hw - 0.01, y0w, zb], GLASS_LIT, [0, 1.8, (za + zb) / 2]);
    }
  }
  // windscreen, destination board, rear window
  b.box(0, 1.85, L2 + 0.006, 2.12, 1.2, 0.02, GLASS_LIT);
  b.box(0, 1.85, L2 + 0.004, 0.04, 1.2, 0.02, TRIM);
  b.box(0, 2.83, L2 - 0.03, 1.7, 0.2, 0.04, TRIM);
  b.box(0, 2.83, L2 - 0.005, 1.5, 0.12, 0.012, BOARD);
  b.box(0, 1.9, -L2 - 0.006, 1.8, 0.7, 0.02, GLASS_LIT);
  // lights, bumpers, plates
  for (const side of [1, -1]) {
    b.box(side * 0.92, 0.72, L2 - 0.02, 0.4, 0.16, 0.08, HEAD);
    b.box(side * 1.12, 0.52, L2 - 0.03, 0.12, 0.1, 0.08, INDICATOR);
    b.box(side * 1.08, 0.9, -L2 + 0.03, 0.16, 0.5, 0.08, TAIL);
    b.box(side * 1.12, 0.52, -L2 + 0.03, 0.1, 0.1, 0.08, INDICATOR);
    // big mirrors
    b.box(side * (hw + 0.18), 2.0, L2 - 0.5, 0.1, 0.4, 0.2, TRIM);
  }
  b.box(0, 0.4, L2 - 0.03, 2.5, 0.28, 0.16, TRIM);
  b.box(0, 0.4, -L2 + 0.03, 2.5, 0.28, 0.16, TRIM);
  b.box(0, 0.5, L2 + 0.06, 0.6, 0.12, 0.012, PLATE);
  b.box(0, 0.5, -L2 - 0.06, 0.6, 0.12, 0.012, PLATE);
  b.box(0, 2.5, -L2 + 0.02, 0.5, 0.05, 0.03, BRAKE);
  // roof equipment
  b.box(0, yr + 0.1, -1.0, 1.1, 0.2, 2.4, fixed(0xc8ccd0));
  b.box(0, yr + 0.07, 3.0, 0.9, 0.14, 0.9, fixed(0xb9bec4));
  b.box(0, yr + 0.07, -4.2, 0.9, 0.14, 0.7, fixed(0xb9bec4));
  // wheels and arches
  for (const z of [3.6, -3.2]) {
    for (const side of [1, -1] as const) {
      b.arch(side * (hw + 0.01), 0.5, z, 0.62, yb + 0.02, side);
      b.wheel(side * (hw + 0.03 - 0.13), 0.5, z, 0.28, side, 12);
    }
  }
  return b.build();
}
export function truckModel(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const hw = 1.15;
  const boxCol: Style = fixed(0xf0f0ec);
  // chassis rails and fuel tank
  b.box(0, 0.62, -0.2, 1.5, 0.22, 7.6, TRIM);
  b.box(hw - 0.2, 0.55, 0.8, 0.45, 0.4, 1.1, fixed(0x8a8d92));
  // cab: lofted with slanted windscreen
  const cab: V3[][] = [
    [[hw, 0.55, 4.0], [hw, 1.55, 4.0], [hw * 0.88, 1.62, 4.0], [-hw * 0.88, 1.62, 4.0], [-hw, 1.55, 4.0], [-hw, 0.55, 4.0]],
    [[hw, 0.55, 3.85], [hw, 1.7, 3.85], [hw * 0.9, 1.78, 3.85], [-hw * 0.9, 1.78, 3.85], [-hw, 1.7, 3.85], [-hw, 0.55, 3.85]],
    [[hw, 0.55, 3.55], [hw, 1.9, 3.55], [hw * 0.9, 2.05, 3.55], [-hw * 0.9, 2.05, 3.55], [-hw, 1.9, 3.55], [-hw, 0.55, 3.55]],
    [[hw, 0.55, 3.0], [hw, 2.05, 3.0], [hw * 0.9, 2.62, 3.0], [-hw * 0.9, 2.62, 3.0], [-hw, 2.05, 3.0], [-hw, 0.55, 3.0]],
    [[hw, 0.55, 2.2], [hw, 2.1, 2.2], [hw * 0.9, 2.66, 2.2], [-hw * 0.9, 2.66, 2.2], [-hw, 2.1, 2.2], [-hw, 0.55, 2.2]],
  ];
  b.loft(cab, (e, seg) => (e === 5 ? TRIM : e === 2 && seg === 2 ? GLASS : PAINT), { ref: [0, 1.4, 3.1], capA: PAINT, capB: PAINT });
  // side windows on the cab doors
  for (const side of [1, -1]) {
    const x = side * (hw + 0.008);
    b.quad([x, 1.55, 3.42], [x, 2.38, 3.1], [x, 2.38, 2.45], [x, 1.55, 2.45], GLASS, [0, 1.8, 3]);
    b.box(x, 1.0, 3.0, 0.012, 1.0, 0.02, TRIM);
    b.box(side * (hw + 0.14), 2.0, 3.65, 0.14, 0.5, 0.18, TRIM); // mirror
    b.box(side * 0.8, 1.05, 4.0, 0.42, 0.18, 0.08, HEAD);
    b.box(side * 1.02, 0.78, 4.0, 0.14, 0.1, 0.08, INDICATOR);
    b.box(side * 0.7, 0.95, -3.98, 0.3, 0.2, 0.08, TAIL);
    b.box(side * 1.04, 0.78, -3.98, 0.1, 0.1, 0.08, INDICATOR);
    // mudguards
  }
  b.box(0, 1.1, 4.01, 1.1, 0.6, 0.04, TRIM); // grille
  b.box(0, 0.5, 4.0, 2.3, 0.3, 0.2, TRIM); // bumper
  b.box(0, 0.55, 4.18, 0.56, 0.12, 0.012, PLATE);
  b.box(0, 2.0, 3.0, 1.9, 0.4, 0.02, GLASS); // windscreen header read
  // windscreen proper
  b.quad([-1.0, 1.82, 3.82], [1.0, 1.82, 3.82], [0.95, 2.4, 3.2], [-0.95, 2.4, 3.2], GLASS, [0, 1.0, 3.4]);
  b.box(0, 2.58, 3.6, 1.6, 0.14, 0.4, BOARD); // sun visor / sign
  // cargo box
  b.box(0, 2.0, -1.4, 2.4, 2.4, 6.2, boxCol);
  b.box(0, 3.22, -1.4, 2.3, 0.04, 6.1, fixed(0xd5d7d9));
  for (let i = 0; i < 6; i++) {
    for (const side of [1, -1]) {
      b.box(side * 1.205, 2.0, 1.5 - i * 1.1, 0.012, 2.3, 0.06, fixed(0xd0d2d4));
    }
  }
  // coloured band on the box (paint)
  for (const side of [1, -1]) b.box(side * 1.206, 1.35, -1.4, 0.014, 0.4, 6.0, PAINT);
  b.box(0, 1.35, -4.505, 2.3, 0.4, 0.014, PAINT);
  b.box(0, 2.0, -4.51, 0.04, 2.2, 0.012, fixed(0xb0b2b5)); // rear door split
  b.box(0, 0.78, -4.1, 2.2, 0.22, 0.14, TRIM); // underrun bar
  b.box(0, 0.8, -4.2, 0.56, 0.12, 0.012, PLATE);
  b.box(0, 3.1, -4.52, 0.5, 0.04, 0.03, BRAKE);
  // wheels
  for (const z of [3.0, -1.6, -2.9]) {
    for (const side of [1, -1] as const) {
      b.arch(side * (hw + 0.006), 0.45, z, 0.56, 0.55, side);
      b.wheel(side * (hw + 0.03 - 0.15), 0.45, z, 0.3, side, 12);
    }
  }
  return b.build();
}
