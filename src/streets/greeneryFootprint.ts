// Ground footprint of the courtyard greenery (hedges, flower beds, bushes), read from the same generator the scene
// uses (environment/greenery.ts) with the same courtyards and seed. Read only: nothing in environment changes.
// The result is used to keep the fountain plaza clear of greenery; the meshes are thrown away after reading.

import * as THREE from 'three';
import type { CityLayout, Rect } from '../city/layout';
import { createCourtyardGreenery } from '../environment/greenery';
import type { GreeneryTriangle } from './decor';

/** Triangles of every greenery mesh of `layout`, in world XZ. Deterministic for one layout. */
export function courtyardGreeneryFootprint(layout: CityLayout): GreeneryTriangle[] {
  const courtyards = layout.blocks
    .filter((b) => b.kind === 'houses' && b.courtyard)
    .map((b) => b.courtyard as Rect);
  const group = createCourtyardGreenery(courtyards, layout.seed);
  const out: GreeneryTriangle[] = [];
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const geo = o.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute('position');
    const index = geo.index;
    const count = index ? index.count : pos.count;
    const v = new THREE.Vector3();
    const at = (i: number): [number, number] => {
      v.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(o.matrixWorld);
      return [v.x, v.z];
    };
    for (let i = 0; i + 2 < count; i += 3) {
      const [x0, z0] = at(i), [x1, z1] = at(i + 1), [x2, z2] = at(i + 2);
      out.push({ x: [x0, x1, x2], z: [z0, z1, z2] });
    }
  });
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
  return out;
}
