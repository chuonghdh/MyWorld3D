// Geometry for the decor plan (see decor.ts): written into the existing streetscape builders so the
// new families cost no extra draw calls, except the two translucent layers (shelter glass, fountain water).
//
// Layering (no coplanar faces): road decals sit at PAINT_Y, which is clear of the lane markings by
// construction; sidewalk decals sit at SIDEWALK_OVERLAY_Y (paving slabs, beyond tree pits and the
// furniture band) or 6 mm above it (tactile bars, where they touch the band). Rounded kerb corners are
// part of the sidewalk surfaces (surfaces.ts), not decals.

import * as THREE from 'three';
import { MeshBuilder } from './builder';
import { kerbVoidDepth, PAINT_Y, SIDEWALK_OVERLAY_Y, SIDEWALK_TOP } from './surfaces';
import type { DecorPlan, DecorSolid, FountainPlan, KerbCorner, TactileBar } from './decor';

export const DECOR_COLORS = {
  iron: '#22262a',
  metal: '#7b8289',
  wood: '#9a6b43',
  roof: '#2f5d62',
  signBlue: '#2a5fa8',
  signWhite: '#f0f0ea',
  board: '#2a4a6a',
  stone: '#bdb5a3',
  lip: '#d3ccbb',
  basinFloor: '#6f8890',
  jet: '#dcecf2',
  plazaA: '#d9cfbd',
  plazaB: '#c9bda6',
  plazaBorder: '#b9ab92',
  tactile: '#c9a640',
  manhole: '#2a2a2e',
  manholeRim: '#66666b',
  patchDark: '#3a3a40',
  patchLight: '#5a5a61',
  wear: '#434349',
  crack: '#2b2b30',
  slabDark: '#d3ccbd',
  slabLight: '#e6dfd2',
} as const;

const KIOSK_BODY = ['#2f6a55', '#2d4a6b', '#7a2f3a'] as const;
const PIGEON_COLORS = ['#8d9096', '#6c7078', '#d6d6d6', '#4a4b50', '#a39a8e'] as const;

/** Height of the fountain basin rim above the courtyard ground, and of the water below it. */
export const FOUNTAIN_RIM = 0.65;
export const FOUNTAIN_WATER_Y = SIDEWALK_TOP + 0.35;
export const FOUNTAIN_UPPER_WATER_Y = SIDEWALK_TOP + 1.05;

export interface DecorBuilders {
  iron: MeshBuilder;
  overlay: MeshBuilder;
  glass: MeshBuilder;
  water: MeshBuilder;
}

/** Box placed in a solid's local frame (x along the road, z toward the road). */
function part(b: MeshBuilder, s: Pick<DecorSolid, 'x' | 'z' | 'yaw'>, lx: number, lz: number, y0: number, y1: number, sx: number, sz: number, color: string): void {
  const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
  b.boxRot(s.x + lx * c + lz * sn, s.z - lx * sn + lz * c, SIDEWALK_TOP + y0, SIDEWALK_TOP + y1, sx, sz, s.yaw, color);
}

function buildBusStop(b: DecorBuilders, s: DecorSolid): void {
  const C = DECOR_COLORS;
  // Roof with a small overhang toward the road, four posts, glass back and one glass end.
  part(b.iron, s, 0, 0, 2.38, 2.46, 3.4, 1.5, C.roof);
  for (const lx of [-1.55, 1.55]) for (const lz of [-0.55, 0.55]) part(b.iron, s, lx, lz, 0, 2.38, 0.07, 0.07, C.iron);
  part(b.glass, s, 0, -0.55, 0.25, 2.3, 3.0, 0.03, '#ffffff');
  part(b.glass, s, -1.55, 0, 0.25, 2.3, 0.03, 1.0, '#ffffff');
  // Bench with a metal frame, timetable board on the glass.
  part(b.iron, s, 0, -0.3, 0.45, 0.5, 2.2, 0.36, C.wood);
  for (const lx of [-0.95, 0.95]) part(b.iron, s, lx, -0.3, 0, 0.45, 0.06, 0.3, C.iron);
  part(b.iron, s, 0.45, -0.5, 1.1, 1.85, 0.8, 0.04, C.board);
  part(b.iron, s, -0.55, -0.5, 1.5, 1.85, 0.5, 0.04, '#e8e4d0');
}

function buildBusSign(b: DecorBuilders, s: DecorSolid): void {
  const C = DECOR_COLORS;
  part(b.iron, s, 0, 0, 0, 2.6, 0.06, 0.06, C.iron);
  // Plate faces along the road so approaching buses see it.
  part(b.iron, s, 0, 0, 2.2, 2.68, 0.04, 0.46, C.signBlue);
  part(b.iron, s, 0, 0, 2.38, 2.5, 0.05, 0.3, C.signWhite);
}

function buildKiosk(b: DecorBuilders, s: DecorSolid, variant: number): void {
  const C = DECOR_COLORS;
  const body = KIOSK_BODY[variant % KIOSK_BODY.length];
  part(b.iron, s, 0, -0.05, 0, 0.15, 1.7, 1.3, C.stone);
  part(b.iron, s, 0, -0.1, 0.15, 2.2, 1.6, 1.1, body);
  // Service window, counter shelf, magazine boards.
  part(b.iron, s, 0, 0.455, 1.05, 1.85, 1.1, 0.02, '#1b242b');
  part(b.iron, s, 0, 0.56, 0.98, 1.02, 1.3, 0.2, C.wood);
  const mags = ['#c0392b', '#e0b030', '#2f6ea5', '#e8e0d0'];
  mags.forEach((color, i) => {
    const lx = (i < 2 ? -1 : 1) * (0.62 + (i % 2) * 0.12);
    part(b.iron, s, lx, 0.455, 0.5 + (i % 2) * 0.25, 1.0 + (i % 2) * 0.25, 0.1, 0.02, color);
  });
  // Striped awning (overhead) and a cap roof.
  for (let i = 0; i < 5; i++) {
    part(b.iron, s, -0.72 + i * 0.36, 0.62, 2.1, 2.14, 0.36, 0.5, i % 2 === 0 ? '#b8392c' : '#f1ece0');
  }
  part(b.iron, s, 0, -0.1, 2.2, 2.32, 1.8, 1.4, '#23392f');
  part(b.iron, s, 0, -0.1, 2.32, 2.5, 0.5, 0.5, '#23392f');
}

function buildBikeRack(b: DecorBuilders, s: DecorSolid): void {
  const C = DECOR_COLORS;
  // Four inverted-U hoops, each spanning the depth of the rack.
  for (let i = 0; i < 4; i++) {
    const lx = -1.05 + i * 0.7;
    for (const lz of [-0.3, 0.3]) part(b.iron, s, lx, lz, 0, 0.8, 0.04, 0.04, C.metal);
    part(b.iron, s, lx, 0, 0.78, 0.82, 0.04, 0.64, C.metal);
  }
}

/**
 * A tactile bar may not reach the open corner of a rounded kerb: the part of it that lies in the void is cut
 * back to the kerb arc (the bar is a thin decal, so it stops at the depth where the arc is at its far edge).
 */
export function clearOfKerbCorners(t: TactileBar, corners: readonly KerbCorner[]): TactileBar {
  let { minX, maxX, minZ, maxZ } = t;
  for (const k of corners) {
    const ax0 = Math.min((minX - k.x) * k.sx, (maxX - k.x) * k.sx), ax1 = Math.max((minX - k.x) * k.sx, (maxX - k.x) * k.sx);
    const bz0 = Math.min((minZ - k.z) * k.sz, (maxZ - k.z) * k.sz), bz1 = Math.max((minZ - k.z) * k.sz, (maxZ - k.z) * k.sz);
    // Local corner square [0, r] x [0, r]; the bar must overlap it to matter.
    if (ax1 <= 0 || bz1 <= 0 || ax0 >= k.r || bz0 >= k.r) continue;
    if (ax1 - ax0 <= bz1 - bz0) {
      // Narrow across the carriageway edge: clip the lower edge along b to the arc at the bar's nearest a.
      const lo = kerbVoidDepth(Math.max(ax0, 0), k.r);
      if (k.sz > 0) minZ = Math.max(minZ, k.z + lo);
      else maxZ = Math.min(maxZ, k.z - lo);
    } else {
      // Narrow across the curb face: clip along a to the arc at the bar's nearest b.
      const lo = kerbVoidDepth(Math.max(bz0, 0), k.r);
      if (k.sx > 0) minX = Math.max(minX, k.x + lo);
      else maxX = Math.min(maxX, k.x - lo);
    }
  }
  return { minX, maxX, minZ, maxZ };
}

function buildFountain(b: DecorBuilders, f: FountainPlan, benchSolid: (x: number, z: number, facing: number) => void): void {
  const C = DECOR_COLORS;
  const y0 = SIDEWALK_TOP;
  const py = SIDEWALK_OVERLAY_Y + 0.006;
  // Paved plaza: 16 wedges in two tones with a darker border ring.
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
    b.overlay.annulusSector(f.x, py, f.z, f.basinRadius, f.plazaRadius - 0.2, a0, a1, i % 2 === 0 ? C.plazaA : C.plazaB, 1);
  }
  b.overlay.annulus(f.x, py, f.z, f.plazaRadius - 0.2, f.plazaRadius, C.plazaBorder, 32);
  // Basin: outer wall, inner wall, rim, floor.
  const rimY = y0 + FOUNTAIN_RIM;
  const inner = f.basinRadius - 0.2;
  b.iron.frustum(f.x, f.z, y0, rimY, f.basinRadius, f.basinRadius, C.stone, 28);
  b.iron.frustum(f.x, f.z, y0 + 0.05, rimY, inner, inner, C.stone, 28, true);
  b.iron.annulus(f.x, rimY, f.z, inner, f.basinRadius, C.lip, 28);
  b.iron.annulus(f.x, y0 + 0.05, f.z, 0, inner, C.basinFloor, 24);
  // Pedestal, upper bowl, jet.
  b.iron.frustum(f.x, f.z, y0 + 0.05, y0 + 1.0, 0.24, 0.18, C.lip, 10);
  b.iron.frustum(f.x, f.z, y0 + 0.9, y0 + 1.15, 0.3, 0.85, C.stone, 16);
  b.iron.frustum(f.x, f.z, y0 + 0.95, y0 + 1.15, 0.7, 0.7, C.stone, 16, true);
  b.iron.annulus(f.x, y0 + 1.15, f.z, 0.7, 0.85, C.lip, 16);
  b.iron.annulus(f.x, y0 + 0.95, f.z, 0, 0.7, C.basinFloor, 12);
  b.iron.frustum(f.x, f.z, y0 + 1.1, y0 + 1.9, 0.045, 0.02, C.jet, 6, false, true);
  // Water surfaces (separate translucent mesh).
  b.water.annulus(f.x, FOUNTAIN_WATER_Y, f.z, 0, inner - 0.03, '#ffffff', 28);
  b.water.annulus(f.x, FOUNTAIN_UPPER_WATER_Y, f.z, 0, 0.67, '#ffffff', 16);
  for (const bench of f.benches) benchSolid(bench.x, bench.z, bench.facing);
  // Pigeons: static decor on the paving.
  const sphere = new THREE.SphereGeometry(1, 6, 4);
  const tmp = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  f.pigeons.forEach((p, i) => {
    const color = PIGEON_COLORS[Math.floor(p.tint * PIGEON_COLORS.length) % PIGEON_COLORS.length];
    q.setFromAxisAngle(up, p.yaw);
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const base = py;
    tmp.compose(new THREE.Vector3(p.x, base + 0.1, p.z), q, new THREE.Vector3(0.09, 0.08, 0.15));
    b.iron.geometry(sphere, tmp, color);
    tmp.compose(new THREE.Vector3(p.x + fx * 0.13, base + 0.19, p.z + fz * 0.13), q, new THREE.Vector3(0.045, 0.045, 0.05));
    b.iron.geometry(sphere, tmp, i % 3 === 0 ? '#5d8a6f' : color);
    b.iron.boxRot(p.x - fx * 0.17, p.z - fz * 0.17, base + 0.09, base + 0.12, 0.07, 0.12, p.yaw, color);
    b.iron.boxRot(p.x + fx * 0.18, p.z + fz * 0.18, base + 0.185, base + 0.2, 0.012, 0.03, p.yaw, '#d9a066');
    for (const side of [-1, 1]) {
      b.iron.boxRot(p.x + fz * side * 0.03, p.z - fx * side * 0.03, base, base + 0.05, 0.012, 0.012, p.yaw, '#b2736b');
    }
  });
  sphere.dispose();
}

/** Writes the whole plan into the builders. `bench` draws a bench (shared with the lamp-side benches). */
export function buildDecor(
  plan: DecorPlan,
  b: DecorBuilders,
  bench: (x: number, z: number, facing: number) => void,
): void {
  const C = DECOR_COLORS;
  let kioskIndex = 0;
  for (const s of plan.solids) {
    if (s.kind === 'busStop') buildBusStop(b, s);
    else if (s.kind === 'busSign') buildBusSign(b, s);
    else if (s.kind === 'kiosk') buildKiosk(b, s, kioskIndex++);
    else buildBikeRack(b, s);
  }

  // Road decals.
  for (const p of plan.patches) {
    const color = p.kind === 'dark' ? C.patchDark : p.kind === 'light' ? C.patchLight : p.kind === 'wear' ? C.wear : C.crack;
    b.overlay.rect(PAINT_Y, p.minX, p.maxX, p.minZ, p.maxZ, color);
  }
  for (const m of plan.manholes) {
    b.overlay.annulus(m.x, PAINT_Y, m.z, 0, 0.32, C.manhole, 14);
    b.overlay.annulus(m.x, PAINT_Y, m.z, 0.32, 0.4, C.manholeRim, 14);
  }

  // Sidewalk decals.
  for (const t of plan.paving) {
    b.overlay.rect(SIDEWALK_OVERLAY_Y, t.minX, t.maxX, t.minZ, t.maxZ, t.shade === 'dark' ? C.slabDark : C.slabLight);
  }
  for (const t of plan.tactile) {
    const bar = clearOfKerbCorners(t, plan.kerbCorners);
    b.overlay.rect(SIDEWALK_OVERLAY_Y + 0.006, bar.minX, bar.maxX, bar.minZ, bar.maxZ, C.tactile);
  }

  if (plan.fountain) buildFountain(b, plan.fountain, bench);
}
