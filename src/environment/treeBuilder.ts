// Geometry builder for the procedural trees: vertex-coloured triangles, deterministic jitter, string hashing.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Geometry builder (non-indexed triangles with vertex colours)
// ---------------------------------------------------------------------------

export class TriBuilder {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  /** Per-vertex tag (see seasonalPaint); set `tag` before calling add(). */
  readonly tags: number[] = [];
  tag = 0;

  get triangleCount(): number {
    return this.positions.length / 9;
  }

  /**
   * Appends `geo` transformed by `matrix`. `colorOf(faceIndex, centroid, normal)` returns the
   * flat colour of each triangle (centroid and normal are after the transform).
   * `warp` may move each transformed vertex (it must be a pure function of the position so that
   * shared corners stay welded).
   */
  add(
    geo: THREE.BufferGeometry,
    matrix: THREE.Matrix4,
    colorOf: (face: number, centroid: THREE.Vector3, normal: THREE.Vector3) => THREE.Color,
    warp?: (v: THREE.Vector3) => void,
  ): void {
    const src = geo.index ? geo.toNonIndexed() : geo;
    const pos = src.getAttribute('position');
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const centroid = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const ab = new THREE.Vector3();
    for (let i = 0, f = 0; i < pos.count; i += 3, f++) {
      a.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      b.fromBufferAttribute(pos, i + 1).applyMatrix4(matrix);
      c.fromBufferAttribute(pos, i + 2).applyMatrix4(matrix);
      if (warp) {
        warp(a);
        warp(b);
        warp(c);
      }
      centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      normal.subVectors(c, b).cross(ab.subVectors(a, b)).normalize();
      const col = colorOf(f, centroid, normal);
      for (const v of [a, b, c]) {
        this.positions.push(v.x, v.y, v.z);
        this.colors.push(col.r, col.g, col.b);
        this.tags.push(this.tag);
      }
    }
    if (src !== geo) src.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/** Deterministic jitter field: the same input position always gets the same offset. */
export function makeWarp(seed: number, amount: number): (v: THREE.Vector3) => void {
  return (v) => {
    const k = (x: number) => Math.round(x * 1000);
    const h = hash3(k(v.x), k(v.y), k(v.z), seed);
    v.x += (((h & 0x3ff) / 1023) * 2 - 1) * amount;
    v.y += ((((h >>> 10) & 0x3ff) / 1023) * 2 - 1) * amount;
    v.z += ((((h >>> 20) & 0x3ff) / 1023) * 2 - 1) * amount;
  };
}

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ x, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ y, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16) ^ z, 0x27d4eb2f);
  h ^= h >>> 15;
  return h >>> 0;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const UP = new THREE.Vector3(0, 1, 0);

/** Matrix placing a unit cylinder (height 1, centred) between two points. */
export function limbMatrix(from: THREE.Vector3, to: THREE.Vector3, radius: number): THREE.Matrix4 {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  return new THREE.Matrix4().compose(mid, q, new THREE.Vector3(radius, len, radius));
}
