// Leisure monument: funfair stalls and rides (split from leisure.ts).

import * as THREE from 'three';
import type { V3 } from '../geometry';
import { WIND, anchorWeight } from '../facade/polish';
import { bench, bulbs, bunting, crowd, lamp, lettering, signBoard, type C, type Kit, type Site } from './kit';
import { buildings } from '../../config/tuning';
import { PI, TAU } from './leisureSport';

// ---------------------------------------------------------------------------
// Funfair: Ferris wheel, carousel, helter-skelter, stalls, bunting, entrance arch.
// ---------------------------------------------------------------------------
const FAIR = ['#d7263d', '#f2c14e', '#2f6b8f', '#2f8f4f', '#e07a1f', '#9b59b6', '#efeee8'];

function stall(k: Kit, x: number, z: number, ry: number, stripe: C): void {
  k.at(x, z, ry, () => {
    k.box('#e9dcc0', 3.6, 2.6, 0.2, 0, 0, -1.1);
    k.box('#e9dcc0', 0.2, 2.6, 2.4, -1.7, 0, 0);
    k.box('#e9dcc0', 0.2, 2.6, 2.4, 1.7, 0, 0);
    k.box(stripe, 3.4, 1.0, 0.5, 0, 0, 0.9);
    k.box('#8a6a45', 3.6, 0.1, 0.7, 0, 1.0, 0.9);
    k.glass(true, 3.2, 1.2, 1.5, 0, 1.1, -0.3, '#5a4a3a');
    // striped awning, sloping down to the front
    // Fabric: fixed at the wall side (z 0.35), free at the front edge.
    // Slat centre 2.5 m: its back edge (rises ~0.29 m under the 0.35 rad tilt) ends inside the roof slab (2.6-2.8 m).
    k.withWind(WIND.AWNING, (_x, _y, z) => anchorWeight(z, 0.35, 2.05), () => {
      for (let i = 0; i < 8; i++) {
        k.boxR('body', i % 2 === 0 ? stripe : '#ffffff', 0.46, 0.06, 1.7, [-1.61 + i * 0.46, 2.5, 1.2], [0.35, 0, 0]);
      }
    });
    k.box('#e9dcc0', 3.6, 0.2, 2.4, 0, 2.6, 0);
    signBoard(k, 0, 2.8, -0.6, 3.0, 0.8, stripe, '#fff3c4');
  });
}

export function funfair(k: Kit, s: Site): void {
  // Ferris wheel (in the xy plane, facing the street).
  const R = 8;
  const wx = -s.hw + R + 1.6;
  const wy = R + 2.1;
  const wz = -s.hd + 9;
  const N = 16;
  const rim = '#efeee8';
  const frame = '#e2e2dc';
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    pts.push([wx + R * Math.cos(a), wy + R * Math.sin(a)]);
  }
  for (const dz of [-0.8, 0.8]) {
    for (let i = 0; i < N; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % N];
      k.beam(rim, [x0, y0, wz + dz], [x1, y1, wz + dz], 0.22);
      k.beam(frame, [wx, wy, wz + dz * 1.2], [x0, y0, wz + dz], 0.09);
      if (dz > 0) k.glass(true, 0.2, 0.2, 0.2, x0, y0 - 0.1, wz + dz + 0.15, '#fff1c4');
    }
  }
  for (let i = 0; i < N; i++) {
    const [x, y] = pts[i];
    k.beam(frame, [x, y, wz - 0.8], [x, y, wz + 0.8], 0.1);
    const col = FAIR[i % FAIR.length];
    k.beam('#5a5f66', [x, y, wz], [x, y - 0.6, wz], 0.06);
    k.box(col, 1.1, 0.85, 1.1, x, y - 1.45, wz);
    k.glass(i % 3 === 0, 1.14, 0.35, 0.9, x, y - 1.05, wz, '#3a4a58');
    k.cone(col, 0.78, 0.35, x, y - 0.65, wz, 4, PI / 4);
  }
  k.add('body', new THREE.CylinderGeometry(0.7, 0.7, 2.4, 10), '#d7263d', [wx, wy, wz], [PI / 2, 0, 0]);
  for (const dz of [-1.2, 1.2]) {
    for (const dx of [-1, 1]) k.beam('#f2f0ea', [wx, wy, wz + dz], [wx + dx * 4.6, 0, wz + dz * 1.8], 0.36);
    k.beam('#f2f0ea', [wx - 3.0, 3.2, wz + dz * 1.4], [wx + 3.0, 3.2, wz + dz * 1.4], 0.2);
  }
  k.box('#8a6a45', 6, 0.5, 3.4, wx, 0, wz + 0.0);
  k.box('#c9c6bf', 2.0, 0.25, 1.2, wx, 0.5, wz + 2.1);
  // ticket hut
  k.box('#2f6b8f', 1.6, 2.3, 1.4, wx + 4.2, 0, wz + 3.2);
  k.cone('#d7263d', 1.2, 0.8, wx + 4.2, 2.3, wz + 3.2, 4, PI / 4);
  k.glass(true, 1.0, 0.7, 0.06, wx + 4.2, 1.1, wz + 3.91, '#5a4a3a');

  // Carousel with a striped conical roof.
  const cx = s.hw - 7;
  const cz = -s.hd + 10;
  const cr = 5;
  const red = '#d7263d';
  k.cyl('#efeee8', cr, cr + 0.1, 0.6, cx, 0, cz, 20);
  k.cyl(red, cr + 0.12, cr + 0.12, 0.2, cx, 0.2, cz, 20);
  k.cyl('#f2c14e', 0.9, 0.9, 4.0, cx, 0.6, cz, 10); // top 4.6 m: meets the canopy band (bottom 4.55 m)
  const nw = 16;
  for (let i = 0; i < nw; i++) {
    const t0 = (i / nw) * TAU;
    const col = i % 2 === 0 ? red : '#ffffff';
    k.add('body', new THREE.ConeGeometry(cr + 0.6, 2.8, 2, 1, true, t0, TAU / nw), col, [cx, 4.4 + 1.4 + 0.5, cz]);
    k.add('body', new THREE.CylinderGeometry(cr + 0.6, cr + 0.6, 0.7, 2, 1, true, t0, TAU / nw), i % 2 === 0 ? '#f2c14e' : red, [cx, 4.4 + 0.35 + 0.15, cz]);
  }
  k.cyl('#f2c14e', 0.1, 0.25, 1.0, cx, 7.7, cz, 6);
  k.box(red, 0.8, 0.5, 0.03, cx + 0.4, 8.2, cz);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    k.cyl('#f2c14e', 0.07, 0.07, 3.8, cx + (cr - 0.2) * Math.cos(a), 0.6, cz + (cr - 0.2) * Math.sin(a), 5);
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    k.glass(true, 0.18, 0.18, 0.18, cx + (cr + 0.62) * Math.cos(a), 4.6, cz + (cr + 0.62) * Math.sin(a), '#fff1c4');
  }
  // Horses on poles.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    const hx = cx + 3.4 * Math.cos(a);
    const hz = cz + 3.4 * Math.sin(a);
    const hy = 1.4 + (i % 2) * 0.4;
    k.cyl('#f2c14e', 0.04, 0.04, 3.8, hx, 0.6, hz, 4);
    k.at(hx, hz, -a, () => {
      const col = k.pick(['#ffffff', '#e9dcc0', '#6b4a2e', '#22262a']);
      k.box(col, 0.35, 0.45, 1.1, 0, hy, 0);
      k.boxR('body', col, 0.25, 0.6, 0.3, [0, hy + 0.65, 0.55], [0.5, 0, 0]);
      for (const lz of [-0.4, 0.4]) k.box(col, 0.25, 0.5, 0.1, 0, hy - 0.45, lz);
      k.box(FAIR[i % FAIR.length], 0.38, 0.1, 0.4, 0, hy + 0.45, 0);
    });
  }

  // Helter-skelter.
  const hx = s.hw - 3.4;
  const hz = s.hd - 4.2;
  for (let i = 0; i < 6; i++) k.cyl(i % 2 === 0 ? red : '#ffffff', 1.4, 1.5, 1.3, hx, i * 1.3, hz, 10);
  k.cone(red, 1.9, 2.4, hx, 7.8, hz, 10);
  k.box('#f2c14e', 0.06, 0.8, 0.5, hx, 10.2, hz);
  for (let i = 0; i < 30; i++) {
    const a0 = i * 0.42;
    const a1 = (i + 1) * 0.42;
    const y0 = 7.4 - i * 0.24;
    const y1 = 7.4 - (i + 1) * 0.24;
    k.beam('#f2c14e', [hx + 2.0 * Math.cos(a0), y0, hz + 2.0 * Math.sin(a0)], [hx + 2.0 * Math.cos(a1), y1, hz + 2.0 * Math.sin(a1)], 0.7, 'body', 0.12);
  }

  // Stalls in a row, entrance arch with lights.
  const sz = 4.5;
  const stallXs = [-s.hw + 3, -s.hw + 7.2, s.hw - 7.2, s.hw - 3];
  stallXs.forEach((x, i) => stall(k, x, sz, 0, FAIR[(i * 2 + Math.floor(k.rng() * 2)) % 5]));
  const az = s.hd - 1.6;
  k.at(0, az, 0, () => {
    for (const sx of [-1, 1]) {
      k.box('#efeee8', 0.8, 5.6, 0.8, sx * 3.6, 0, 0);
      k.cone(red, 0.7, 1.2, sx * 3.6, 5.6, 0, 4, PI / 4);
      k.blob('#f2c14e', 0.18, sx * 3.6, 6.9, 0);
    }
    k.box(red, 7.6, 1.3, 0.4, 0, 4.2, 0);
    k.box('#f2c14e', 7.8, 0.15, 0.45, 0, 4.15, 0);
    k.box('#f2c14e', 7.8, 0.15, 0.45, 0, 5.4, 0);
    lettering(k, 0, 4.45, 0.2, 5.6, 0.8, '#fff3c4', true);
    bulbs(k, [-3.2, 4.1, 0.25], [3.2, 4.1, 0.25], 10, 0.0);
  });
  // Bunting poles and lines.
  const poleY = 4.8;
  const poles: V3[] = [
    [-9, poleY, 11],
    [9, poleY, 11],
    [-3, poleY, 1.5],
    [3, poleY, 1.5],
  ];
  for (const p of poles) k.cyl('#efeee8', 0.07, 0.09, poleY, p[0], 0, p[2], 5);
  bunting(k, [-3.6, 5.4, az], poles[0], FAIR);
  bunting(k, [3.6, 5.4, az], poles[1], FAIR);
  bunting(k, poles[0], poles[2], FAIR);
  bunting(k, poles[1], poles[3], FAIR);
  bunting(k, poles[2], poles[3], FAIR, 0.4);
  bunting(k, poles[2], [wx + 4.6, 3.2, wz + 2.2], FAIR);
  bunting(k, poles[3], [cx, 4.6, cz + cr + 0.5], FAIR);

  // Popcorn cart, balloons, visitors, lamps, benches.
  k.at(-1.5, 8, 0.3, () => {
    k.box('#d7263d', 1.4, 1.0, 0.9, 0, 0.3, 0);
    k.glass(true, 1.2, 0.7, 0.8, 0, 1.3, 0, '#fff1c4');
    k.cone('#ffffff', 0.9, 0.5, 0, 2.3, 0, 6);
    k.cyl('#22262a', 0.3, 0.3, 0.08, -0.5, 0, 0.5, 8);
  });
  // Balloons tied to the pole top with short strings (the pole top is at 2.9 m).
  for (let i = 0; i < 6; i++) {
    const bx = 2.2 + k.range(-0.5, 0.5);
    const by = 2.8 + k.range(0, 0.8);
    const bz = 9 + k.range(-0.5, 0.5);
    k.blob(FAIR[i], 0.28, bx, by, bz, 1, 1.2, 1);
    k.beam('#3a3d42', [2.2, 2.9, 9], [bx, by - 0.3, bz], 0.015);
  }
  k.cyl('#3a3d42', 0.02, 0.02, 2.5, 2.2, 0.4, 9, 3);
  crowd(k, buildings.funfairCrowd, -s.hw + 3, s.hw - 5, 7, s.hd - 3);
  for (const x of [-6.5, 6.5]) lamp(k, x, s.hd - 3);
  bench(k, -s.hw + 1.6, 1.5, PI / 2);
  bench(k, s.hw - 1.6, 1.5, -PI / 2);
}
