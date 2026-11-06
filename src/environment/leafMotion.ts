// Motion of the leaf particles: falling with wind and flutter, landing on surfaces, resting and fading on the ground.

import { skyEnvironment } from '../config/tuning';
import type { ParticleProfile } from './seasons';
import { FALLING, GROUND, GROUND_Y, INACTIVE, type Leaf, type LeafBounds } from './leafState';
import type { LandingSurfaces } from './leafSurfaces';

const WIND_DRAG = 0.5; // 1/s, how fast a leaf adopts the wind velocity
/** Seconds an autumn leaf lies on the ground before it fades out. */
const LEAF_REST_SECONDS = skyEnvironment.leaves.restS;

/** Moves one leaf by dt seconds: falling (with wind and flutter), landing, or resting on the ground. */
export function stepLeaf(
  leaf: Leaf,
  dt: number,
  wind: { x: number; z: number },
  windSpeed: number,
  profile: ParticleProfile,
  time: number,
  rng: () => number,
  surfaces: LandingSurfaces,
  bounds: LeafBounds,
): void {
  if (leaf.state === INACTIVE) return;

  if (leaf.state === FALLING) {
    // Adopt the wind velocity gradually, add a flutter, then fall.
    const k = Math.min(1, WIND_DRAG * dt);
    leaf.vx += (wind.x * 0.4 - leaf.vx) * k;
    leaf.vz += (wind.z * 0.4 - leaf.vz) * k;
    const p = profile;
    leaf.vy += (-p.fallSpeed - leaf.vy) * Math.min(1, dt * 2);
    const flutter = Math.sin(time * 2.3 + leaf.phase) * p.flutter;
    if (p.airLife > 0) {
      leaf.timer -= dt;
      if (leaf.timer <= 0) {
        leaf.state = INACTIVE;
        return;
      }
    }
    const fromY = leaf.y;
    leaf.x += (leaf.vx + flutter) * dt;
    leaf.z += (leaf.vz + flutter * 0.5) * dt;
    leaf.y += leaf.vy * dt;
    leaf.rot += dt * (1 + windSpeed * 0.2);
    // Land on the highest surface under the leaf (pavement, car roof or road), never below it.
    const top = leaf.y <= surfaces.maxTop ? surfaces.top(leaf.x, leaf.z, fromY) : GROUND_Y;
    if (leaf.y <= top) {
      leaf.y = top;
      if (p.groundLifetime > 0) {
        leaf.state = GROUND;
        // Autumn leaves lie flat for a short fixed time; other kinds keep their seasonal lifetime.
        leaf.timer = p.kind === 'leaf' ? LEAF_REST_SECONDS * (0.9 + 0.2 * rng()) : p.groundLifetime * (0.7 + 0.6 * rng());
      } else {
        leaf.state = INACTIVE;
      }
    }
    keepInBounds(leaf, bounds);
    return;
  }

  if (leaf.state === GROUND) {
    leaf.timer -= dt;
    // Strong gusts slide resting leaves and occasionally lift them again.
    if (windSpeed > 4) {
      leaf.x += wind.x * 0.05 * dt;
      leaf.z += wind.z * 0.05 * dt;
      if (rng() < (dt * 0.15 * (windSpeed - 4)) / 4) {
        leaf.state = FALLING;
        leaf.y = GROUND_Y + 0.5;
        leaf.vy = 1.5;
      }
    }
    if (leaf.timer <= 0) leaf.state = INACTIVE;
  }
}

/** Deactivates a leaf that has drifted outside the bounds. */
export function keepInBounds(leaf: Leaf, bounds: LeafBounds): void {
  const { minX, maxX, minZ, maxZ } = bounds;
  if (leaf.x < minX || leaf.x > maxX || leaf.z < minZ || leaf.z > maxZ) {
    leaf.state = INACTIVE;
  }
}
