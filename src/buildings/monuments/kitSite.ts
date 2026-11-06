// Monument kit site dressing: people, vehicles, trees and props (split from kit.ts).

import * as THREE from 'three';
import { type V3 } from '../geometry';
import { WIND, anchorWeight } from '../facade/polish';
import { C, Kit } from './kitCore';

const SKIN = ['#e8c4a0', '#c99a72', '#8d5a3b', '#f0d2b4'];
const CLOTHES = ['#b03a2e', '#24395c', '#2f6b4f', '#e2b66c', '#efeee8', '#6c7378', '#c9714f', '#3f6e8f', '#7a2e2a'];
export const CAR_COLORS = ['#b03a2e', '#24395c', '#efeee8', '#22262a', '#6c7378', '#3f6e8f', '#e2b66c', '#2f6b4f', '#c8c4bb'];

/** A standing person, 1.75 m tall, facing local +z after ry. */
export function person(k: Kit, x: number, z: number, ry = 0, shirt?: C): void {
  k.at(x, z, ry, () => {
    k.box(k.pick(['#22262a', '#3a4150', '#5a4a3a', '#24395c']), 0.34, 0.86, 0.2, 0, 0, 0);
    k.box(shirt ?? k.pick(CLOTHES), 0.44, 0.64, 0.26, 0, 0.86, 0);
    k.box(k.pick(SKIN), 0.22, 0.24, 0.22, 0, 1.51, 0);
  });
}

/** A crowd of n people scattered in a rectangle. */
export function crowd(k: Kit, n: number, x0: number, x1: number, z0: number, z1: number): void {
  for (let i = 0; i < n; i++) person(k, k.range(x0, x1), k.range(z0, z1), k.range(0, Math.PI * 2));
}

function wheels(k: Kit, xs: number, zs: readonly number[], r: number, w: number): void {
  for (const z of zs) {
    for (const x of [-xs, xs]) {
      k.add('body', new THREE.CylinderGeometry(r, r, w, 8), '#1d1f22', [x, r, z], [0, 0, Math.PI / 2]);
    }
  }
}

/** A 4.4 m car, front towards local +z. */
export function car(k: Kit, x: number, z: number, ry: number, color: C): void {
  k.at(x, z, ry, () => {
    k.box(color, 1.8, 0.62, 4.4, 0, 0.3, 0);
    k.glass(false, 1.62, 0.46, 2.3, 0, 0.92, -0.25, '#3a4a58');
    k.box(color, 1.58, 0.08, 2.0, 0, 1.38, -0.3);
    k.box('#2a2d31', 1.84, 0.2, 0.18, 0, 0.3, 2.2);
    k.box('#2a2d31', 1.84, 0.2, 0.18, 0, 0.3, -2.2);
    k.glass(true, 0.3, 0.14, 0.06, -0.6, 0.66, 2.2, '#f4efe3');
    k.glass(true, 0.3, 0.14, 0.06, 0.6, 0.66, 2.2, '#f4efe3');
    k.box('#b03a2e', 0.32, 0.14, 0.06, -0.6, 0.68, -2.22);
    k.box('#b03a2e', 0.32, 0.14, 0.06, 0.6, 0.68, -2.22);
    wheels(k, 0.8, [1.35, -1.35], 0.33, 0.24);
  });
}

/** A European box ambulance (white, yellow-green battenburg band), front towards local +z. */
export function ambulance(k: Kit, x: number, z: number, ry: number): void {
  k.at(x, z, ry, () => {
    const white = '#f4f4f0';
    k.box(white, 2.2, 2.3, 4.0, 0, 0.45, -0.7);
    k.box(white, 2.1, 1.25, 1.8, 0, 0.45, 2.2);
    k.boxR('glass', '#3a4a58', 1.9, 0.8, 0.06, [0, 2.1, 2.45], [-0.5, 0, 0]);
    k.box(white, 2.1, 0.8, 1.0, 0, 1.7, 1.75);
    k.glass(false, 2.14, 0.55, 0.8, 0, 1.85, 1.75, '#3a4a58');
    // battenburg band
    for (let i = 0; i < 8; i++) {
      k.box(i % 2 === 0 ? '#e8d33a' : '#2f8f4f', 2.24, 0.45, 0.5, 0, 1.0, -2.45 + i * 0.5);
    }
    k.box('#c0392b', 2.24, 0.12, 4.0, 0, 1.55, -0.7);
    k.box('#c0392b', 0.22, 0.7, 0.04, 0, 1.75, -2.72);
    k.box('#c0392b', 0.7, 0.22, 0.04, 0, 1.99, -2.72);
    k.glass(true, 1.4, 0.18, 0.3, 0, 2.5, 1.9, '#3f6ee8');
    k.glass(true, 0.3, 0.14, 0.06, -0.75, 0.75, 3.11, '#f4efe3');
    k.glass(true, 0.3, 0.14, 0.06, 0.75, 0.75, 3.11, '#f4efe3');
    k.box('#2a2d31', 2.14, 0.25, 0.15, 0, 0.35, 3.1);
    wheels(k, 0.85, [2.1, -1.7], 0.4, 0.26);
  });
}

/** A red fire engine with a roof ladder, 8.6 m long, front towards local +z. */
export function fireEngine(k: Kit, x: number, z: number, ry: number): void {
  k.at(x, z, ry, () => {
    const red = '#c8231e';
    const chrome = '#c9ccd0';
    k.box('#2a2d31', 2.2, 0.4, 8.2, 0, 0.45, 0);
    k.box(red, 2.5, 2.0, 5.8, 0, 0.75, -1.3);
    k.box(red, 2.5, 2.25, 2.5, 0, 0.75, 2.85);
    k.glass(false, 2.3, 0.9, 0.06, 0, 1.85, 4.12, '#3a4a58');
    k.glass(false, 2.54, 0.75, 1.6, 0, 1.95, 2.9, '#3a4a58');
    k.box('#f4f4f0', 2.54, 0.14, 8.2, 0, 1.35, 0.05);
    // locker shutters
    for (let i = 0; i < 4; i++) k.box(chrome, 2.54, 1.05, 0.05, 0, 0.95 + 0.0, -3.6 + i * 1.3);
    k.box(chrome, 2.6, 0.3, 0.2, 0, 0.45, 4.2);
    // ladder
    for (const sx of [-0.45, 0.45]) k.box(chrome, 0.1, 0.14, 7.0, sx, 2.8, -0.6);
    for (let i = 0; i < 14; i++) k.box(chrome, 0.9, 0.06, 0.06, 0, 2.84, -3.9 + i * 0.5);
    k.box('#2a2d31', 1.1, 0.25, 1.1, 0, 2.75, -3.2);
    k.glass(true, 1.6, 0.18, 0.3, 0, 3.0, 3.0, '#3f6ee8');
    k.glass(true, 0.3, 0.16, 0.06, -0.9, 0.95, 4.13, '#f4efe3');
    k.glass(true, 0.3, 0.16, 0.06, 0.9, 0.95, 4.13, '#f4efe3');
    wheels(k, 1.0, [3.0, -2.0, -3.3], 0.5, 0.36);
  });
}

const GREENS = ['#4f7d3a', '#5d8a45', '#6b9650', '#47703a', '#7aa25a'];

/** A deciduous street tree about h metres tall. */
export function tree(k: Kit, x: number, z: number, h = 6.5): void {
  k.cyl('#6b4a2e', 0.13, 0.2, h * 0.45, x, 0, z, 5);
  const r = h * 0.22;
  const g = k.pick(GREENS);
  // The crown nods in the wind (the trunk above stays rigid).
  k.withWind(WIND.PLANT, (_x, y) => anchorWeight(y, h * 0.45, h * 0.95), () => {
    k.blob(g, r, x, h * 0.62, z, 1.1, 0.9, 1.1);
    k.blob(k.jit(g, 0.05), r * 0.75, x + r * 0.5, h * 0.72, z - r * 0.3);
    k.blob(k.jit(g, 0.06), r * 0.7, x - r * 0.45, h * 0.78, z + r * 0.35);
  });
}

/** A slim Mediterranean cypress. */
export function cypress(k: Kit, x: number, z: number, h = 8): void {
  k.cyl('#5a4030', 0.12, 0.15, 0.8, x, 0, z, 5);
  k.cone('#3a5a32', h * 0.12, h * 0.9, x, 0.6, z, 6);
}

/** Stone planter with a clipped shrub or flowers. */
export function planter(k: Kit, x: number, z: number, w = 1.4, d = w, flowers = false): void {
  k.box('#cbbfa8', w, 0.55, d, x, 0, z);
  k.box('#5a4030', w - 0.2, 0.06, d - 0.2, x, 0.55, z);
  // Only the foliage and blooms nod; the stone trough and soil stay rigid.
  k.withWind(WIND.PLANT, (_x, y) => anchorWeight(y, 0.58, 1.2), () => {
    if (flowers) {
      k.blob('#4f7d3a', w * 0.42, x, 0.75, z, 1, 0.55, d / w);
      const fc = k.pick(['#d9534f', '#f2c14e', '#e8b4a8', '#efeee8', '#9b59b6']);
      k.blob(fc, w * 0.18, x - w * 0.15, 0.95, z + 0.1, 1, 0.6, 1);
      k.blob(fc, w * 0.16, x + w * 0.18, 0.93, z - 0.12, 1, 0.6, 1);
    } else {
      k.blob(k.pick(GREENS), w * 0.45, x, 0.95, z, 1, 0.8, d / w);
    }
  });
}

/** Flagpole with a flag flying towards local +x. */
export function flagpole(k: Kit, x: number, z: number, h: number, flag: C, flag2?: C): void {
  k.cyl('#d8d8d4', 0.05, 0.08, h, x, 0, z, 6);
  k.blob('#e2b66c', 0.1, x, h + 0.05, z);
  // Only the cloth streams; the pole and finial are rigid.
  k.withWind(WIND.FLAG, (px) => anchorWeight(px, x + 0.03, x + 1.53), () => {
    k.box(flag, 1.5, flag2 ? 0.5 : 1.0, 0.04, x + 0.78, h - 1.1, z);
    if (flag2) k.box(flag2, 1.5, 0.5, 0.04, x + 0.78, h - 0.6, z);
  });
}

/** Classic street lamp, 4.5 m, with a lantern that glows at night. */
export function lamp(k: Kit, x: number, z: number, h = 4.5): void {
  k.cyl('#22262a', 0.06, 0.1, h, x, 0, z, 6);
  k.cyl('#22262a', 0.14, 0.2, 0.4, x, 0, z, 6);
  k.glass(true, 0.32, 0.42, 0.32, x, h, z, '#f6e7c0');
  k.cone('#22262a', 0.3, 0.3, x, h + 0.42, z, 4, Math.PI / 4);
}

export function bench(k: Kit, x: number, z: number, ry = 0): void {
  k.at(x, z, ry, () => {
    k.box('#8a6a45', 1.8, 0.08, 0.45, 0, 0.45, 0);
    k.box('#8a6a45', 1.8, 0.4, 0.06, 0, 0.55, -0.22);
    k.box('#22262a', 0.06, 0.45, 0.4, -0.8, 0, 0);
    k.box('#22262a', 0.06, 0.45, 0.4, 0.8, 0, 0);
  });
}

/** Line of small pennants hanging between two points with a slight sag. */
export function bunting(k: Kit, a: V3, b: V3, colors: readonly C[], sag = 0.6, n?: number): void {
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const count = n ?? Math.max(3, Math.floor(len / 0.9));
  const pts: V3[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  const ry = -Math.atan2(b[2] - a[2], b[0] - a[0]);
  for (let i = 0; i < count; i++) {
    k.beam('#3a3d42', pts[i], pts[i + 1], 0.03);
    const p = pts[i];
    const q = pts[i + 1];
    const m: V3 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
    // downward-pointing flat pennant
    // The rope is rigid; the pennant hangs from it and flutters.
    const top = m[1] - 0.03;
    k.withWind(WIND.LAUNDRY, (_x, y) => anchorWeight(y, top, top - 0.42), () => {
      k.add('body', new THREE.ConeGeometry(0.22, 0.42, 3), colors[i % colors.length], [m[0], m[1] - 0.24, m[2]], [Math.PI, ry, 0], [1, 1, 0.25]);
    });
  }
}

/** String of light bulbs (lit at night) between two points. */
export function bulbs(k: Kit, a: V3, b: V3, n: number, sag = 0.3): void {
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    k.glass(true, 0.14, 0.14, 0.14, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t) - 0.07, a[2] + (b[2] - a[2]) * t, '#fff1c4');
  }
}

/** Rooftop clutter on a flat roof: AC units, vents, a stair hut. */
export function roofClutter(k: Kit, x: number, z: number, w: number, d: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const px = x + k.range(-w / 2 + 1.2, w / 2 - 1.2);
    const pz = z + k.range(-d / 2 + 1.2, d / 2 - 1.2);
    const t = k.rng();
    if (t < 0.45) k.box('#b8b8b4', k.range(1, 1.8), 0.8, k.range(0.8, 1.2), px, y, pz);
    else if (t < 0.7) k.cyl('#9a9a96', 0.25, 0.25, 0.9, px, y, pz, 6);
    else if (t < 0.85) k.box('#c8c4bb', 2.2, 2.3, 2.0, px, y, pz);
    else k.glass(false, 1.6, 0.3, 1.2, px, y, pz, '#5a6a78');
  }
}

/** Parking bay markings: n bays of width bw and length bl along local x, opening towards +z. */
export function bays(k: Kit, x0: number, z0: number, n: number, bw: number, bl: number, paint: C = '#efeee8'): void {
  for (let i = 0; i <= n; i++) k.box(paint, 0.12, 0.02, bl, x0 + i * bw, 0.04, z0 + bl / 2);
}
