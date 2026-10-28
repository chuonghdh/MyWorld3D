// A small twin-engine airliner built from a few merged primitives (nose +Z, up +Y, right wing +X).
// Vertex attributes: aColor (surface colour) and aLight (0 none, 1 red nav light, 2 white strobe).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Overall length in metres (a scaled-down airliner so it reads from the overview camera). */
/** Size of the model relative to its authoring size (30 m long): 70%. */
export const PLANE_SCALE = 0.7;
const AUTHORING_LENGTH = 30;
export const PLANE_LENGTH = AUTHORING_LENGTH * PLANE_SCALE;

/** Livery regions (vertex attribute aPart): the shader colours 2 and 3 per instance, and the belly of 0. */
export const PART_BODY = 0;
export const PART_FIXED = 1;
export const PART_ENGINE = 2;
export const PART_FIN = 3;

const FUSELAGE = [0.93, 0.94, 0.96] as const;
const WING = [0.78, 0.8, 0.84] as const;
const ENGINE = [0.6, 0.62, 0.66] as const;
const FIN = [0.2, 0.32, 0.55] as const;

function tint(g: THREE.BufferGeometry, rgb: readonly number[], light = 0, part = PART_FIXED): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  const l = new Float32Array(n).fill(light);
  const pt = new Float32Array(n).fill(part);
  for (let i = 0; i < n; i++) c.set(rgb, i * 3);
  g.setAttribute('aColor', new THREE.BufferAttribute(c, 3));
  g.setAttribute('aLight', new THREE.BufferAttribute(l, 1));
  g.setAttribute('aPart', new THREE.BufferAttribute(pt, 1));
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
}

/** A tapered, swept slab: root chord `c0` at x = 0, tip chord `c1` at x = span, trailing edge swept back. */
function slab(span: number, c0: number, c1: number, sweep: number, thick: number, dihedral: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(span, thick, 1, 1, 1, 1);
  g.translate(span / 2, 0, 0);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const k = x / span;
    const chord = c0 + (c1 - c0) * k;
    // z in [-0.5, 0.5] becomes the local chord; the leading edge sweeps back with x.
    p.setZ(i, p.getZ(i) * chord - sweep * k);
    p.setY(i, p.getY(i) + dihedral * k);
  }
  g.computeVertexNormals();
  return g;
}

export function createPlaneGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Fuselage: a capsule lying along Z.
  const body = new THREE.CapsuleGeometry(1.7, AUTHORING_LENGTH - 3.4, 4, 10);
  body.rotateX(Math.PI / 2);
  parts.push(tint(body, FUSELAGE, 0, PART_BODY));

  // Wings (mirrored), swept back, with a slight dihedral.
  const wingR = slab(13, 6.5, 2, 6.5, 0.35, 0.9);
  wingR.translate(0.8, -0.6, 1.5);
  const wingL = wingR.clone();
  wingL.scale(-1, 1, 1);
  // Mirroring flips the winding: flip the indices back by going through non-indexed triangles.
  const flip = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    const q = g.index ? g.toNonIndexed() : g;
    const pos = q.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 3) {
      const ax = pos.getX(i + 1);
      const ay = pos.getY(i + 1);
      const az = pos.getZ(i + 1);
      pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
      pos.setXYZ(i + 2, ax, ay, az);
    }
    q.computeVertexNormals();
    return q;
  };
  parts.push(tint(wingR, WING), tint(flip(wingL), WING));

  // Tailplane and vertical fin.
  const tailR = slab(5, 3.2, 1.4, 2.6, 0.25, 0.2);
  tailR.translate(0.5, 0.3, -12.2);
  const tailL = tailR.clone();
  tailL.scale(-1, 1, 1);
  parts.push(tint(tailR, WING), tint(flip(tailL), WING));
  const fin = slab(5.2, 4.6, 2.2, 3.6, 0.3, 0);
  fin.rotateZ(Math.PI / 2);
  fin.translate(0, 1.2, -11.6);
  parts.push(tint(fin, FIN, 0, PART_FIN));

  // Engines under the wings.
  for (const side of [-1, 1]) {
    const eng = new THREE.CylinderGeometry(0.95, 0.8, 4, 10);
    eng.rotateX(Math.PI / 2);
    eng.translate(side * 5, -2.1, 3.2);
    parts.push(tint(eng, ENGINE, 0, PART_ENGINE));
  }

  // Navigation lights: red beacon on the back, red left and white right wingtip, white tail strobe.
  const lamp = (x: number, y: number, z: number, kind: number): void => {
    const b = new THREE.BoxGeometry(1.1, 1.1, 1.1);
    b.translate(x, y, z);
    parts.push(tint(b, [1, 1, 1], kind));
  };
  lamp(-13.6, 0.5, -4.8, 1);
  lamp(13.6, 0.5, -4.8, 2);
  lamp(0, 1.9, -1, 1);
  lamp(0, 6.6, -15.2, 2);

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('aircraft geometry failed to merge');
  merged.computeVertexNormals();
  // Flat-ish look: keep faceted normals from the non-indexed pieces; just bound it.
  merged.scale(PLANE_SCALE, PLANE_SCALE, PLANE_SCALE);
  merged.computeBoundingSphere();
  return merged;
}
