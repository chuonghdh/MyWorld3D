// Culture monument: dinosaur park, creatures and plants (split from culture.ts).

import * as THREE from 'three';
import type { V3 } from '../geometry';
import { bench, crowd, lamp, person, signBoard, tint, waterBasin, type C, type Kit, type Site } from './kit';
import { buildings } from '../../config/tuning';

export const PI = Math.PI;
export const TAU = Math.PI * 2;

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
