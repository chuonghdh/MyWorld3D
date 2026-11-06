// Leaf devils: a swirling vortex that roams the road and lifts nearby leaves into an orbit.

import { CAPTURED, FALLING, GROUND, type Devil, type Leaf, type LeafBounds } from './leafState';

const DEVIL_RADIUS = 5; // m
const DEVIL_HEIGHT = 9; // m, top of the vortex
export const DEVIL_SPEED = 2.2; // m/s, roaming speed of the vortex centre

/** Advance a devil's roaming and try to capture nearby leaves. */
export function stepDevil(devil: Devil, dt: number, leaves: readonly Leaf[], limit: number, bounds: LeafBounds, rng: () => number): void {
  devil.age += dt;
  // Wander with a slowly turning heading.
  const turn = (rng() - 0.5) * dt * 1.5;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const vx = devil.vx * cos - devil.vz * sin;
  const vz = devil.vx * sin + devil.vz * cos;
  devil.vx = vx;
  devil.vz = vz;
  devil.x += devil.vx * dt;
  devil.z += devil.vz * dt;
  const { minX, maxX, minZ, maxZ } = bounds;
  if (devil.x < minX || devil.x > maxX) devil.vx = -devil.vx;
  if (devil.z < minZ || devil.z > maxZ) devil.vz = -devil.vz;
  devil.x = Math.min(maxX, Math.max(minX, devil.x));
  devil.z = Math.min(maxZ, Math.max(minZ, devil.z));

  // Strength ramps up and down over the devil's life.
  const strength = Math.min(1, devil.age / 1.5, (devil.life - devil.age) / 1.5);
  if (strength <= 0) return;

  for (let i = 0; i < limit; i++) {
    const leaf = leaves[i];
    if (leaf.state !== GROUND && leaf.state !== FALLING) continue;
    const dx = leaf.x - devil.x;
    const dz = leaf.z - devil.z;
    const d = Math.hypot(dx, dz);
    if (d < DEVIL_RADIUS && leaf.y < DEVIL_HEIGHT && rng() < dt * 3 * strength) {
      leaf.state = CAPTURED;
      leaf.captor = devil;
      leaf.orbitR = Math.max(0.8, d);
      leaf.orbitAngle = Math.atan2(dz, dx);
      leaf.timer = 4 + rng() * 4;
    }
  }
}

/** Move a leaf caught in a devil's vortex, or release it when the devil ends or the timer runs out. */
export function stepCaptured(leaf: Leaf, dt: number, airLife: number): void {
  const devil = leaf.captor;
  leaf.timer -= dt;
  if (!devil || devil.age >= devil.life || leaf.timer <= 0) {
    // Release with the tangential velocity of the orbit.
    leaf.state = FALLING;
    leaf.captor = null;
    leaf.vx = -Math.sin(leaf.orbitAngle) * 3;
    leaf.vz = Math.cos(leaf.orbitAngle) * 3;
    leaf.vy = 0.5;
    leaf.timer = airLife;
    return;
  }
  leaf.orbitAngle += (3.5 / Math.max(leaf.orbitR, 1)) * dt * 2;
  leaf.orbitR = Math.min(DEVIL_RADIUS, leaf.orbitR + dt * 0.5);
  const targetY = DEVIL_HEIGHT * (0.3 + 0.7 * Math.min(1, leaf.timer / 3));
  leaf.y += (targetY - leaf.y) * Math.min(1, dt * 2);
  leaf.x = devil.x + Math.cos(leaf.orbitAngle) * leaf.orbitR;
  leaf.z = devil.z + Math.sin(leaf.orbitAngle) * leaf.orbitR;
  leaf.rot += dt * 6;
}
