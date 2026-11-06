// Culture monument: gothic cathedral (split from culture.ts).

import * as THREE from 'three';
import type { V3 } from '../geometry';
import { bench, crowd, lamp, onFace, planter, tint, tree, windowAt, type C, type Kit, type Site } from './kit';
import { buildings } from '../../config/tuning';
import { SURFACE } from '../surface';
import { PI, TAU } from './culturePrehistoric';

// ---------------------------------------------------------------------------
// Gothic cathedral: west towers with spires, rose window, nave, aisles,
// flying buttresses, transept, apse with ambulatory, crossing flèche.
// ---------------------------------------------------------------------------
function rose(k: Kit, y: number, r: number, glass: C, lit: boolean): void {
  k.add(lit ? 'glassLit' : 'glass', new THREE.CylinderGeometry(r, r, 0.08, 16), glass, [0, y, 0.02], [PI / 2, 0, 0]);
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU;
    const a1 = ((i + 1) / n) * TAU;
    k.beam('#e9e1cf', [r * Math.cos(a0), y + r * Math.sin(a0), 0.1], [r * Math.cos(a1), y + r * Math.sin(a1), 0.1], 0.32);
    if (i % 2 === 0) k.beam('#e9e1cf', [0, y, 0.08], [r * Math.cos(a0), y + r * Math.sin(a0), 0.08], 0.1);
  }
  k.add('body', new THREE.CylinderGeometry(r * 0.22, r * 0.22, 0.2, 10), '#e9e1cf', [0, y, 0.1], [PI / 2, 0, 0]);
}

/** Recessed pointed portal on a wall facing local +z at z = 0. */
function portal(k: Kit, x: number, w: number, h: number, stone: C, lit: boolean): void {
  k.glass(lit, w, h, 0.06, x, 0, 0.02, '#3a2a20');
  const sq = w / Math.SQRT2;
  k.add(lit ? 'glassLit' : 'glass', new THREE.BoxGeometry(sq, sq, 0.06), '#3a2a20', [x, h, 0.02], [0, 0, PI / 4]);
  for (let i = 1; i <= 3; i++) {
    const ww = w + i * 0.5;
    const d = 0.9 - i * 0.22;
    k.box(stone, 0.25, h, d, x - ww / 2, 0, d / 2);
    k.box(stone, 0.25, h, d, x + ww / 2, 0, d / 2);
    k.boxR('body', stone, 0.25, ww * 0.74, d, [x - ww * 0.26, h + ww * 0.25, d / 2], [0, 0, -PI / 4]);
    k.boxR('body', stone, 0.25, ww * 0.74, d, [x + ww * 0.26, h + ww * 0.25, d / 2], [0, 0, PI / 4]);
  }
  k.gableRoof(stone, w + 2.2, w * 0.9, 0.4, x, h + w * 0.55 + 0.7, 0.35);
  // Jamb shafts proud of the mouldings, and a finial on the hood gable.
  for (const sx of [-1, 1]) k.cyl(stone, 0.09, 0.09, h * 0.95, x + sx * (w / 2 + 0.25), 0, 0.78, 8);
  k.cone(stone, 0.12, 0.5, x, h + w * 0.55 + 0.7 + w * 0.9, 0.35, 6);
}

/** Hood mould over a lancet: two chevron bars meeting above the apex, label stops at the springing. Local frame, proud of the wall (z 0.36). No RNG draw. */
function hoodMould(k: Kit, x: number, y0: number, w: number, h: number, stone: C): void {
  const z = 0.36;
  const apex: V3 = [x, y0 + h + w * 0.5 + 0.12, z];
  for (const sx of [-1, 1]) {
    const end: V3 = [x + sx * w * 0.6, y0 + h - 0.02, z];
    k.beam(stone, apex, end, 0.14);
    k.blob(stone, 0.11, end[0], end[1] + 0.02, z + 0.04);
  }
}

/** Deterministic tone offset in [-amount, amount] (HSL lightness) from a position. No RNG draw, so other pieces keep their stream. */
function ageJitter(x: number, z: number, amount: number): number {
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return (h - Math.floor(h) - 0.5) * 2 * amount;
}

export function gothicCathedral(k: Kit, s: Site): void {
  // Stone walls get the ashlar pattern (surface.ts); roof pieces switch to a roof surface inside.
  k.batch.withSurface(SURFACE.STONE_AGED, () => cathedral(k, s));
}

function cathedral(k: Kit, s: Site): void {
  const stone = k.pick(buildings.cathedralStonePalette);
  const dark = tint(stone, -0.08);
  // Each wall piece gets its own tone, so the stone does not read as one flat colour.
  const wallTone = (x: number, z: number): string => tint(stone, ageJitter(x, z, buildings.cathedralStoneJitter));
  const roof = k.pick([buildings.cathedralRoofSlate, buildings.cathedralRoofSlate, buildings.cathedralRoofZinc]);
  // Slate roofs get the staggered slate tiles; the copper-green roof gets standing-seam zinc.
  const roofSurface = roof === buildings.cathedralRoofZinc ? SURFACE.ZINC_AGED : SURFACE.SLATE_AGED;
  // Each roof piece gets its own tone (no RNG draw).
  const roofTone = (x: number, z: number): string => tint(roof, ageJitter(x, z, buildings.cathedralRoofJitter));
  const onRoof = (fn: () => void): void => {
    k.batch.withSurface(roofSurface, fn);
  };
  const glassC = k.pick(['#3f4f7a', '#4a3f6a', '#2f5a6a']);
  const lanc = { frame: dark, pointed: true, sill: false, depth: 0.25 };

  const nw = 8; // nave width
  const nH = 15; // nave eaves
  const aW = 3.5; // aisle width
  const aH = 8;
  const front = Math.min(14, s.hd - 3);
  const tw = 5.5;
  const tz = front - tw / 2;
  // Nave ends where the west front begins (front - 1.0): no narthex slot between nave and facade.
  const naveZ1 = front - 1.0;
  const naveZ0 = -7.5; // apse joint
  const trZ0 = -3.5;
  const trZ1 = 2.5;
  const trX = Math.min(12.5, s.hw - 3);
  const naveLen = naveZ1 - naveZ0;
  const naveCz = (naveZ0 + naveZ1) / 2;

  // Nave and aisles.
  k.box(wallTone(0, naveCz), nw, nH, naveLen, 0, 0, naveCz);
  k.box(dark, nw + 0.5, 0.4, naveLen, 0, nH, naveCz);
  onRoof(() => k.gableRoof(roofTone(0, naveCz), nw + 0.8, 8, naveLen, 0, nH + 0.4, naveCz));
  for (const sx of [-1, 1]) k.box(wallTone(sx, naveCz), aW, aH, naveLen, sx * (nw / 2 + aW / 2), 0, naveCz);
  onRoof(() => k.gableRoof(roofTone(0, naveCz), nw + 2 * aW + 0.6, 3.2, naveLen, 0, aH, naveCz));

  // Transept with rose windows on both ends.
  const trW = trZ1 - trZ0;
  const trCz = (trZ0 + trZ1) / 2;
  k.box(wallTone(0, trCz), 2 * trX, nH, trW, 0, 0, trCz);
  k.box(dark, 2 * trX + 0.5, 0.4, trW + 0.5, 0, nH, trCz);
  onRoof(() => k.gableRoof(roofTone(0, trCz), trW + 0.8, 7, 2 * trX + 0.6, 0, nH + 0.4, trCz, PI / 2));
  for (const sx of [-1, 1]) {
    k.at(sx * trX, trCz, (sx * PI) / 2, () => {
      rose(k, 10.5, 2.2, glassC, k.chance(buildings.cathedralRoseLitShare));
      portal(k, 0, 1.8, 3.2, dark, false);
      for (const u of [-trW / 2 + 0.3, trW / 2 - 0.3]) {
        k.box(dark, 0.8, nH + 3, 0.8, u, 0, 0.3);
        k.cone(dark, 0.55, 2.4, u, nH + 3, 0.3, 4, PI / 4);
      }
    });
  }

  // Apse and ambulatory (half-round, towards -z).
  const APSE_SEGS = 12; // half-round facets, smooth at 4 m and 7.5 m radius
  k.add('body', new THREE.CylinderGeometry(nw / 2, nw / 2, nH, APSE_SEGS, 1, false, PI / 2, PI), wallTone(0, naveZ0), [0, nH / 2, naveZ0]);
  onRoof(() => k.add('body', new THREE.ConeGeometry(nw / 2 + 0.4, 6.5, APSE_SEGS, 1, false, PI / 2, PI), roofTone(0, naveZ0), [0, nH + 3.25, naveZ0]));
  const ar = nw / 2 + aW;
  k.add('body', new THREE.CylinderGeometry(ar, ar, aH, APSE_SEGS, 1, false, PI / 2, PI), wallTone(0, naveZ0), [0, aH / 2, naveZ0]);
  onRoof(() => k.add('body', new THREE.ConeGeometry(ar + 0.3, 3.2, APSE_SEGS, 1, false, PI / 2, PI), roofTone(0, naveZ0), [0, aH + 1.6, naveZ0]));
  for (let i = 0; i < 5; i++) {
    const a = PI / 2 + ((i + 0.5) / 5) * PI;
    const ox = Math.sin(a);
    const oz = Math.cos(a);
    // clerestory lancets on the apse
    k.at((nw / 2 + 0.02) * ox, naveZ0 + (nw / 2 + 0.02) * oz, a, () => { windowAt(k, 0, aH + 3.3, 0.9, 2.6, k.chance(buildings.cathedralApseLitShare),{ ...lanc, glass: glassC }); hoodMould(k, 0, aH + 3.3, 0.9, 2.6, stone); });
    k.at((ar + 0.02) * ox, naveZ0 + (ar + 0.02) * oz, a, () => { windowAt(k, 0, 2.4, 1.1, 3.0, k.chance(buildings.cathedralApseLitShare),{ ...lanc, glass: glassC }); hoodMould(k, 0, 2.4, 1.1, 3.0, stone); });
    // radial buttresses with flyers
    const bx = (ar + 0.7) * ox;
    const bz = naveZ0 + (ar + 0.7) * oz;
    k.box(dark, 0.9, aH + 2, 0.9, bx, 0, bz, a);
    k.cone(dark, 0.5, 2.4, bx, aH + 2, bz, 4, a + PI / 4);
    k.beam(dark, [bx, aH + 1.6, bz], [(nw / 2) * ox, nH - 1.2, naveZ0 + (nw / 2) * oz], 0.4, 'body', 0.3);
  }

  // Buttresses, flyers and windows along nave and choir.
  const bays: number[] = [];
  const wins: number[] = [];
  for (const [a, b] of [[trZ1 + 0.6, naveZ1 - 0.6], [naveZ0 + 0.4, trZ0 - 0.6]] as const) {
    const n = Math.max(2, Math.round((b - a) / 2.8) + 1);
    for (let i = 0; i < n; i++) {
      bays.push(a + ((b - a) * i) / (n - 1));
      if (i > 0) wins.push(a + ((b - a) * (i - 0.5)) / (n - 1));
    }
  }
  for (const sx of [-1, 1]) {
    const px = sx * (nw / 2 + aW + 0.6);
    for (const z of bays) {
      k.box(dark, 1.0, aH + 2.5, 1.4, px, 0, z);
      k.cone(dark, 0.55, 2.6, px, aH + 2.5, z, 4, PI / 4);
      k.beam(dark, [px, aH + 2.0, z], [sx * (nw / 2), nH - 1.0, z], 0.45, 'body', 0.35);
    }
    for (const z of wins) {
      k.at(sx * (nw / 2 + aW), z, (sx * PI) / 2, () => { windowAt(k, 0, 2.2, 1.3, 3.4, k.chance(buildings.cathedralNaveLitShare),{ ...lanc, glass: glassC }); hoodMould(k, 0, 2.2, 1.3, 3.4, stone); });
      k.at(sx * (nw / 2), z, (sx * PI) / 2, () => { windowAt(k, 0, aH + 3.6, 1.2, 2.8, k.chance(buildings.cathedralNaveLitShare),{ ...lanc, glass: glassC }); hoodMould(k, 0, aH + 3.6, 1.2, 2.8, stone); });
    }
  }

  // Crossing flèche.
  onRoof(() => {
    k.box(roofTone(0, trCz), 2.6, 3.0, 2.6, 0, nH + 6.5, trCz);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) k.cone(roofTone(0, trCz), 0.3, 1.6, dx * 1.2, nH + 9.5, trCz + dz * 1.2, 4);
    k.cone(roofTone(0, trCz), 1.5, 11, 0, nH + 9.5, trCz, 8);
  });
  k.box('#e2b66c', 0.12, 1.4, 0.12, 0, nH + 20.5, trCz);
  k.box('#e2b66c', 0.7, 0.12, 0.12, 0, nH + 21.3, trCz);

  // West towers with belfries, corner buttresses, pinnacles and spires.
  const th = 24;
  for (const sx of [-1, 1]) {
    const x = sx * (nw / 2 + tw / 2);
    k.box(wallTone(x, tz), tw, th, tw, x, 0, tz);
    for (const y of [aH, 15, 21]) k.box(dark, tw + 0.3, 0.35, tw + 0.3, x, y, tz);
    for (const dx of [-1, 1]) {
      for (const dz of [-1, 1]) {
        const cx = x + dx * (tw / 2);
        const cz = tz + dz * (tw / 2);
        k.box(dark, 0.9, th - 6, 0.9, cx, 0, cz);
        k.box(dark, 0.65, 6, 0.65, cx, th - 6, cz); // reaches the belfry platform at th
        k.cone(dark, 0.45, 2.8, cx, th + 0.6, cz, 4, PI / 4);
      }
    }
    for (const f of ['front', 'left', 'right', 'back'] as const) {
      if ((f === 'left' && sx > 0) || (f === 'right' && sx < 0)) continue;
      onFace(k, f, x, tz, tw, tw, () => {
        for (const u of [-0.9, 0.9]) windowAt(k, u, 16.0, 0.8, 4.0, false, { frame: dark, pointed: true, sill: false, glass: '#1e2328', depth: 0.3 });
        if (f === 'front') { windowAt(k, 0, 9.5, 1.0, 3.0, k.chance(buildings.cathedralWestTowerLitShare),{ ...lanc, glass: glassC }); hoodMould(k, 0, 9.5, 1.0, 3.0, stone); }
      });
    }
    k.box(dark, tw + 0.8, 0.6, tw + 0.8, x, th, tz);
    onRoof(() => k.add('body', new THREE.ConeGeometry(2.4, 14, 8), roofTone(x, tz), [x, th + 0.6 + 7, tz], [0, PI / 8, 0]));
    k.box('#e2b66c', 0.12, 1.4, 0.12, x, th + 14.6, tz);
    k.box('#e2b66c', 0.7, 0.12, 0.12, x, th + 15.3, tz);
  }

  // West front between the towers: portals, gallery of kings, rose window, gable.
  k.box(wallTone(0, front - 0.5), nw, 19, 1.0, 0, 0, front - 0.5);
  k.at(0, front, 0, () => {
    portal(k, 0, 2.8, 4.2, dark, true);
    k.box(dark, nw, 0.4, 0.5, 0, 8.8, 0.25);
    for (let i = 0; i < 7; i++) k.glass(false, 0.5, 1.0, 0.06, -3 + i, 9.2, 0.02, '#3a3430');
    k.box(dark, nw, 0.4, 0.5, 0, 10.2, 0.25);
    rose(k, 13.6, 2.6, glassC, k.chance(buildings.cathedralRoseLitShare));
    k.box(dark, nw, 0.35, 0.5, 0, 16.8, 0.25);
    for (let i = 0; i < 9; i++) k.box(dark, 0.2, 1.2, 0.2, -3.6 + i * 0.9, 17.15, 0.2);
    k.gableRoof(stone, nw, 4.2, 1.0, 0, 19, -0.5);
    k.cone(dark, 0.4, 1.8, 0, 23.1, -0.5, 4, PI / 4);
  });
  for (const sx of [-1, 1]) {
    k.at(sx * (nw / 2 + tw / 2), front, 0, () => portal(k, 0, 1.9, 3.8, dark, false));
  }

  // Parvis: steps, lamps, trees, people.
  const pw = nw + 2 * tw + 1;
  for (let i = 0; i < 3; i++) k.box(dark, pw - i * 0.6, 0.18, 1.6 - i * 0.45, 0, i * 0.18, front + 0.8 - i * 0.22);
  crowd(k, buildings.cathedralCrowd, -8, 8, front + 1.8, s.hd - 0.6);
  for (const sx of [-1, 1]) {
    lamp(k, sx * (pw / 2 + 0.8), front + 1);
    tree(k, sx * (s.hw - 2.4), front - 4, 7);
    tree(k, sx * (s.hw - 2.4), front - 10, 6.5);
    bench(k, sx * (s.hw - 1.4), front - 7, sx > 0 ? -PI / 2 : PI / 2);
    planter(k, sx * (s.hw - 1.4), -s.hd + 2, 1.4, 1.4, false);
  }
}
