// Vehicle footprints and oriented-box overlap tests. Plain maths, no Three.js.
// Footprints match the models in vehicles/models.ts (length along the heading, width across).

/** Length and width in metres per variant index (see vehicles/variants.ts). */
export const VARIANT_FOOTPRINT: readonly { length: number; width: number }[] = [
  { length: 3.95, width: 1.72 }, // hatchback
  { length: 4.65, width: 1.8 }, // sedan
  { length: 4.5, width: 1.88 }, // suv
  { length: 4.3, width: 1.8 }, // microvan
  { length: 4.65, width: 1.8 }, // taxi
  { length: 5.3, width: 2.0 }, // delivery van
  { length: 11.8, width: 2.5 }, // bus
  { length: 8.6, width: 2.3 }, // truck
  { length: 2.0, width: 0.75 }, // scooter with rider
];

/** Oriented box on the ground plane: centre, yaw (0 faces +Z) and half extents. */
export interface Obb {
  x: number;
  z: number;
  heading: number;
  halfLength: number;
  halfWidth: number;
}

/**
 * True when the boxes overlap by more than `slack` metres on every separating axis
 * (so boxes that merely touch, or overlap by less than `slack`, do not count).
 */
export function obbOverlap(a: Obb, b: Obb, slack = 0): boolean {
  const as = Math.sin(a.heading);
  const ac = Math.cos(a.heading);
  const bs = Math.sin(b.heading);
  const bc = Math.cos(b.heading);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  // Axes: the forward and right directions of both boxes.
  for (let k = 0; k < 4; k++) {
    let ax: number;
    let az: number;
    if (k === 0) {
      ax = as;
      az = ac;
    } else if (k === 1) {
      ax = ac;
      az = -as;
    } else if (k === 2) {
      ax = bs;
      az = bc;
    } else {
      ax = bc;
      az = -bs;
    }
    const d = Math.abs(dx * ax + dz * az);
    const ra = a.halfLength * Math.abs(ax * as + az * ac) + a.halfWidth * Math.abs(ax * ac - az * as);
    const rb = b.halfLength * Math.abs(ax * bs + az * bc) + b.halfWidth * Math.abs(ax * bc - az * bs);
    if (d >= ra + rb - slack) return false;
  }
  return true;
}
