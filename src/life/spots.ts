// Deterministic placement spots derived from the city layout: sidewalks, plazas, courtyards, roof edges.
// Built once per layout with a seeded RNG (never Math.random).

import type { CityLayout, Lot } from '../city/layout';

export interface SpotSet {
  n: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  /** Preferred facing (radians, 0 = +Z). */
  face: Float32Array;
}

function makeSet(list: number[][]): SpotSet {
  const n = list.length;
  const s: SpotSet = { n, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), face: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    s.x[i] = list[i][0];
    s.y[i] = list[i][1];
    s.z[i] = list[i][2];
    s.face[i] = list[i][3];
  }
  return s;
}

/** Estimated roof height of a lot from its floor count. */
export function roofHeight(lot: Lot): number {
  return 3.6 + (lot.floors - 1) * 3.1;
}

const CURB = 0.15;

function inIntersection(layout: CityLayout, x: number, z: number, pad: number): boolean {
  for (const it of layout.intersections) {
    if (Math.abs(x - it.center.x) < it.sizeX / 2 + pad && Math.abs(z - it.center.z) < it.sizeZ / 2 + pad) return true;
  }
  return false;
}

function inBounds(layout: CityLayout, x: number, z: number, m: number): boolean {
  const b = layout.townBounds;
  return x > b.minX + m && x < b.maxX - m && z > b.minZ + m && z < b.maxZ - m;
}

/** Random sidewalk points (centre of the pavement strip, on either side of a random road). */
export function sidewalkSpots(layout: CityLayout, rng: () => number, count: number): number[][] {
  const out: number[][] = [];
  if (layout.roads.length === 0) return out;
  let guard = 0;
  while (out.length < count && guard++ < count * 20) {
    const r = layout.roads[Math.floor(rng() * layout.roads.length)];
    const t = rng();
    const side = rng() < 0.5 ? -1 : 1;
    const off = side * (r.width / 2 + r.sidewalkWidth * (0.3 + rng() * 0.4));
    let x: number;
    let z: number;
    if (r.orientation === 'horizontal') {
      x = r.start.x + (r.end.x - r.start.x) * t;
      z = r.start.z + off;
    } else {
      x = r.start.x + off;
      z = r.start.z + (r.end.z - r.start.z) * t;
    }
    if (!inBounds(layout, x, z, 2) || inIntersection(layout, x, z, 4)) continue;
    out.push([x, CURB, z, rng() * Math.PI * 2]);
  }
  return out;
}

/** Points around plaza trees, benches and in courtyards. */
export function openSpaceSpots(layout: CityLayout, rng: () => number, count: number): number[][] {
  const out: number[][] = [];
  const anchors: number[][] = [];
  for (const t of layout.streetTrees) if (t.setting !== 'street') anchors.push([t.position.x, t.position.z, 2.5]);
  for (const b of layout.benches) anchors.push([b.position.x, b.position.z, 2.0]);
  const courts = layout.blocks.filter((b) => b.courtyard);
  let guard = 0;
  while (out.length < count && guard++ < count * 10) {
    const pick = rng();
    if (anchors.length > 0 && (pick < 0.55 || courts.length === 0)) {
      const a = anchors[Math.floor(rng() * anchors.length)];
      const ang = rng() * Math.PI * 2;
      const r = 0.8 + rng() * a[2];
      const x = a[0] + Math.sin(ang) * r;
      const z = a[1] + Math.cos(ang) * r;
      if (inBounds(layout, x, z, 2)) out.push([x, 0.04, z, rng() * Math.PI * 2]);
    } else if (courts.length > 0) {
      const c = courts[Math.floor(rng() * courts.length)].courtyard!;
      const x = c.minX + 1 + rng() * Math.max(0.1, c.maxX - c.minX - 2);
      const z = c.minZ + 1 + rng() * Math.max(0.1, c.maxZ - c.minZ - 2);
      out.push([x, 0.04, z, rng() * Math.PI * 2]);
    }
  }
  return out;
}

/** Roof edge perch points: front edge of a random lot at the estimated roof height. */
export function roofSpots(layout: CityLayout, rng: () => number, count: number, minFloors = 1): number[][] {
  const out: number[][] = [];
  const lots = layout.lots.filter((l) => l.floors >= minFloors);
  if (lots.length === 0) return out;
  let guard = 0;
  while (out.length < count && guard++ < count * 6) {
    const lot = lots[Math.floor(rng() * lots.length)];
    const fx = Math.sin(lot.facing);
    const fz = Math.cos(lot.facing);
    const u = (rng() - 0.5) * Math.max(0.5, lot.width - 1.6);
    const inset = lot.depth / 2 - 0.3;
    const x = lot.position.x + fx * inset + fz * u;
    const z = lot.position.z + fz * inset - fx * u;
    // edge runs along the facade: face along it or outwards
    const face = rng() < 0.5 ? lot.facing : lot.facing + (rng() < 0.5 ? 1 : -1) * Math.PI / 2;
    out.push([x, roofHeight(lot) + 0.35, z, face]);
  }
  return out;
}

export function buildSpotSet(list: number[][]): SpotSet {
  return makeSet(list);
}
