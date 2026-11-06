// Street decor planner: bus stops, kiosks and bike racks on the sidewalk strip, clear of obstacles.
import type { DecorPlan, DecorSolid, SolidKind } from './decorTypes';
import {
  BIKE_RACK_HALF,
  BUS_SIGN_HALF,
  BUS_STOP_HALF,
  DECOR_RATES,
  KIOSK_HALF,
  OBSTACLE_GAP,
  SOLID_EDGE,
  WALK_CLEARANCE,
} from './decorTypes';
import { freeSegments, rectCircleDistance, toWorld } from './decorFrames';
import type { Circle, Frame } from './decorFrames';

export function planSolids(frames: readonly Frame[], obstacles: Circle[], rng: () => number, plan: DecorPlan): void {
  const fits = (s: Pick<DecorSolid, 'x' | 'z' | 'yaw' | 'hx' | 'hz'>): boolean =>
    obstacles.every((c) => rectCircleDistance(s, c) >= c.r + OBSTACLE_GAP);

  for (const f of frames) {
    const avenue = f.road.streetClass === 'avenue';
    const segs = freeSegments(f, frames, SOLID_EDGE);
    for (const side of [-1, 1] as const) {
      // Facing from this sidewalk toward the road (same convention as lamps and benches).
      const yaw = f.vertical ? Math.atan2(-side, 0) : Math.atan2(0, -side);
      for (const seg of segs) {
        // Fixed number of draws per (road, side, segment) keeps the stream independent of what fits.
        const rBus = rng(), rKiosk = rng(), rRack = rng(), pBus = rng(), pKiosk = rng(), pRack = rng();

        const place = (
          kind: SolidKind,
          half: { hx: number; hz: number },
          lateralFromCurb: number,
          startRoll: number,
        ): DecorSolid | null => {
          const lo = seg.a + half.hx;
          const hi = seg.b - half.hx;
          if (hi < lo) return null;
          const n = Math.floor((hi - lo) / 0.5) + 1;
          const start = Math.floor(startRoll * n);
          for (let k = 0; k < n; k++) {
            const along = lo + ((start + k) % n) * 0.5;
            const p = toWorld(f, along, side * (f.half + lateralFromCurb));
            const cand = { x: p.x, z: p.z, yaw, hx: half.hx, hz: half.hz };
            if (!fits(cand)) continue;
            const solid: DecorSolid = { id: `decor-${kind}-${plan.solids.length}`, kind, ...cand, roadId: f.road.id, side };
            plan.solids.push(solid);
            obstacles.push({ x: solid.x, z: solid.z, r: Math.hypot(half.hx, half.hz) });
            return solid;
          }
          return null;
        };
        /** Centre offset from the curb for a depth-`hz` item pushed against the building side. */
        const backCentre = (hz: number, margin: number): number => f.sw - margin - hz;
        /** Does an item of half depth hz keep the pedestrian line clear when pushed back? */
        const keepsWalkClear = (hz: number, margin: number): boolean =>
          backCentre(hz, margin) - hz >= f.sw / 2 + WALK_CLEARANCE;

        if (avenue && rBus < DECOR_RATES.busStop && keepsWalkClear(BUS_STOP_HALF.hz, 0.12)) {
          const stop = place('busStop', BUS_STOP_HALF, backCentre(BUS_STOP_HALF.hz, 0.12), pBus);
          if (stop) {
            // Sign pole at the curb, a little beyond the shelter along the road (either end that fits).
            for (const dir of [1, -1]) {
              const along = (f.vertical ? stop.z : stop.x) + dir * (BUS_STOP_HALF.hx + 1.2);
              const p = toWorld(f, along, side * (f.half + 0.5));
              const cand = { x: p.x, z: p.z, yaw, hx: BUS_SIGN_HALF.hx, hz: BUS_SIGN_HALF.hz };
              if (along < seg.a || along > seg.b || !fits(cand)) continue;
              plan.solids.push({ id: `decor-busSign-${plan.solids.length}`, kind: 'busSign', ...cand, roadId: f.road.id, side });
              obstacles.push({ x: cand.x, z: cand.z, r: 0.3 });
              break;
            }
          }
        }
        if (avenue && rKiosk < DECOR_RATES.kiosk && keepsWalkClear(KIOSK_HALF.hz, 0.12)) {
          place('kiosk', KIOSK_HALF, backCentre(KIOSK_HALF.hz, 0.12), pKiosk);
        }
        const rackRate = avenue ? DECOR_RATES.rackAvenue : DECOR_RATES.rackStreet;
        if (rRack < rackRate && keepsWalkClear(BIKE_RACK_HALF.hz, 0.15)) {
          place('bikeRack', BIKE_RACK_HALF, backCentre(BIKE_RACK_HALF.hz, 0.15), pRack);
        }
      }
    }
  }
}
