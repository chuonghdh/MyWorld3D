// Street decor planner: road decals (manholes, patches, wheel wear, cracks) and tactile bars at crossings.
import type { CityLayout } from '../city/layout';
import { laneOffsetFor } from '../city/generate';
import { KERB_RADIUS } from './surfaces';
import { DECAL_EDGE, ROAD_CELL, TACTILE_BARS } from './decorTypes';
import type { DecorPlan, PatchKind } from './decorTypes';
import { freeSegments, toWorld } from './decorFrames';
import type { Frame } from './decorFrames';

export function planRoadDecals(frames: readonly Frame[], rng: () => number, plan: DecorPlan): void {
  for (const f of frames) {
    const lane0 = laneOffsetFor({ width: f.road.width, cls: f.road.streetClass });
    // Degenerate widths (test fixtures) fall back to the street rule.
    const lane = lane0 >= 1.2 ? lane0 : f.road.width / 4;
    for (const seg of freeSegments(f, frames, DECAL_EDGE)) {
      const cells = Math.floor((seg.b - seg.a) / ROAD_CELL);
      for (let c = 0; c < cells; c++) {
        const mid = seg.a + (c + 0.5) * ((seg.b - seg.a) / cells);
        // Fixed draws per cell.
        const rKind = rng(), rSide = rng(), rJit = rng(), rLen = rng(), rWid = rng(), rShade = rng();
        const sgn = rSide < 0.5 ? -1 : 1;
        const jitter = (rJit - 0.5) * 6;
        const along = mid + jitter;
        const put = (kind: PatchKind, len: number, wid: number, lateral: number) => {
          const p0 = toWorld(f, along - len / 2, lateral - wid / 2);
          const p1 = toWorld(f, along + len / 2, lateral + wid / 2);
          plan.patches.push({
            kind,
            minX: Math.min(p0.x, p1.x), maxX: Math.max(p0.x, p1.x),
            minZ: Math.min(p0.z, p1.z), maxZ: Math.max(p0.z, p1.z),
            roadId: f.road.id,
          });
        };
        if (rKind < 0.26) {
          const p = toWorld(f, along, sgn * lane);
          plan.manholes.push({ x: p.x, z: p.z, roadId: f.road.id });
        } else if (rKind < 0.5) {
          put(rShade < 0.6 ? 'dark' : 'light', 1.2 + rLen * 1.6, 0.9 + rWid * 0.6, sgn * (lane + (rJit - 0.5) * 0.3));
        } else if (rKind < 0.68) {
          // Two wheel tracks of slightly different tone.
          const len = 10 + rLen * 6;
          put('wear', len, 0.4, sgn * (lane - 0.55));
          put('wear', len, 0.4, sgn * (lane + 0.55));
        } else if (rKind < 0.78) {
          put('crack', 2.2 + rLen * 2.4, 0.06 + rWid * 0.04, sgn * (lane + (rJit - 0.5) * 0.8));
        }
      }
    }
  }
}

export function planKerbs(layout: CityLayout, frames: readonly Frame[], plan: DecorPlan): void {
  const vRoads = frames.filter((f) => f.vertical);
  const hRoads = frames.filter((f) => !f.vertical);
  for (const it of layout.intersections) {
    // A grid line can be split into pieces (block merges), so each side is checked against every piece on it.
    const vs = vRoads.filter((f) => Math.abs(f.v - it.center.x) < 0.01);
    const hs = hRoads.filter((f) => Math.abs(f.v - it.center.z) < 0.01);
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        // The corner square exists when both roads continue past the junction on that side.
        let found = false;
        for (const v of vs) {
          for (const h of hs) {
            const reachX = it.center.x + sx * (v.half + v.sw);
            const reachZ = it.center.z + sz * (h.half + h.sw);
            if (reachX >= h.u0 && reachX <= h.u1 && reachZ >= v.u0 && reachZ <= v.u1) found = true;
          }
        }
        if (!found) continue;
        plan.kerbCorners.push({ x: it.center.x + sx * it.sizeX / 2, z: it.center.z + sz * it.sizeZ / 2, sx, sz, r: KERB_RADIUS });
      }
    }
  }
  for (const cw of layout.crosswalks) {
    const walkX = cw.orientation === 'horizontal';
    const across = cw.width - 0.8; // perpendicular to the walking direction
    for (const end of [-1, 1]) {
      for (let k = 0; k < TACTILE_BARS; k++) {
        const d0 = cw.length / 2 + 0.3 + k * 0.2;
        const d1 = d0 + 0.1;
        const a = end > 0 ? d0 : -d1;
        const b = end > 0 ? d1 : -d0;
        plan.tactile.push(
          walkX
            ? { minX: cw.center.x + a, maxX: cw.center.x + b, minZ: cw.center.z - across / 2, maxZ: cw.center.z + across / 2 }
            : { minX: cw.center.x - across / 2, maxX: cw.center.x + across / 2, minZ: cw.center.z + a, maxZ: cw.center.z + b },
        );
      }
    }
  }
}
