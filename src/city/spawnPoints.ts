// Spawn points along a traffic path, scaled by the traffic multiplier. Pure.
import { cityStreets } from '../config/tuning';
import type { Vec2 } from '../core/types';

const TRAFFIC_SPAWN_SPACING = cityStreets.trafficSpawnSpacing; // metres of path per spawn point at trafficMultiplier = 1

function polylineLength(points: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
}

/** Evenly spaced spawn points along a path; count scales with trafficMultiplier. */
export function spawnPointsFor(waypoints: readonly Vec2[], trafficMultiplier: number): Vec2[] {
  const length = polylineLength(waypoints);
  const count = Math.max(0, Math.round((trafficMultiplier * length) / TRAFFIC_SPAWN_SPACING));
  if (count === 0 || waypoints.length < 2) return [];

  const spawns: Vec2[] = [];
  for (let k = 0; k < count; k++) {
    const target = (k / count) * length;
    let walked = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const a = waypoints[i - 1];
      const b = waypoints[i];
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      if (target <= walked + segLen || i === waypoints.length - 1) {
        const t = segLen > 0 ? Math.min(1, (target - walked) / segLen) : 0;
        spawns.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
        break;
      }
      walked += segLen;
    }
  }
  return spawns;
}
