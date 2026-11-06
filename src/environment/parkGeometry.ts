// Park greenery geometry: builds the triangles of a park plan (trees, benches, sandbox) into the greenery builders.
// The plan itself is in parkYard.ts.

import * as THREE from 'three';
import { makeWarp, TriBuilder } from './forest';
import type { ParkBox, ParkPlan, ParkTree } from './parkYard';
import { TAG_EVERGREEN, TAG_FIXED, TAG_FOLIAGE } from './seasonalPaint';

const range = (rng: () => number, lo: number, hi: number) => lo + (hi - lo) * rng();

// ---- Geometry ---------------------------------------------------------------------------------------------------

const BOX = new THREE.BoxGeometry(1, 1, 1);
const BLOB = new THREE.IcosahedronGeometry(1, 1);
const CONE = new THREE.ConeGeometry(1, 1, 7, 1);

const BARK = new THREE.Color('#5b4332');
const WOOD = new THREE.Color('#9a6b42');
const IRON = new THREE.Color('#3a3d40');
const SAND = new THREE.Color('#e3cf9c');
const STONE = new THREE.Color('#cbbfa8');
const ROUND_TONES = ['#4f8a36', '#5f9a3e', '#3f7a30', '#6c9a3a'].map((h) => new THREE.Color(h));
const CONIFER_TONES = ['#2c5a30', '#335f38', '#284f2c'].map((h) => new THREE.Color(h));
const COLUMN_TONES = ['#4a7d34', '#567f2e'].map((h) => new THREE.Color(h));

function compose(x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
    new THREE.Vector3(sx, sy, sz),
  );
}

function tone(base: THREE.Color, normal: THREE.Vector3, rng: () => number, out: THREE.Color): THREE.Color {
  return out.copy(base).multiplyScalar((0.85 + 0.25 * normal.y) * range(rng, 0.93, 1.07));
}

/** Broadleaf crowns go to `crowns` (hidden in winter); trunks and conifers stay in `b` (conifers keep their green). */
function addTree(b: TriBuilder, t: ParkTree, rng: () => number, seed: number, crowns: TriBuilder): void {
  const c = new THREE.Color();
  const s = t.size;
  const yaw = rng() * Math.PI * 2;
  b.tag = TAG_FIXED;
  const trunkH = t.kind === 'conifer' ? 0.9 * s : t.kind === 'column' ? 1.1 * s : 1.7 * s;
  const trunkW = (t.kind === 'round' ? 0.24 : 0.18) * s;
  // The trunk starts a little below the lawn so its base never sits on the lawn plane.
  b.add(BOX, compose(t.x, trunkH / 2 - 0.05, t.z, trunkW, trunkH + 0.1, trunkW, yaw), (_f, _c, n) => tone(BARK, n, rng, c));
  if (t.kind === 'round') {
    const base = ROUND_TONES[Math.floor(rng() * ROUND_TONES.length)];
    crowns.tag = TAG_FOLIAGE;
    const blobs = 3;
    for (let i = 0; i < blobs; i++) {
      const rr = s * (i === 0 ? 1.15 : range(rng, 0.7, 0.9));
      const a = yaw + (i * Math.PI * 2) / 3;
      const off = i === 0 ? 0 : s * 0.55;
      const x = t.x + Math.cos(a) * off;
      const z = t.z + Math.sin(a) * off;
      const y = trunkH + rr * (i === 0 ? 0.75 : 0.55);
      const top = trunkH + 2.2 * s;
      crowns.add(
        BLOB,
        compose(x, y, z, rr, rr * 0.9, rr, yaw + i),
        (_f, centroid, n) => tone(base, n, rng, c).multiplyScalar(0.75 + 0.35 * Math.min(1, (centroid.y - trunkH) / (top - trunkH))),
        makeWarp(seed + i * 53, rr * 0.13),
      );
    }
  } else if (t.kind === 'conifer') {
    const base = CONIFER_TONES[Math.floor(rng() * CONIFER_TONES.length)];
    b.tag = TAG_EVERGREEN;
    const tiers = 3;
    for (let i = 0; i < tiers; i++) {
      const rad = s * (1.05 - i * 0.27);
      const h = s * (1.5 - i * 0.2);
      const y = trunkH * 0.8 + i * s * 0.85 + h / 2;
      b.add(CONE, compose(t.x, y, t.z, rad, h, rad, yaw + i * 0.7), (_f, _c, n) => tone(base, n, rng, c));
    }
  } else {
    const base = COLUMN_TONES[Math.floor(rng() * COLUMN_TONES.length)];
    crowns.tag = TAG_FOLIAGE;
    const rr = 0.72 * s;
    crowns.add(
      BLOB,
      compose(t.x, trunkH + 1.9 * s, t.z, rr, 2.2 * s, rr, yaw),
      (_f, centroid, n) => tone(base, n, rng, c).multiplyScalar(0.8 + 0.25 * Math.min(1, (centroid.y - trunkH) / (4 * s))),
      makeWarp(seed + 7, rr * 0.12),
    );
  }
}

function addBench(b: TriBuilder, x: number, z: number, yaw: number, rng: () => number): void {
  const c = new THREE.Color();
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  // Local (lx, lz) to world, the seat faces local +z.
  const at = (lx: number, lz: number): [number, number] => [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
  b.tag = TAG_FIXED;
  for (const lx of [-0.75, 0.75]) {
    const [px, pz] = at(lx, 0);
    b.add(BOX, compose(px, 0.21, pz, 0.08, 0.46, 0.4, yaw), (_f, _c, n) => tone(IRON, n, rng, c));
  }
  const [sx, sz] = at(0, 0);
  b.add(BOX, compose(sx, 0.45, sz, 1.7, 0.06, 0.42, yaw), (_f, _c, n) => tone(WOOD, n, rng, c));
  // Legs reach into the seat and the backrest into the seat edge, so no faces meet in one plane.
  const [bx, bz] = at(0, -0.17);
  b.add(BOX, compose(bx, 0.685, bz, 1.66, 0.43, 0.05, yaw), (_f, _c, n) => tone(WOOD, n, rng, c));
}

function addSandbox(b: TriBuilder, p: ParkBox, rng: () => number): void {
  const c = new THREE.Color();
  b.tag = TAG_FIXED;
  const t = 0.18;
  const h = 0.24;
  // Four frame planks (abutting, never overlapping) and the sand a little below the frame top.
  b.add(BOX, compose(p.cx, h / 2, p.cz - p.d / 2 + t / 2, p.w, h, t), (_f, _c, n) => tone(STONE, n, rng, c));
  b.add(BOX, compose(p.cx, h / 2, p.cz + p.d / 2 - t / 2, p.w, h, t), (_f, _c, n) => tone(STONE, n, rng, c));
  // Side planks a hair shorter, and the sand a hair narrower, so no two faces share a plane.
  b.add(BOX, compose(p.cx - p.w / 2 + t / 2, h / 2 - 0.004, p.cz, t - 0.01, h - 0.008, p.d - 2 * t - 0.01), (_f, _c, n) => tone(STONE, n, rng, c));
  b.add(BOX, compose(p.cx + p.w / 2 - t / 2, h / 2 - 0.004, p.cz, t - 0.01, h - 0.008, p.d - 2 * t - 0.01), (_f, _c, n) => tone(STONE, n, rng, c));
  b.add(BOX, compose(p.cx, 0.075, p.cz, p.w - 2 * t - 0.03, 0.17, p.d - 2 * t - 0.03), (_f, _c, n) => tone(SAND, n, rng, c));
}

export interface ParkBuilders {
  hedges: TriBuilder;
  beds: TriBuilder;
  bushes: TriBuilder;
  /** Broadleaf park crowns: a separate mesh so winter can hide them (bare trunks stay). */
  crowns: TriBuilder;
}

/** Callbacks into greenery.ts for the pieces shared with small courtyards. */
export interface ParkPieces {
  hedge: (b: TriBuilder, x0: number, z0: number, x1: number, z1: number, seed: number) => void;
  bed: (b: TriBuilder, cx: number, cz: number, w: number, d: number) => void;
  bush: (b: TriBuilder, x: number, z: number, size: number, seed: number) => void;
}

/** Adds the triangles of a park plan to the greenery builders. */
export function buildParkYard(plan: ParkPlan, out: ParkBuilders, pieces: ParkPieces, rng: () => number, seed: number): void {
  plan.hedges.forEach(([ax, az, bx, bz], i) => pieces.hedge(out.hedges, ax, az, bx, bz, seed + i * 97));
  for (const bed of plan.beds) pieces.bed(out.beds, bed.cx, bed.cz, bed.w, bed.d);
  plan.trees.forEach((t, i) => addTree(out.bushes, t, rng, seed + i * 131, out.crowns));
  plan.bushes.forEach((bu, i) => pieces.bush(out.bushes, bu.x, bu.z, bu.size, seed + 5000 + i * 7));
  if (plan.play) addSandbox(out.beds, plan.play, rng);
  for (const bench of plan.benches) addBench(out.beds, bench.x, bench.z, bench.yaw, rng);
}
