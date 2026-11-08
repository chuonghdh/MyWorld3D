// Geometry helpers for the room: merge parts into one geometry, optionally with a flat colour per part.
import * as THREE from 'three';

export interface Part {
  geo: THREE.BufferGeometry;
  color?: string;
}

/** Merge indexed parts (position, normal; colour attribute when any part has a colour). Disposes the inputs. */
export function mergeParts(parts: readonly Part[]): THREE.BufferGeometry {
  const withColor = parts.some((p) => p.color);
  const pos: number[] = [];
  const nor: number[] = [];
  const colr: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  for (const { geo, color } of parts) {
    const g = geo.index ? geo : geo.setIndex([...Array(geo.attributes.position!.count).keys()]);
    const base = pos.length / 3;
    const p = Array.from(g.attributes.position!.array as ArrayLike<number>);
    pos.push(...p);
    nor.push(...Array.from(g.attributes.normal!.array as ArrayLike<number>));
    if (withColor) {
      c.set(color ?? '#ffffff');
      for (let i = 0; i < p.length / 3; i++) colr.push(c.r, c.g, c.b);
    }
    for (const i of Array.from(g.index!.array as ArrayLike<number>)) idx.push(i + base);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (withColor) out.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}
