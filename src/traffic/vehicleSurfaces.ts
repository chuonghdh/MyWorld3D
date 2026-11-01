// Surfaces for falling leaves: an axis-aligned world box per vehicle (roof or bonnet top, the highest point of the model).
// Read-only: does not change how vehicles move or look. Heights are measured once from each variant's geometry.
import type { VehicleRender } from './vehicles';
import type { ParkingSpot } from './parking';
import { VARIANT_FOOTPRINT } from './collision';
import { VARIANTS } from './vehicles/models';

/** Same fields as environment SurfaceBox (structural match): world footprint and top height in metres. */
export interface VehicleSurfaceBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  top: number;
}

let variantTops: number[] | null = null;

/** Top height (max y of the model) per variant, measured once. */
function tops(): number[] {
  if (!variantTops) {
    variantTops = VARIANTS.map((info) => {
      const geo = info.build();
      geo.computeBoundingBox();
      const top = geo.boundingBox ? geo.boundingBox.max.y : 0;
      geo.dispose();
      return top;
    });
  }
  return variantTops;
}

function boxFor(x: number, z: number, heading: number, variant: number, out: VehicleSurfaceBox[]): void {
  const f = VARIANT_FOOTPRINT[variant];
  if (!f) return;
  const hl = f.length / 2;
  const hw = f.width / 2;
  const s = Math.abs(Math.sin(heading));
  const c = Math.abs(Math.cos(heading));
  // Heading 0 faces +Z: forward is (sin, cos). Axis-aligned extent of the rotated rectangle.
  const ex = s * hl + c * hw;
  const ez = c * hl + s * hw;
  out.push({ minX: x - ex, maxX: x + ex, minZ: z - ez, maxZ: z + ez, top: tops()[variant] ?? 0 });
}

/**
 * Boxes for moving vehicles (from getVehicles() records) and parked cars (from TrafficMeshes.vehicles.parked).
 * Returns a new array; pass `out` to reuse one.
 */
export function vehicleSurfaces(
  vehicles: readonly VehicleRender[],
  parked: readonly ParkingSpot[] = [],
  out: VehicleSurfaceBox[] = [],
): VehicleSurfaceBox[] {
  out.length = 0;
  for (const v of vehicles) boxFor(v.position.x, v.position.z, v.heading, v.variant, out);
  for (const p of parked) boxFor(p.x, p.z, p.heading, p.variant, out);
  return out;
}
