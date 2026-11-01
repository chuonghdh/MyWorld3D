// Dev-only copy of the courtyard bush as it was before the shrub rework (greenery.ts addBush at that time).
// Kept so the Shrubs view can show before and after side by side. Not used by the city.
import * as THREE from 'three';
import { TriBuilder, makeWarp } from '../../environment/forest';
import { TAG_FOLIAGE } from '../../environment/seasonalPaint';

const BUSH_TONES = ['#4a7a34', '#3b6a2c', '#5a8a3c', '#2f5a26'].map((h) => new THREE.Color(h));
const BLOB = new THREE.IcosahedronGeometry(1, 1);
const range = (rng: () => number, lo: number, hi: number) => lo + (hi - lo) * rng();

export function addBushBefore(b: TriBuilder, rng: () => number, x: number, z: number, seed: number, fixedSize?: number): void {
  const n = 2 + Math.floor(rng() * 2);
  const tone = BUSH_TONES[Math.floor(rng() * BUSH_TONES.length)];
  const c = new THREE.Color();
  const size = fixedSize ?? range(rng, 0.55, 0.85);
  b.tag = TAG_FOLIAGE;
  for (let i = 0; i < n; i++) {
    const r = size * (i === 0 ? 1 : range(rng, 0.6, 0.8));
    const ox = i === 0 ? 0 : range(rng, -0.5, 0.5) * size;
    const oz = i === 0 ? 0 : range(rng, -0.5, 0.5) * size;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x + ox, r * 0.75, z + oz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * Math.PI, 0)),
      new THREE.Vector3(r, r * 0.85, r),
    );
    const top = r * 1.6;
    b.add(
      BLOB,
      m,
      (_f, centroid, normal) => {
        const k = (0.85 + 0.25 * normal.y) * range(rng, 0.92, 1.08);
        return c.copy(tone).multiplyScalar(k * (0.7 + 0.4 * Math.min(1, centroid.y / top)));
      },
      makeWarp(seed + i * 131, r * 0.14),
    );
  }
}
