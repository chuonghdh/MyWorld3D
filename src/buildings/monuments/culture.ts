// Cultural monuments: dinosaur park, open-air theatre, gothic cathedral.

import * as THREE from 'three';
import type { V3 } from '../geometry';
import {
  bench,
  bulbs,
  crowd,
  cypress,
  lamp,
  lettering,
  onFace,
  person,
  planter,
  signBoard,
  tiers,
  tint,
  tree,
  waterBasin,
  windowAt,
  type C,
  type Kit,
  type Site,
} from './kit';
import { buildings } from '../../config/tuning';
import { SURFACE } from '../surface';

const PI = Math.PI;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Dinosaur park
// ---------------------------------------------------------------------------

/** Chain of beams through points (x, y) in the current frame's xy plane at z = 0, tapering. */
function chain(k: Kit, c: C, pts: readonly [number, number][], t0: number, t1: number): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const t = t0 + ((t1 - t0) * i) / Math.max(1, pts.length - 2);
    k.beam(c, [pts[i][0], pts[i][1], 0], [pts[i + 1][0], pts[i + 1][1], 0], t);
    if (i > 0) k.blob(c, t * 0.62, pts[i][0], pts[i][1], 0);
  }
}

function brachiosaurus(k: Kit, x: number, z: number, ry: number, c: C): void {
  const belly = tint(c, 0.08);
  k.at(x, z, ry, () => {
    k.add('body', new THREE.IcosahedronGeometry(1, 1), c, [0, 6.0, 0], [0, 0, 0.12], [3.6, 2.2, 1.9]);
    k.add('body', new THREE.IcosahedronGeometry(1, 1), belly, [0.2, 5.3, 0], [0, 0, 0.12], [3.0, 1.5, 1.6]);
    for (const lx of [-2.0, 2.0]) {
      for (const lz of [-0.95, 0.95]) {
        const h = lx > 0 ? 5.6 : 4.8;
        k.cyl(c, 0.55, 0.62, h, lx, 0, lz, 7);
        k.cyl(belly, 0.7, 0.7, 0.3, lx, 0, lz, 7);
      }
    }
    chain(k, c, [[2.6, 7.0], [4.0, 9.5], [4.9, 12.0], [5.3, 14.0]], 1.1, 0.6);
    k.add('body', new THREE.BoxGeometry(1.5, 0.7, 0.75), c, [5.9, 14.2, 0], [0, 0, -0.15]);
    for (const ez of [-0.38, 0.38]) k.box('#22262a', 0.14, 0.14, 0.04, 6.1, 14.35, ez);
    chain(k, c, [[-3.0, 6.2], [-5.3, 5.2], [-7.2, 3.6], [-8.6, 2.0]], 1.0, 0.35);
    // dorsal pattern
    for (let i = 0; i < 4; i++) k.blob(tint(c, -0.07), 0.45, -1.5 + i * 1.0, 7.9 + (i === 1 || i === 2 ? 0.2 : 0), 0, 1.2, 0.4, 1.0);
  });
}

function tyrannosaurus(k: Kit, x: number, z: number, ry: number, c: C): void {
  k.at(x, z, ry, () => {
    k.add('body', new THREE.IcosahedronGeometry(1, 1), c, [0, 3.7, 0], [0, 0, 0.25], [2.4, 1.4, 1.2]);
    chain(k, c, [[1.8, 4.3], [2.5, 5.0]], 1.0, 0.9);
    k.add('body', new THREE.BoxGeometry(1.8, 0.95, 1.0), c, [3.2, 5.3, 0], [0, 0, 0.12]);
    k.add('body', new THREE.BoxGeometry(1.5, 0.3, 0.85), tint(c, -0.06), [3.1, 4.55, 0], [0, 0, -0.3]);
    for (let i = 0; i < 4; i++) {
      for (const tz of [-0.36, 0.36]) k.box('#f4efe3', 0.1, 0.18, 0.08, 2.75 + i * 0.3, 4.72 + i * 0.04, tz);
    }
    for (const ez of [-0.5, 0.5]) k.box('#f2c14e', 0.16, 0.14, 0.04, 3.5, 5.55, ez);
    for (const az of [-0.6, 0.6]) k.beam(c, [1.5, 3.6, az], [2.1, 3.0, az * 1.1], 0.18);
    for (const lz of [-0.75, 0.75]) {
      k.blob(c, 1, -0.3, 2.7, lz, 0.75, 1.1, 0.5, 1);
      k.beam(c, [-0.3, 2.1, lz], [0.1, 0.35, lz], 0.42);
      k.box(tint(c, -0.05), 1.1, 0.3, 0.55, 0.4, 0, lz);
    }
    chain(k, c, [[-2.0, 4.0], [-3.9, 3.6], [-5.6, 2.9], [-6.8, 2.3]], 0.95, 0.3);
    for (let i = 0; i < 5; i++) k.blob(tint(c, -0.08), 0.28, -1.6 + i * 0.7, 4.95 - Math.abs(i - 1) * 0.12, 0, 1, 0.5, 1);
  });
}

function stegosaurus(k: Kit, x: number, z: number, ry: number, c: C, plate: C): void {
  k.at(x, z, ry, () => {
    k.add('body', new THREE.IcosahedronGeometry(1, 1), c, [0, 2.2, 0], [0, 0, -0.08], [2.6, 1.3, 1.2]);
    for (const lx of [-1.3, 1.3]) for (const lz of [-0.6, 0.6]) k.cyl(c, 0.3, 0.35, 1.6, lx, 0, lz, 6);
    chain(k, c, [[2.3, 2.0], [3.3, 1.4]], 0.6, 0.5);
    k.box(c, 0.9, 0.45, 0.45, 3.7, 1.15, 0);
    chain(k, c, [[-2.3, 2.3], [-3.6, 1.8], [-4.7, 1.3]], 0.6, 0.25);
    for (const sz of [-1, 1]) {
      k.add('body', new THREE.ConeGeometry(0.1, 0.8, 4), '#efe3c8', [-4.6, 1.5, sz * 0.35], [sz * 0.9, 0, 0.4]);
    }
    for (let i = 0; i < 9; i++) {
      const px = -2.2 + i * 0.55;
      const top = 2.2 + 1.3 * Math.sqrt(Math.max(0, 1 - (px / 2.6) ** 2));
      const h = 0.7 + 0.5 * Math.sin((i / 8) * PI);
      k.add('body', new THREE.ConeGeometry(0.42, h, 4), i % 2 === 0 ? plate : tint(plate, 0.06), [px, top + h / 2 - 0.15, 0], [0, PI / 4, 0], [1, 1, 0.22]);
    }
  });
}

function fern(k: Kit, x: number, z: number, s = 1): void {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + k.range(0, 0.5);
    k.beam(k.pick(['#4f7d3a', '#5d8a45', '#3f6b32']), [x, 0.05, z], [x + Math.cos(a) * 0.9 * s, 0.6 * s, z + Math.sin(a) * 0.9 * s], 0.25 * s, 'body', 0.05);
  }
}

function rock(k: Kit, x: number, z: number, r: number): void {
  k.add('body', new THREE.DodecahedronGeometry(r, 0), k.pick(['#8f8a80', '#9a9488', '#7d786f']), [x, r * 0.45, z], [k.range(0, PI), k.range(0, PI), 0], [1, 0.7, 1.1]);
}

function cycad(k: Kit, x: number, z: number, h = 3): void {
  k.cyl('#7a5a3a', 0.22, 0.3, h, x, 0, z, 6);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    k.beam('#4f8a3a', [x, h, z], [x + Math.cos(a) * 1.8, h - 0.7, z + Math.sin(a) * 1.8], 0.35, 'body', 0.06);
  }
}

// Pond geometry (metres). The deck is the lawn top; the basin origin sits above it so that the pit floor
// (which waterBasin draws 0.05 below its floor) stays at y >= 0. Anything below y = 0 would lift the whole monument.
const POND_W = 5.2;
const POND_D = 4.0;
const POND_COPING = 0.35;
const POND_DEPTH = 0.1;
const POND_Y = 0.16;
const POND_SINK = 0.02; // waterBasin sinks its coping this far below the origin
const POND_STONE = '#cbbfa8';
const POND_CLEAR = 0.4; // ferns keep this far off the pond footprint
const LAWN = '#7fae5c';

export function dinosaurPark(k: Kit, s: Site): void {
  const lawnW = 2 * s.hw - 1.2;
  const lawnD = 2 * s.hd - 1.2;
  const pdx = -s.hw + 4.5;
  const pdz = -1;
  // Lawn with a hole where the pond sits (the pond rests on its own stone base, not on the grass).
  const hx0 = pdx - POND_W / 2;
  const hx1 = pdx + POND_W / 2;
  const hz0 = pdz - POND_D / 2;
  const hz1 = pdz + POND_D / 2;
  const slab = (x0: number, x1: number, z0: number, z1: number): void => {
    if (x1 - x0 <= 0 || z1 - z0 <= 0) return;
    k.box(LAWN, x1 - x0, 0.08, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2);
  };
  slab(-lawnW / 2, lawnW / 2, -lawnD / 2, hz0);
  slab(-lawnW / 2, lawnW / 2, hz1, lawnD / 2);
  slab(-lawnW / 2, hx0, hz0, hz1);
  slab(hx1, lawnW / 2, hz0, hz1);
  const path = '#d9c49a';
  // Paths: entrance avenue and a loop.
  k.box(path, 2.6, 0.03, s.hd - 0.6 - 4, 0, 0.08, (s.hd - 0.6 + 4) / 2);
  k.add('body', new THREE.RingGeometry(6.4, 8.2, 28), path, [0, 0.115, -1], [-PI / 2, 0, 0]);
  k.box(path, 2.2, 0.03, 6, -9.5, 0.08, 4.5, 0.6);

  // Fence with an entrance gap.
  const fx = s.hw - 0.9;
  const fz = s.hd - 0.9;
  const post = (x: number, z: number): void => {
    k.box('#7a5a3a', 0.16, 1.3, 0.16, x, 0, z);
  };
  const rail = (x0: number, z0: number, x1: number, z1: number): void => {
    for (const y of [0.55, 1.05]) k.beam('#8a6a45', [x0, y, z0], [x1, y, z1], 0.08);
  };
  for (let x = -fx; x <= fx + 0.01; x += 2.4) {
    post(x, -fz);
    if (Math.abs(x) > 3.6) post(x, fz);
  }
  for (let z = -fz + 2.4; z < fz; z += 2.4) {
    post(-fx, z);
    post(fx, z);
  }
  rail(-fx, -fz, fx, -fz);
  rail(-fx, -fz, -fx, fz);
  rail(fx, -fz, fx, fz);
  rail(-fx, fz, -3.6, fz);
  rail(3.6, fz, fx, fz);

  // Bone entrance arch with rock pillars and a lit sign.
  k.at(0, fz, 0, () => {
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        k.add('body', new THREE.DodecahedronGeometry(0.9 - i * 0.08, 0), i % 2 ? '#8f8a80' : '#9a9488', [sx * 3.5, 0.6 + i * 1.1, 0], [i, i * 0.7, 0]);
      }
    }
    const R = 3.6;
    const bone = '#efe6d0';
    const arc: V3[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * PI;
      arc.push([R * Math.cos(a), 4.2 + R * 0.7 * Math.sin(a), 0]);
    }
    for (let i = 0; i < 10; i++) k.beam(bone, arc[i], arc[i + 1], 0.45);
    for (let i = 1; i < 10; i += 2) k.blob(bone, 0.32, arc[i][0], arc[i][1], 0);
    signBoard(k, 0, 4.4, 0.3, 5.2, 1.1, '#5a4030', '#fff3c4');
  });

  // Dinosaurs.
  const skin = k.pick(['#7d9a6a', '#8a9a5a', '#6f8f7a']);
  brachiosaurus(k, -4.5, -9, 0.25, skin);
  tyrannosaurus(k, 7.5, 3.0, (-3 * PI) / 4, k.pick(['#8a6a3f', '#6f7d3a', '#7a4f3a']));
  stegosaurus(k, -8.0, 6.5, 0.35, k.pick(['#9a8a5a', '#7a8a5a']), k.pick(['#c9714f', '#b5593a']));

  // Volcano with a glowing crater.
  const vx = s.hw - 6.5;
  const vz = -s.hd + 6.5;
  k.cyl('#7a5a45', 1.2, 4.2, 4.6, vx, 0, vz, 9);
  k.cyl('#5a4030', 1.4, 1.5, 0.4, vx, 4.4, vz, 9);
  k.cyl('#ff7a2a', 1.05, 1.05, 0.1, vx, 4.62, vz, 9, 'glassLit');
  k.beam('#ff7a2a', [vx + 0.6, 4.5, vz + 0.6], [vx + 2.4, 1.0, vz + 2.6], 0.3, 'glassLit', 0.1);
  k.blob('#d9d6d0', 0.9, vx + 0.2, 5.8, vz, 1, 0.8, 1);
  k.blob('#e6e3dd', 0.7, vx + 0.7, 6.8, vz - 0.3, 1, 0.8, 1);

  // Pond: stone rim on a solid stone base, waterBasin pit, rocks outside the rim.
  const underRim = (): void => {
    const c = POND_COPING;
    k.box(POND_STONE, POND_W, POND_Y - POND_SINK, c, pdx, 0, hz0 + c / 2);
    k.box(POND_STONE, POND_W, POND_Y - POND_SINK, c, pdx, 0, hz1 - c / 2);
    k.box(POND_STONE, c, POND_Y - POND_SINK, POND_D - 2 * c, hx0 + c / 2, 0, pdz);
    k.box(POND_STONE, c, POND_Y - POND_SINK, POND_D - 2 * c, hx1 - c / 2, 0, pdz);
  };
  underRim();
  k.at(pdx, pdz, 0, () => waterBasin(k, { w: POND_W, d: POND_D, coping: POND_COPING }, POND_DEPTH, '#4f8fa8'), POND_Y);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    rock(k, pdx + (POND_W / 2 + 0.7) * Math.cos(a), pdz + (POND_D / 2 + 0.7) * Math.sin(a), k.range(0.35, 0.6));
  }

  // Vegetation and rocks. Ferns keep off the pond and the path ring.
  for (let i = 0; i < buildings.dinosaurFernCount; i++) {
    const x = k.range(-s.hw + 2, s.hw - 2);
    const z = k.range(-s.hd + 2, s.hd - 3);
    if (Math.hypot(x, z + 1) < 8.6 && Math.hypot(x, z + 1) > 6) continue;
    if (x > hx0 - POND_CLEAR && x < hx1 + POND_CLEAR && z > hz0 - POND_CLEAR && z < hz1 + POND_CLEAR) continue;
    fern(k, x, z, k.range(0.8, 1.3));
  }
  for (const [x, z] of [[-14, -14], [13.5, 10.5], [-13.5, 12.5], [2.5, -14], [12.5, -2.5]] as const) cycad(k, x * (s.hw / 17), z * (s.hd / 17), k.range(2.6, 3.6));
  for (const [x, z] of [[-14.5, -6], [14.5, 6], [-1.5, -15]] as const) {
    k.cyl('#6b4a2e', 0.2, 0.25, 1.4, x * (s.hw / 17), 0, z * (s.hd / 17), 5);
    k.cone('#2e6b3a', 1.7, 5.5, x * (s.hw / 17), 1.2, z * (s.hd / 17), 7);
  }
  for (const [x, z, r] of [[3, -6, 0.9], [-1.5, 3.5, 0.7], [10, -6, 1.1], [-12, 9, 0.8], [5.5, 9, 0.6], [12, 13, 0.7]] as const) rock(k, x, z, r);

  // Info boards, benches, visitors, lamps.
  for (const [x, z, ry] of [[-2.8, -4.5, 0.4], [4.0, 6.5, -0.6], [-5.5, 2.0, 0.9]] as const) {
    k.at(x, z, ry, () => {
      k.box('#5a4030', 0.1, 0.9, 0.1, -0.5, 0, 0);
      k.box('#5a4030', 0.1, 0.9, 0.1, 0.5, 0, 0);
      k.boxR('body', '#efe3c8', 1.3, 0.8, 0.06, [0, 1.2, 0], [-0.3, 0, 0]);
    });
  }
  bench(k, -2.2, 8.5, PI / 2);
  bench(k, 2.2, 11.5, -PI / 2);
  for (let i = 0; i < 12; i++) {
    const a = k.range(0, TAU);
    person(k, 7.3 * Math.cos(a), -1 + 7.3 * Math.sin(a), a + PI / 2);
  }
  crowd(k, 4, -1, 1, 8, s.hd - 2);
  for (const sx of [-1, 1]) lamp(k, sx * 2, s.hd - 4.5);
}

// ---------------------------------------------------------------------------
// Open-air theatre: semicircular stone cavea, stage with columned backdrop, lights.
// ---------------------------------------------------------------------------
export function openAirTheatre(k: Kit, s: Site): void {
  const stone = k.pick(['#d8cdb5', '#d9c9a8', '#cfc7b6']);
  const stone2 = tint(stone, -0.04);
  const aisle = tint(stone, -0.1);
  const cz = -s.hd + 9;
  const a0 = 5.5;
  const rows = 10;
  const step = Math.min(0.95, (Math.min(s.hw - 1.2, s.hd - 1.5 - cz) - a0) / rows);
  const rise = 0.42;
  const segs = 30;
  const H = tiers(k, {
    cx: 0, cz, a0, b0: a0, step, rise, rows, th0: 0, th1: PI, segs, caps: true,
    seat: (i, r) => (i % 6 === 3 ? aisle : r === 5 ? tint(stone, -0.07) : r % 2 === 0 ? stone : stone2),
    riser: tint(stone, -0.12),
    outer: tint(stone, -0.05),
  });
  const R1 = a0 + rows * step;

  // Colonnade along the top of the cavea, with lights strung between columns.
  const nc = 15;
  let prev: V3 | null = null;
  for (let i = 0; i <= nc; i++) {
    const th = (i / nc) * PI;
    const x = (R1 - 0.4) * Math.cos(th);
    const z = cz + (R1 - 0.4) * Math.sin(th);
    k.cyl(stone, 0.26, 0.3, 3.6, x, H, z, 8);
    k.box(stone2, 0.7, 0.25, 0.7, x, H + 3.6, z);
    const top: V3 = [x, H + 3.98, z];
    if (prev) {
      k.beam(stone, prev, top, 0.55, 'body', 0.75);
      if (i % 2 === 0) bulbs(k, [prev[0], H + 3.6, prev[2]], [x, H + 3.6, z], 4, 0.35);
    }
    prev = top;
  }
  // Orchestra floor and main gate at the back of the cavea.
  k.cyl(tint(stone, 0.05), a0, a0, 0.05, 0, 0, cz, 24);
  k.at(0, cz + R1, 0, () => {
    k.box(stone2, 4.2, H + 1.2, 0.8, 0, 0, 0.3);
    k.glass(false, 2.0, 2.8, 0.06, 0, 0, 0.72, '#2a2420');
    k.box(stone, 2.6, 0.4, 0.3, 0, 2.8, 0.75);
    lettering(k, 0, H - 0.6, 0.72, 3.2, 0.5, '#5a4a3a', false);
  });

  // Stage.
  const sw = Math.min(18, 2 * s.hw - 8);
  const sz1 = cz - 0.6;
  const sz0 = Math.max(-s.hd + 2.8, cz - 6.5);
  const sd = sz1 - sz0;
  k.box(stone2, sw, 1.1, sd, 0, 0, (sz0 + sz1) / 2);
  k.box('#8a6a45', sw - 0.2, 0.08, sd - 0.1, 0, 1.1, (sz0 + sz1) / 2);
  for (let i = 0; i < 3; i++) k.box(stone, 4 - i * 0.4, 0.37, 0.4, 0, i * 0.37, sz1 + 0.6 - i * 0.4);
  for (let i = 0; i < 12; i++) k.glass(true, 0.25, 0.12, 0.2, -sw / 2 + 0.8 + i * ((sw - 1.6) / 11), 1.1, sz1 - 0.15, '#fff1c4');

  // Scaenae frons: backdrop wall with two storeys of columns, doors and a pediment.
  const bw = sw + 2;
  const bz = sz0 - 0.5;
  k.box(stone, bw, 10, 1.0, 0, 0, bz);
  k.box(stone2, bw + 0.4, 0.5, 1.4, 0, 10, bz);
  // Plinth course on the wings (the stage hides the centre) and a shadow course under the cornice.
  for (const sx of [-1, 1]) k.box(stone2, 1.2, 1.1, 1.4, sx * (sw / 2 + 0.6), 0, bz);
  k.box(stone, bw + 0.2, 0.25, 1.2, 0, 9.75, bz);
  k.at(0, bz + 0.5, 0, () => {
    for (const [x, w, h] of [[-5.5, 1.8, 3.2], [0, 2.6, 3.8], [5.5, 1.8, 3.2]] as const) {
      k.glass(x === 0 && k.chance(buildings.theatreDoorLitShare), w, h, 0.06, x, 1.1, 0.0, '#2a2420');
      k.box(stone2, w + 0.6, 0.4, 0.3, x, 1.1 + h, 0.15);
    }
    const nCol = 8;
    for (const [y0, h] of [[1.1, 4.0], [5.6, 3.4]] as const) {
      for (let i = 0; i < nCol; i++) {
        const x = -bw / 2 + 1.2 + (i * (bw - 2.4)) / (nCol - 1);
        k.box(stone2, 0.7, 0.25, 0.7, x, y0, 1.0);
        k.cyl(stone, 0.24, 0.28, h - 0.5, x, y0 + 0.25, 1.0, 8);
        k.box(stone2, 0.7, 0.25, 0.7, x, y0 + h - 0.25, 1.0);
      }
      k.box(stone, bw - 1.2, 0.45, 1.6, 0, y0 + h, 0.7);
    }
    for (const x of [-5.5, 5.5, -2.5, 2.5]) k.glass(false, 0.9, 1.9, 0.06, x, 6.3, 0.0, '#3a3430');
    k.gableRoof(stone, 4.6, 1.3, 1.6, 0, 5.55, 0.8);
    k.gableRoof(stone2, bw * 0.45, 1.8, 1.4, 0, 10.5, 0.2);
  });

  // Lighting towers either side of the stage.
  for (const sx of [-1, 1]) {
    const x = sx * (sw / 2 + 1.5);
    const z = cz - 1.5;
    k.box('#3a3d42', 0.4, 9, 0.4, x, 0, z);
    k.box('#3a3d42', 1.6, 0.2, 0.6, x, 9, z);
    k.at(x, z, sx > 0 ? -PI / 2 - 0.6 : PI / 2 + 0.6, () => {
      for (let i = 0; i < 3; i++) {
        k.box('#22262a', 0.45, 0.45, 0.5, -0.5 + i * 0.5, 8.4, 0.3);
        k.glass(true, 0.32, 0.32, 0.06, -0.5 + i * 0.5, 8.47, 0.56, '#fff7dc');
      }
    });
  }

  // Cypresses, planters, audience, lamps.
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) cypress(k, x * (s.hw - 1.5), z > 0 ? s.hd - 1.8 : -s.hd + 1.5, 8.5);
  // Seated audience on the rows, facing the stage.
  for (let i = 0; i < buildings.theatreAudienceCount; i++) {
    const r = Math.floor(k.range(0, rows - 1));
    const th = k.range(0.15, PI - 0.15);
    const rr = a0 + (r + 0.5) * step;
    const y = (r + 1) * rise;
    k.at(rr * Math.cos(th), cz + rr * Math.sin(th), Math.atan2(-Math.cos(th), -Math.sin(th)), () => {
      k.box(k.pick(['#b03a2e', '#24395c', '#2f6b4f', '#e2b66c', '#efeee8']), 0.44, 0.6, 0.3, 0, y, 0);
      k.box('#e8c4a0', 0.22, 0.24, 0.22, 0, y + 0.6, 0);
    });
  }
  for (const sx of [-1, 1]) {
    planter(k, sx * 6, s.hd - 1.2, 1.8, 1.0, true);
    lamp(k, sx * 3.2, s.hd - 1.4);
  }
}

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
