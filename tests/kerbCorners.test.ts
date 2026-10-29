// Rounded kerb corners at junctions: the sidewalk itself is rounded (radius KERB_RADIUS), the open corner is
// left out of the sidewalk so the ground shows there, and the tactile bars stay off that open corner.
import { describe, expect, it } from 'vitest';
import { generateCity, type CityLayout } from '../src/city';
import { DEFAULT_SETTINGS } from '../src/store/model';
import { planStreetDecor, type KerbCorner } from '../src/streets/decor';
import { clearOfKerbCorners } from '../src/streets/decorGeometry';
import { courtyardGreeneryFootprint } from '../src/streets/greeneryFootprint';
import { MeshBuilder } from '../src/streets/builder';
import { ASPHALT_TOP, buildSurfaces, KERB_RADIUS, kerbVoidDepth, SIDEWALK_TOP } from '../src/streets/surfaces';

const SEEDS = [1, 7];

function cityOf(seed: number): CityLayout {
  return generateCity({ ...DEFAULT_SETTINGS, seed, townWidth: 217, townDepth: 217 });
}

interface Tri { x: number[]; y: number[]; z: number[] }

function trianglesOf(b: MeshBuilder): Tri[] {
  const g = b.build();
  if (!g) return [];
  const p = g.getAttribute('position');
  const out: Tri[] = [];
  for (let i = 0; i + 2 < p.count; i += 3) {
    out.push({
      x: [p.getX(i), p.getX(i + 1), p.getX(i + 2)],
      y: [p.getY(i), p.getY(i + 1), p.getY(i + 2)],
      z: [p.getZ(i), p.getZ(i + 1), p.getZ(i + 2)],
    });
  }
  g.dispose();
  return out;
}

/** Highest surface height of the sidewalk-level geometry above (x, z), or -Infinity when nothing covers it. */
function heightAt(tris: readonly Tri[], x: number, z: number): number {
  let top = -Infinity;
  for (const t of tris) {
    const s = [0, 1, 2].map((i) => {
      const j = (i + 1) % 3;
      return (t.x[j] - t.x[i]) * (z - t.z[i]) - (t.z[j] - t.z[i]) * (x - t.x[i]);
    });
    const inside = (s[0] >= 0 && s[1] >= 0 && s[2] >= 0) || (s[0] <= 0 && s[1] <= 0 && s[2] <= 0);
    if (!inside) continue;
    // Flat triangles only (the walls have no area in plan view and never cover a sample point).
    const avg = (t.y[0] + t.y[1] + t.y[2]) / 3;
    if (avg > top) top = avg;
  }
  return top;
}

/** World XZ of a local corner point: a runs along the horizontal road from the junction corner, b across it. */
function worldOf(k: KerbCorner, a: number, b: number): [number, number] {
  return [k.x + k.sx * a, k.z + k.sz * b];
}

describe('rounded kerb corners', () => {
  it('exposes the kerb radius and the open-corner depth it implies', () => {
    expect(KERB_RADIUS).toBeGreaterThan(0.3);
    expect(KERB_RADIUS).toBeLessThan(0.8);
    expect(kerbVoidDepth(0)).toBeCloseTo(KERB_RADIUS, 9);
    expect(kerbVoidDepth(KERB_RADIUS)).toBeCloseTo(0, 9);
    // On the arc: distance from the arc centre (R, R) is exactly R.
    const a = 0.2;
    const b = kerbVoidDepth(a);
    expect(Math.hypot(a - KERB_RADIUS, b - KERB_RADIUS)).toBeCloseTo(KERB_RADIUS, 9);
  });

  it('leaves the open corner to the ground and carries the kerb and sidewalk up to the arc', () => {
    for (const seed of SEEDS) {
      const layout = cityOf(seed);
      const plan = planStreetDecor(layout, courtyardGreeneryFootprint(layout));
      expect(plan.kerbCorners.length).toBeGreaterThan(4);
      const surf = new MeshBuilder();
      const overlay = new MeshBuilder();
      buildSurfaces(layout, surf, overlay);
      const tris = trianglesOf(surf);
      for (const k of plan.kerbCorners) {
        // Open corner, outside the arc: nothing above road level (the asphalt underlay may show as a gutter).
        for (const [a, b] of [[0.06, 0.06], [0.02, 0.3], [0.3, 0.03]]) {
          const [x, z] = worldOf(k, a, b);
          expect(heightAt(tris, x, z), `seed ${seed} corner ${k.x},${k.z} open (${a},${b})`).toBeLessThanOrEqual(ASPHALT_TOP + 1e-6);
        }
        // Kerb band on the arc, sidewalk inside it, sidewalk patch beside the kerb, and the strip beyond.
        const covered: [number, number][] = [[0.12, 0.45], [0.4, 0.4], [0.35, 0.8], [1.5, 0.5], [0.8, 0.8]];
        for (const [a, b] of covered) {
          const [x, z] = worldOf(k, a, b);
          expect(heightAt(tris, x, z), `seed ${seed} corner ${k.x},${k.z} covered (${a},${b})`).toBeCloseTo(SIDEWALK_TOP, 6);
        }
      }
    }
  });

  it('keeps every tactile bar off the open corner', () => {
    for (const seed of SEEDS) {
      const layout = cityOf(seed);
      const plan = planStreetDecor(layout, courtyardGreeneryFootprint(layout));
      for (const bar of plan.tactile) {
        const clipped = clearOfKerbCorners(bar, plan.kerbCorners);
        for (let i = 0; i <= 4; i++) {
          for (let j = 0; j <= 4; j++) {
            const x = clipped.minX + ((clipped.maxX - clipped.minX) * i) / 4;
            const z = clipped.minZ + ((clipped.maxZ - clipped.minZ) * j) / 4;
            for (const k of plan.kerbCorners) {
              const a = (x - k.x) * k.sx, b = (z - k.z) * k.sz;
              if (a < 0 || b < 0 || a > KERB_RADIUS || b > KERB_RADIUS) continue;
              expect(Math.hypot(a - KERB_RADIUS, b - KERB_RADIUS)).toBeLessThanOrEqual(KERB_RADIUS + 1e-9);
            }
          }
        }
      }
    }
  });
});
