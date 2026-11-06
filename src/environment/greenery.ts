// Courtyard greenery: hedges along the edges (with gaps), flower beds with mixed blooms,
// and round bushes. Everything is low-poly with vertex colours, merged into three meshes
// (hedges, flower beds, bushes) sharing one material, whatever the number of courtyards.

import * as THREE from 'three';
import type { CourtyardRect, Rect } from '../city/layout';
import { createRng } from '../core/rng';
import type { Season } from '../core/types';
import { TriBuilder } from './forest';
import { attachCloudShade } from './cloudShade';
import { applySeasonPaint, createPaintState, type PaintState } from './seasonalPaint';
import { buildParkYard, isParkYard, planParkYard, type ParkObstacle } from './parkYard';
import { HEDGE_INSET, HEDGE_WIDTH, addBush, addFlowerBed, addHedge, range } from './greeneryPieces';

export { addHedge, addFlowerBed } from './greeneryPieces';

interface Placed {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Distance from point (px, pz) to segment (ax, az)-(bx, bz). */
function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

const overlaps = (a: Placed, b: Placed, pad: number) =>
  a.minX - pad < b.maxX && a.maxX + pad > b.minX && a.minZ - pad < b.maxZ && a.maxZ + pad > b.minZ;

/** Stable 32-bit key of a yard from its footprint (rounded to 0.1 m). Independent of list order. */
function yardKey(r: Rect): number {
  return (
    Math.imul(Math.round(r.minX * 10), 73856093) ^
    Math.imul(Math.round(r.minZ * 10), 19349663) ^
    Math.imul(Math.round(r.maxX * 10), 83492791) ^
    Math.imul(Math.round(r.maxZ * 10), 1000003)
  ) >>> 0;
}

/**
 * Hedges, flower beds and bushes for each courtyard. Returns a group of three merged meshes
 * ('greenery-hedges', 'greenery-beds', 'greenery-bushes') sharing one vertex-colour material.
 * Ground level is y = 0.
 *
 * Courtyards flagged `merged` (the shared yard of a merged block, see parkYard.ts `isParkYard`) are laid out as one park:
 * groves of small trees, bushes, beds along the paths, a sitting spot and hedges along the rear lots. Smaller
 * courtyards keep the original recipe unchanged. `obstacles` (optional) are circles to keep clear in parks, e.g. the
 * city's own courtyard trees.
 */
export function createCourtyardGreenery(
  courtyards: readonly CourtyardRect[],
  seed: number,
  obstacles: readonly ParkObstacle[] = [],
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'courtyard-greenery';
  const hedges = new TriBuilder();
  const beds = new TriBuilder();
  const bushes = new TriBuilder();
  const crowns = new TriBuilder();

  courtyards.forEach((r) => {
    // Stable per-yard key from its footprint, not its list index: a merge elsewhere in the list must not reshuffle this yard.
    const key = yardKey(r);
    const rng = createRng((Math.imul(seed, 7919) ^ Math.imul(key, 104729) ^ 17) >>> 0);
    const w = r.maxX - r.minX;
    const d = r.maxZ - r.minZ;
    if (w < 3 || d < 3) return;
    if (isParkYard(r)) {
      // Own stream keyed by the yard's position, so the park does not depend on the courtyard order.
      const parkSeed = ((seed * 7919) ^ Math.imul(Math.round(r.minX * 10), 73856093) ^ Math.imul(Math.round(r.minZ * 10), 19349663) ^ 0x5bd1e995) >>> 0;
      const prng = createRng(parkSeed);
      const inside = obstacles.filter((o) => o.x > r.minX && o.x < r.maxX && o.z > r.minZ && o.z < r.maxZ);
      const plan = planParkYard(r, prng, inside);
      buildParkYard(
        plan,
        { hedges, beds, bushes, crowns },
        {
          hedge: (b, x0, z0, x1, z1, s) => addHedge(b, prng, x0, z0, x1, z1, s),
          bed: (b, cx, cz, bw, bd) => addFlowerBed(b, prng, cx, cz, bw, bd),
          bush: (b, x, z, size, s) => addBush(b, prng, x, z, s, size),
        },
        prng,
        parkSeed,
      );
      return;
    }
    const placed: Placed[] = [];
    // Reserved discs (the fountain plaza) touching this yard: bounding boxes for beds and bushes, a distance test for
    // hedge runs. Other obstacles (courtyard trees) are not respected by small yards; that keeps their layout unchanged.
    const near = obstacles.filter(
      (o) => o.reserved === true && o.x + o.r > r.minX && o.x - o.r < r.maxX && o.z + o.r > r.minZ && o.z - o.r < r.maxZ,
    );
    for (const o of near) placed.push({ minX: o.x - o.r, maxX: o.x + o.r, minZ: o.z - o.r, maxZ: o.z + o.r });
    const hitsObstacle = (ax: number, az: number, bx: number, bz: number) =>
      near.some((o) => distToSegment(o.x, o.z, ax, az, bx, bz) < o.r + HEDGE_WIDTH / 2);

    // Hedges along the four edges, each run broken by 1.2-2.2 m gaps.
    if (w >= 6 && d >= 6) {
      const x0 = r.minX + HEDGE_INSET + HEDGE_WIDTH / 2;
      const x1 = r.maxX - HEDGE_INSET - HEDGE_WIDTH / 2;
      const z0 = r.minZ + HEDGE_INSET + HEDGE_WIDTH / 2;
      const z1 = r.maxZ - HEDGE_INSET - HEDGE_WIDTH / 2;
      const runs: [number, number, number, number][] = [
        [x0 - HEDGE_WIDTH / 2, z0, x1 + HEDGE_WIDTH / 2, z0],
        [x0 - HEDGE_WIDTH / 2, z1, x1 + HEDGE_WIDTH / 2, z1],
        [x0, z0 + HEDGE_WIDTH / 2, x0, z1 - HEDGE_WIDTH / 2],
        [x1, z0 + HEDGE_WIDTH / 2, x1, z1 - HEDGE_WIDTH / 2],
      ];
      runs.forEach(([ax, az, bx, bz], ri) => {
        const len = Math.hypot(bx - ax, bz - az);
        const ux = (bx - ax) / len;
        const uz = (bz - az) / len;
        let s = range(rng, 0, 0.8);
        let k = 0;
        while (s < len - 0.8) {
          const seg = Math.min(range(rng, 3, 6), len - s);
          const [sx0, sz0, sx1, sz1] = [ax + ux * s, az + uz * s, ax + ux * (s + seg), az + uz * (s + seg)];
          if (seg >= 1 && !hitsObstacle(sx0, sz0, sx1, sz1)) {
            addHedge(hedges, rng, sx0, sz0, sx1, sz1, seed + Math.imul(key, 977) + ri * 97 + k++);
          }
          s += seg + range(rng, 1.2, 2.2);
        }
      });
    }

    // Interior area kept clear of the hedges.
    const inner = { minX: r.minX + 2, maxX: r.maxX - 2, minZ: r.minZ + 2, maxZ: r.maxZ - 2 };
    const iw = inner.maxX - inner.minX;
    const id = inner.maxZ - inner.minZ;

    // 2-4 flower beds.
    if (iw >= 3 && id >= 2) {
      const want = 2 + Math.floor(rng() * 3);
      for (let tries = 0, made = 0; made < want && tries < 30; tries++) {
        const bw = Math.min(iw, range(rng, 2, 3.6));
        const bd = Math.min(id, range(rng, 1.1, 1.9));
        const rot = rng() < 0.5;
        const ew = rot ? bd : bw;
        const ed = rot ? bw : bd;
        if (ew > iw || ed > id) continue;
        const cx = range(rng, inner.minX + ew / 2, inner.maxX - ew / 2);
        const cz = range(rng, inner.minZ + ed / 2, inner.maxZ - ed / 2);
        const box = { minX: cx - ew / 2, maxX: cx + ew / 2, minZ: cz - ed / 2, maxZ: cz + ed / 2 };
        if (placed.some((p) => overlaps(p, box, 1.2))) continue;
        placed.push(box);
        addFlowerBed(beds, rng, cx, cz, ew, ed);
        made++;
      }
    }

    // A few round bushes, preferably near the corners of the courtyard.
    const nb = 3 + Math.floor(rng() * 3);
    for (let tries = 0, made = 0; made < nb && tries < 30; tries++) {
      const nearCorner = rng() < 0.6;
      const span = (lo: number, hi: number) =>
        nearCorner
          ? rng() < 0.5
            ? range(rng, lo, lo + 1.2)
            : range(rng, hi - 1.2, hi)
          : range(rng, lo, hi);
      const x = span(r.minX + 1.8, r.maxX - 1.8);
      const z = span(r.minZ + 1.8, r.maxZ - 1.8);
      const box = { minX: x - 0.9, maxX: x + 0.9, minZ: z - 0.9, maxZ: z + 0.9 };
      if (placed.some((p) => overlaps(p, box, 0.3))) continue;
      placed.push(box);
      addBush(bushes, rng, x, z, seed + Math.imul(key, 31) + made * 7);
      made++;
    }
  });

  const material = attachCloudShade(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }));
  const states = new Map<THREE.Mesh, PaintState>();
  const parts: [TriBuilder, string][] = [
    [hedges, 'greenery-hedges'],
    [beds, 'greenery-beds'],
    [bushes, 'greenery-bushes'],
    [crowns, 'greenery-crowns'],
  ];
  let crownMesh: THREE.Mesh | null = null;
  for (const [builder, name] of parts) {
    if (builder.triangleCount === 0) continue;
    const mesh = new THREE.Mesh(builder.build(), material);
    if (name === 'greenery-crowns') crownMesh = mesh;
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    states.set(mesh, createPaintState(mesh.geometry, new Float32Array(builder.tags)));
  }
  /** Recolours hedges, bush leaves and blooms for a season (summer is the built-in look). */
  group.userData.setSeason = (season: Season) => {
    for (const [mesh, state] of states) applySeasonPaint(mesh.geometry, state, season);
    // Broadleaf park crowns drop their leaves in winter; the bare trunks stay.
    if (crownMesh) crownMesh.visible = season !== 'winter';
  };
  return group;
}

/** Seasonal recolour of a group made by createCourtyardGreenery. */
export function setGreenerySeason(group: THREE.Group, season: Season): void {
  (group.userData.setSeason as ((s: Season) => void) | undefined)?.(season);
}
