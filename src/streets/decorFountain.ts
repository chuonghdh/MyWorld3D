// Street decor planner: the fountain plaza in the best free courtyard, with benches and pigeons.
import type { CityLayout, CourtyardRect } from '../city/layout';
import { GREENERY_CLEARANCE } from './decorTypes';
import type { FountainPlan, GreeneryTriangle, Pigeon } from './decorTypes';

/** Fountain basin and plaza radii (metres). */
export const FOUNTAIN_BASIN_RADIUS = 1.75;
export const FOUNTAIN_PLAZA_RADIUS = 3.4;

/** Distance from (px, pz) to a triangle in XZ (0 when inside). */
export function distanceToTriangle(px: number, pz: number, t: GreeneryTriangle): number {
  const { x, z } = t;
  let pos = 0, neg = 0;
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    const s = (x[j] - x[i]) * (pz - z[i]) - (z[j] - z[i]) * (px - x[i]);
    if (s >= 0) pos++;
    if (s <= 0) neg++;
  }
  if (pos === 3 || neg === 3) return 0;
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    const ex = x[j] - x[i], ez = z[j] - z[i];
    const len2 = ex * ex + ez * ez;
    const k = len2 > 0 ? Math.max(0, Math.min(1, ((px - x[i]) * ex + (pz - z[i]) * ez) / len2)) : 0;
    best = Math.min(best, Math.hypot(px - (x[i] + ex * k), pz - (z[i] + ez * k)));
  }
  return best;
}

/** Courtyards that can hold a fountain plaza, largest first. */
function fountainCourtyards(layout: CityLayout): CourtyardRect[] {
  const need = FOUNTAIN_PLAZA_RADIUS + 0.9;
  return layout.blocks
    .filter((b) => b.courtyard)
    .map((b) => b.courtyard!)
    .map((c) => ({ c, area: (c.maxX - c.minX) * (c.maxZ - c.minZ) }))
    .filter(({ c }) => c.maxX - c.minX >= need * 2 + 1 && c.maxZ - c.minZ >= need * 2 + 1)
    .sort((a, b) => b.area - a.area)
    .map(({ c }) => c);
}

/**
 * Fountain disc reserved before the courtyard greenery is laid out: the tree-free centre of the largest
 * courtyard that can hold a plaza. Uses only courtyards and street trees, never greenery, so greenery
 * can avoid it without a circular dependency. Empty when no courtyard fits.
 */
export function fountainReservations(layout: CityLayout): { x: number; z: number; r: number; reserved: true }[] {
  const need = FOUNTAIN_PLAZA_RADIUS + 0.9;
  const trees = layout.streetTrees.filter((t) => t.setting === 'courtyard');
  for (const c of fountainCourtyards(layout)) {
    const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
    let best: { x: number; z: number; d: number } | null = null;
    for (let x = c.minX + need; x <= c.maxX - need + 1e-6; x += 1) {
      for (let z = c.minZ + need; z <= c.maxZ - need + 1e-6; z += 1) {
        if (trees.some((t) => Math.hypot(t.position.x - x, t.position.z - z) < need)) continue;
        const d = Math.hypot(x - cx, z - cz);
        if (!best || d < best.d) best = { x, z, d };
      }
    }
    if (best) return [{ x: best.x, z: best.z, r: FOUNTAIN_PLAZA_RADIUS + GREENERY_CLEARANCE, reserved: true }];
  }
  return [];
}

export function planFountain(layout: CityLayout, rng: () => number, greenery: readonly GreeneryTriangle[]): FountainPlan | null {
  const need = FOUNTAIN_PLAZA_RADIUS + 0.9;
  const reach = FOUNTAIN_PLAZA_RADIUS + GREENERY_CLEARANCE;
  const trees = layout.streetTrees.filter((t) => t.setting === 'courtyard');
  const ranked = fountainCourtyards(layout).map((c) => ({ c }));

  for (const { c } of ranked) {
    const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
    // Greenery of this courtyard only: its triangles lie inside the courtyard rectangle.
    const local = greenery.filter((t) => {
      const xs = t.x, zs = t.z;
      return Math.max(...xs) >= c.minX - reach && Math.min(...xs) <= c.maxX + reach
        && Math.max(...zs) >= c.minZ - reach && Math.min(...zs) <= c.maxZ + reach;
    });
    let best: { x: number; z: number; d: number } | null = null;
    for (let x = c.minX + need; x <= c.maxX - need + 1e-6; x += 1) {
      for (let z = c.minZ + need; z <= c.maxZ - need + 1e-6; z += 1) {
        if (trees.some((t) => Math.hypot(t.position.x - x, t.position.z - z) < need)) continue;
        if (local.some((t) => distanceToTriangle(x, z, t) < reach)) continue;
        const d = Math.hypot(x - cx, z - cz);
        if (!best || d < best.d) best = { x, z, d };
      }
    }
    if (!best) continue;
    const { x, z } = best;
    const benches = [0, 1].map((k) => {
      const a = k * Math.PI + Math.PI / 4;
      const bx = x + Math.sin(a) * 2.85;
      const bz = z + Math.cos(a) * 2.85;
      return { x: bx, z: bz, facing: Math.atan2(x - bx, z - bz) };
    });
    const pigeons: Pigeon[] = [];
    for (let k = 0; k < 7; k++) {
      const a = rng() * Math.PI * 2;
      const r = 2.1 + rng() * 0.9;
      const yaw = rng() * Math.PI * 2;
      const tint = rng();
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      // Keep birds off the benches.
      if (benches.some((b) => Math.hypot(b.x - px, b.z - pz) < 1.1)) continue;
      pigeons.push({ x: px, z: pz, yaw, tint });
    }
    return { x, z, basinRadius: FOUNTAIN_BASIN_RADIUS, plazaRadius: FOUNTAIN_PLAZA_RADIUS, benches, pigeons };
  }
  return null;
}
