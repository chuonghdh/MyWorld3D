// Tree geometry: leaf islands, thinning per season, cluster copies, foliage split and snow caps.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRng } from '../core/rng';
import { hashString } from '../environment/forest';
import { cityStreets } from '../config/tuning';
import type { NatureAsset } from './natureTypes';

/** Leaf islands: triangle indices grouped by shared vertex index (union-find). */
export function leafIslands(geo: THREE.BufferGeometry): number[][] {
  const vcount = geo.getAttribute('position').count;
  const idx = geo.index ? geo.index.array : null;
  const tcount = (idx ? idx.length : vcount) / 3;
  const v = (t: number, k: number) => (idx ? idx[3 * t + k] : 3 * t + k);
  const parent = new Int32Array(vcount);
  for (let i = 0; i < vcount; i++) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let t = 0; t < tcount; t++) {
    const ra = find(v(t, 0));
    const rb = find(v(t, 1));
    if (rb !== ra) parent[rb] = ra;
    const rc = find(v(t, 2));
    const rr = find(ra);
    if (rc !== rr) parent[rc] = rr;
  }
  const byRoot = new Map<number, number[]>();
  for (let t = 0; t < tcount; t++) {
    const r = find(v(t, 0));
    const list = byRoot.get(r);
    if (list) list.push(t);
    else byRoot.set(r, [t]);
  }
  return [...byRoot.values()];
}

/** Non-indexed copy of the given triangles, all attributes kept. */
/** share of broadleaf leaf clusters that get a rotated copy (more clusters, more triangles). */
export const CLUSTER_EXTRA = cityStreets.clusterExtra;
/** rotation (rad) of the copied clusters around the trunk axis. */
const CLUSTER_TURN = (15 * Math.PI) / 180;
/** height (m) the copied clusters drop, so they sit lower in the crown. */
const CLUSTER_DROP = 0.7;

/**
 * Adds rotated copies of every second leaf cluster (island) around the trunk axis, so crowns read denser.
 * Copies are separate islands (own vertices) with their own index, so thinning and variety work as for the originals.
 * Conifers are returned unchanged.
 */
export function addLeafClusters(leaves: THREE.BufferGeometry, conifer: boolean): THREE.BufferGeometry {
  if (conifer || !leaves.index) return leaves;
  const pos = leaves.getAttribute('position');
  const idx = leaves.index.array;
  const islands = leafIslands(leaves);
  const picked = islands.filter((_, i) => i % Math.round(1 / CLUSTER_EXTRA) === 0);
  const tris = picked.flat();
  if (tris.length === 0) return leaves;
  let ax = 0;
  let az = 0;
  for (let i = 0; i < pos.count; i++) {
    ax += pos.getX(i);
    az += pos.getZ(i);
  }
  ax /= pos.count;
  az /= pos.count;
  const copy = leaves.clone();
  const cp = copy.getAttribute('position');
  const c = Math.cos(CLUSTER_TURN);
  const s = Math.sin(CLUSTER_TURN);
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i) - ax;
    const z = cp.getZ(i) - az;
    cp.setXYZ(i, ax + x * c - z * s, cp.getY(i) - CLUSTER_DROP, az + x * s + z * c);
  }
  cp.needsUpdate = true;
  const index = new Uint32Array(tris.length * 3);
  tris.forEach((t, n) => {
    for (let k = 0; k < 3; k++) index[3 * n + k] = idx[3 * t + k];
  });
  copy.setIndex(new THREE.BufferAttribute(index, 1));
  const merged = mergeGeometries([leaves, copy], false);
  return merged ?? leaves;
}

function subsetGeometry(src: THREE.BufferGeometry, tris: number[]): THREE.BufferGeometry {
  const idx = src.index ? src.index.array : null;
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    const a = src.getAttribute(name);
    const arr = new Float32Array(tris.length * 3 * a.itemSize);
    tris.forEach((t, ti) => {
      for (let k = 0; k < 3; k++) {
        const vi = idx ? idx[3 * t + k] : 3 * t + k;
        for (let c = 0; c < a.itemSize; c++) arr[(ti * 3 + k) * a.itemSize + c] = a.array[vi * a.itemSize + c];
      }
    });
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  out.computeBoundingSphere();
  return out;
}

/**
 * Leaves kept at a density: a seeded shuffle of the islands (seed from the type file), the first round(n * density)
 * kept. Same order for every season, so spring and autumn are subsets of summer. Null when density is 0.
 */
export function thinnedLeaves(asset: NatureAsset, density: number): THREE.BufferGeometry | null {
  if (density <= 0) return null;
  if (density >= 1) return asset.leaves;
  const rng = createRng(hashString(asset.type.file) >>> 0);
  const order = asset.islands.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const kept = order.slice(0, Math.round(order.length * density));
  return subsetGeometry(asset.leaves, kept.flatMap((i) => asset.islands[i]).sort((a, b) => a - b));
}

/** Bark islands that do not touch the trunk and start above this height are foliage clusters, not wood. */
export const FOLIAGE_MIN_Y = 2.5;

/** Bounding box of an island's vertices (metres). */
function islandBox(tris: number[], pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, idx: ArrayLike<number>): { size: number[]; count: number } {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const seen = new Set<number>();
  for (const t of tris) {
    for (let k = 0; k < 3; k++) {
      const v = idx[3 * t + k];
      if (seen.has(v)) continue;
      seen.add(v);
      const p = [pos.getX(v), pos.getY(v), pos.getZ(v)];
      for (let c = 0; c < 3; c++) {
        lo[c] = Math.min(lo[c], p[c]);
        hi[c] = Math.max(hi[c], p[c]);
      }
    }
  }
  return { size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], count: seen.size };
}

/** A compact clump (not a twig or a sheet): every side at most 3 m, shortest side at least 40% of the longest, 30+ vertices. */
function isCluster(box: { size: number[]; count: number }): boolean {
  const max = Math.max(...box.size);
  const min = Math.min(...box.size);
  return box.count >= 30 && max <= 3 && min >= 0.4 * max;
}

/**
 * The Quaternius "Bark" primitives also carry crown clusters: floating islands high in the crown that are
 * not joined to the trunk. They move to the leaf geometry, so winter hides them with the leaves and the trunk
 * and connected branches stay. Indexed input only; returns the bark unchanged when there is nothing to move.
 */
export function splitFoliage(bark: THREE.BufferGeometry): { bark: THREE.BufferGeometry; foliage: THREE.BufferGeometry | null } {
  if (!bark.index) return { bark, foliage: null };
  const pos = bark.getAttribute('position');
  const idx = bark.index.array;
  const islands = leafIslands(bark);
  let trunk = -1;
  let trunkY = Infinity;
  const minY = islands.map((tris, i) => {
    let y = Infinity;
    for (const t of tris) for (let k = 0; k < 3; k++) y = Math.min(y, pos.getY(idx[3 * t + k]));
    if (y < trunkY) {
      trunkY = y;
      trunk = i;
    }
    return y;
  });
  const foliageTris: number[] = [];
  const woodTris: number[] = [];
  islands.forEach((tris, i) => {
    if (i !== trunk && minY[i] >= FOLIAGE_MIN_Y && isCluster(islandBox(tris, pos, idx))) foliageTris.push(...tris);
    else woodTris.push(...tris);
  });
  if (foliageTris.length === 0) return { bark, foliage: null };
  const withIndex = (tris: number[]): THREE.BufferGeometry => {
    const g = bark.clone();
    const index = new Uint32Array(tris.length * 3);
    tris.forEach((t, n) => {
      for (let k = 0; k < 3; k++) index[3 * n + k] = idx[3 * t + k];
    });
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeBoundingSphere();
    return g;
  };
  return { bark: withIndex(woodTris), foliage: withIndex(foliageTris) };
}

/**
 * Snow caps: the triangles of `geo` that face up (normal.y above minUp), pushed out by `lift` along their normal so
 * they never sit on the surface they cover. Returns null when no face is up.
 */
export function snowCap(geo: THREE.BufferGeometry, minUp = 0.5, lift = 0.05): THREE.BufferGeometry | null {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const pos = src.getAttribute('position');
  const out: number[] = [];
  const uvAttr = src.getAttribute('uv');
  const uvOut: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const e = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(b, a).cross(e.subVectors(c, a)).normalize();
    if (n.y < minUp) continue;
    for (const v of [a, b, c]) out.push(v.x + n.x * lift, v.y + n.y * lift, v.z + n.z * lift);
    if (uvAttr) for (let k = 0; k < 3; k++) uvOut.push(uvAttr.getX(i + k), uvAttr.getY(i + k));
  }
  if (src !== geo) src.dispose();
  if (out.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  if (uvAttr) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvOut, 2));
  g.computeBoundingSphere();
  return g;
}
