// Low-poly animal models. Every vertex carries a flat colour ('color') and a part id ('aPart') that the
// animal shader uses to animate wings, heads, tails and legs.
//
// Part ids: 0 static body, 1 left wing / left leg-less, 2 right wing, 3 head (neck, beak, ears),
// 4 tail, 5 eyes (glow at night on cats), 6 legs group A, 7 legs group B.
// All models face +Z, +Y is up.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const PART = { BODY: 0, WING_L: 1, WING_R: 2, HEAD: 3, TAIL: 4, EYE: 5, LEG_A: 6, LEG_B: 7 } as const;

class Builder {
  private readonly geos: THREE.BufferGeometry[] = [];

  private push(geo: THREE.BufferGeometry, color: number | number[], part: number): void {
    const count = geo.attributes.position.count;
    const arr = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const hex = Array.isArray(color) ? color[i] : color;
      c.set(hex);
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geo.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(count).fill(part), 1));
    this.geos.push(geo);
  }

  /** Ellipsoid with radii (rx, ry, rz) at (x, y, z); optional pre-rotation about X then Z. */
  ellipsoid(
    rx: number, ry: number, rz: number, x: number, y: number, z: number,
    color: number, part: number, segW = 7, segH = 5, rotX = 0, rotZ = 0,
  ): this {
    const g = new THREE.SphereGeometry(1, segW, segH);
    g.scale(rx, ry, rz);
    if (rotX) g.rotateX(rotX);
    if (rotZ) g.rotateZ(rotZ);
    g.translate(x, y, z);
    this.push(g, color, part);
    return this;
  }

  /** Axis-aligned box with optional rotation about X and Y. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, part: number, rotX = 0, rotY = 0): this {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rotX) g.rotateX(rotX);
    if (rotY) g.rotateY(rotY);
    g.translate(x, y, z);
    this.push(g, color, part);
    return this;
  }

  /** Cone pointing +Y rotated by (rotX, rotZ), base radius r, height h. */
  cone(r: number, h: number, seg: number, x: number, y: number, z: number, color: number, part: number, rotX = 0, rotZ = 0): this {
    const g = new THREE.ConeGeometry(r, h, seg, 1, false);
    g.translate(0, h / 2, 0);
    if (rotX) g.rotateX(rotX);
    if (rotZ) g.rotateZ(rotZ);
    g.translate(x, y, z);
    this.push(g, color, part);
    return this;
  }

  /** Flat polygon in the XZ plane (fan from the first point), at height y, per-vertex colours. */
  poly(points: ReadonlyArray<readonly [number, number]>, y: number, ox: number, oz: number, colors: number[], part: number, mirror = false): this {
    const n = points.length;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const sx = mirror ? -1 : 1;
      pos[i * 3] = (points[i][0] + 0) * sx + ox;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = points[i][1] + oz;
      nor[i * 3 + 1] = 1;
    }
    const idx: number[] = [];
    for (let i = 1; i < n - 1; i++) {
      if (mirror) idx.push(0, i + 1, i);
      else idx.push(0, i, i + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.push(g, colors, part);
    return this;
  }

  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.geos, false);
    if (!merged) throw new Error('life geometry: merge failed');
    for (const g of this.geos) g.dispose();
    merged.computeBoundingSphere();
    return merged;
  }
}

/** Triangle count of a geometry. */
export function triangleCount(geo: THREE.BufferGeometry): number {
  return geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
}

// ---------------------------------------------------------------------------------------------
// Pigeon: about 200 triangles. Feet at y = 0, body length 0.3 m. Wing hinges at (+-0.02, 0.185, 0.02).
export const PIGEON_HINGE = { x: 0.02, y: 0.185, z: 0.02 };

export function buildPigeonGeometry(): THREE.BufferGeometry {
  const b = new Builder();
  const grey = 0x9aa1b0;
  b.ellipsoid(0.074, 0.07, 0.135, 0, 0.125, -0.01, grey, PART.BODY, 7, 4);
  b.ellipsoid(0.07, 0.07, 0.075, 0, 0.13, 0.075, 0xa7a3b4, PART.BODY, 6, 3); // breast
  // iridescent neck: purple collar, green throat
  b.ellipsoid(0.045, 0.048, 0.045, 0, 0.175, 0.108, 0x8a4a9c, PART.HEAD, 5, 3);
  b.ellipsoid(0.04, 0.045, 0.04, 0, 0.205, 0.122, 0x2f9378, PART.HEAD, 5, 3);
  b.ellipsoid(0.032, 0.032, 0.04, 0, 0.232, 0.138, 0x6b7280, PART.HEAD, 5, 3); // head
  b.cone(0.011, 0.03, 4, 0, 0.228, 0.172, 0xd8cbb8, PART.HEAD, Math.PI / 2); // beak
  b.ellipsoid(0.009, 0.009, 0.009, 0.027, 0.238, 0.15, 0xe5791a, PART.HEAD, 4, 2);
  b.ellipsoid(0.009, 0.009, 0.009, -0.027, 0.238, 0.15, 0xe5791a, PART.HEAD, 4, 2);
  // tail: dark wedge with a pale tip
  b.box(0.085, 0.012, 0.09, 0, 0.115, -0.165, 0x4a4f5c, PART.BODY, -0.25);
  // legs
  b.box(0.008, 0.06, 0.008, 0.026, 0.03, 0.01, 0xc9667a, PART.BODY);
  b.box(0.008, 0.06, 0.008, -0.026, 0.03, 0.01, 0xc9667a, PART.BODY);
  // wings, spread flat; the shader folds them. Per-vertex gradient grey -> dark tip.
  const wing: Array<[number, number]> = [
    [0.0, 0.07],
    [0.14, 0.05],
    [0.3, -0.1],
    [0.27, -0.19],
    [0.15, -0.16],
    [0.0, -0.13],
  ];
  const wc = [0x8991a0, 0x8991a0, 0x3e4350, 0x3e4350, 0x6a7080, 0x7c8392];
  b.poly(wing, 0, PIGEON_HINGE.x, PIGEON_HINGE.z + 0.0, wc, PART.WING_R, false);
  b.poly(wing, 0, -PIGEON_HINGE.x, PIGEON_HINGE.z + 0.0, wc, PART.WING_L, true);
  const g = b.build();
  // wings sit at the hinge height
  const pos = g.attributes.position as THREE.BufferAttribute;
  const part = g.attributes.aPart as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const p = part.getX(i);
    if (p === PART.WING_L || p === PART.WING_R) pos.setY(i, PIGEON_HINGE.y);
  }
  pos.needsUpdate = true;
  return g;
}

// ---------------------------------------------------------------------------------------------
// Flying bird (swallow / starling / gull via instance tint). Body centre at origin, span 0.4 m.
export const FLYER_HINGE = { x: 0.016, y: 0.012, z: 0.01 };

export function buildFlyerGeometry(): THREE.BufferGeometry {
  const b = new Builder();
  b.ellipsoid(0.03, 0.03, 0.09, 0, 0, 0, 0xb8b8b8, PART.BODY, 6, 4);
  b.ellipsoid(0.026, 0.02, 0.07, 0, -0.012, 0.01, 0xffffff, PART.BODY, 5, 3); // pale belly
  b.ellipsoid(0.022, 0.022, 0.026, 0, 0.006, 0.09, 0xd0d0d0, PART.HEAD, 5, 3);
  b.cone(0.008, 0.02, 3, 0, 0.004, 0.108, 0x888888, PART.HEAD, Math.PI / 2);
  // forked tail
  b.poly([[0, 0], [0.026, -0.1], [0.0, -0.06], [-0.026, -0.1]], 0.004, 0, -0.07, [0xa0a0a0, 0x909090, 0xa0a0a0, 0x909090], PART.BODY);
  // swept crescent wings
  const wing: Array<[number, number]> = [
    [0.0, 0.05],
    [0.1, 0.035],
    [0.21, -0.075],
    [0.1, -0.025],
    [0.0, -0.06],
  ];
  const wc = [0xe0e0e0, 0xd0d0d0, 0x707070, 0xa0a0a0, 0xc0c0c0];
  b.poly(wing, 0, FLYER_HINGE.x, FLYER_HINGE.z, wc, PART.WING_R, false);
  b.poly(wing, 0, -FLYER_HINGE.x, FLYER_HINGE.z, wc, PART.WING_L, true);
  const g = b.build();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const part = g.attributes.aPart as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const p = part.getX(i);
    if (p === PART.WING_L || p === PART.WING_R) pos.setY(i, FLYER_HINGE.y);
  }
  pos.needsUpdate = true;
  return g;
}

// ---------------------------------------------------------------------------------------------
// Cat: standing pose, 0.42 m long. The shader turns it into sit / lie / walk.
export function buildCatGeometry(): THREE.BufferGeometry {
  const b = new Builder();
  const dark = 0xdddddd;
  const light = 0xffffff;
  b.ellipsoid(0.07, 0.085, 0.14, 0, 0.19, 0.0, dark, PART.BODY, 7, 5);
  b.ellipsoid(0.066, 0.08, 0.085, 0, 0.2, 0.115, 0xeeeeee, PART.BODY, 6, 4); // chest
  b.ellipsoid(0.076, 0.085, 0.1, 0, 0.17, -0.1, dark, PART.BODY, 6, 4); // haunch
  b.ellipsoid(0.062, 0.055, 0.055, 0, 0.275, 0.19, 0xf2f2f2, PART.HEAD, 7, 5); // head
  b.ellipsoid(0.03, 0.022, 0.026, 0, 0.258, 0.238, light, PART.HEAD, 5, 3); // muzzle
  b.cone(0.024, 0.045, 4, 0.04, 0.315, 0.18, 0xc8c8c8, PART.HEAD, 0.0, -0.25);
  b.cone(0.024, 0.045, 4, -0.04, 0.315, 0.18, 0xc8c8c8, PART.HEAD, 0.0, 0.25);
  b.box(0.016, 0.012, 0.006, 0.027, 0.283, 0.242, 0xd6e03a, PART.EYE);
  b.box(0.016, 0.012, 0.006, -0.027, 0.283, 0.242, 0xd6e03a, PART.EYE);
  // legs: diagonal pairs swing together
  const lx = 0.048;
  b.box(0.034, 0.17, 0.042, lx, 0.085, 0.12, light, PART.LEG_A);
  b.box(0.034, 0.17, 0.042, -lx, 0.085, -0.13, light, PART.LEG_A);
  b.box(0.034, 0.17, 0.042, -lx, 0.085, 0.12, light, PART.LEG_B);
  b.box(0.034, 0.17, 0.042, lx, 0.085, -0.13, light, PART.LEG_B);
  // tail: three segments curving up
  b.ellipsoid(0.022, 0.022, 0.06, 0, 0.2, -0.22, 0xc4c4c4, PART.TAIL, 5, 3);
  b.ellipsoid(0.021, 0.021, 0.06, 0, 0.215, -0.29, 0xb4b4b4, PART.TAIL, 5, 3, -0.4);
  b.ellipsoid(0.02, 0.02, 0.055, 0, 0.255, -0.335, 0x9a9a9a, PART.TAIL, 5, 3, -0.9);
  return b.build();
}

// ---------------------------------------------------------------------------------------------
// Squirrel: all fours, 0.2 m body plus a big S tail. Feet at y = 0.
export function buildSquirrelGeometry(): THREE.BufferGeometry {
  const b = new Builder();
  const fur = 0xa4532a;
  b.ellipsoid(0.04, 0.045, 0.09, 0, 0.075, 0.0, fur, PART.BODY, 6, 4);
  b.ellipsoid(0.044, 0.05, 0.06, 0, 0.08, -0.06, 0x95492a, PART.BODY, 6, 4);
  b.ellipsoid(0.034, 0.03, 0.04, 0, 0.065, 0.045, 0xe4d3b8, PART.BODY, 5, 3); // pale chest
  b.ellipsoid(0.033, 0.032, 0.04, 0, 0.115, 0.1, 0xb05a30, PART.HEAD, 6, 4);
  b.cone(0.012, 0.025, 3, 0, 0.113, 0.14, 0x30221a, PART.HEAD, Math.PI / 2);
  b.cone(0.01, 0.03, 3, 0.02, 0.14, 0.092, 0x7e3a20, PART.HEAD);
  b.cone(0.01, 0.03, 3, -0.02, 0.14, 0.092, 0x7e3a20, PART.HEAD);
  b.box(0.008, 0.008, 0.006, 0.026, 0.12, 0.118, 0x15100c, PART.HEAD);
  b.box(0.008, 0.008, 0.006, -0.026, 0.12, 0.118, 0x15100c, PART.HEAD);
  b.box(0.014, 0.05, 0.016, 0.026, 0.025, 0.06, 0x7e3a20, PART.BODY);
  b.box(0.014, 0.05, 0.016, -0.026, 0.025, 0.06, 0x7e3a20, PART.BODY);
  b.box(0.018, 0.05, 0.03, 0.03, 0.025, -0.08, 0x7e3a20, PART.BODY);
  b.box(0.018, 0.05, 0.03, -0.03, 0.025, -0.08, 0x7e3a20, PART.BODY);
  // bushy tail
  b.ellipsoid(0.03, 0.036, 0.055, 0, 0.1, -0.14, 0xb3623a, PART.TAIL, 6, 4, 0.5);
  b.ellipsoid(0.04, 0.05, 0.05, 0, 0.17, -0.185, 0xc06c40, PART.TAIL, 6, 4, 0.1);
  b.ellipsoid(0.045, 0.06, 0.05, 0, 0.25, -0.17, 0xcf7a4a, PART.TAIL, 6, 4, -0.3);
  b.ellipsoid(0.036, 0.05, 0.04, 0, 0.31, -0.12, 0xe0a070, PART.TAIL, 6, 4, -0.7);
  return b.build();
}

// ---------------------------------------------------------------------------------------------
// Butterfly / bee: wings flat, hinge on the body axis. Wingspan 0.1 m (scaled up by instances).
export function buildButterflyGeometry(): THREE.BufferGeometry {
  const b = new Builder();
  b.ellipsoid(0.005, 0.005, 0.028, 0, 0, 0, 0x2a2420, PART.BODY, 4, 3);
  const up: Array<[number, number]> = [[0, 0.012], [0.035, 0.04], [0.06, 0.03], [0.055, -0.004], [0.02, -0.012]];
  const upc = [0xffffff, 0xf0f0f0, 0x888888, 0x999999, 0xe0e0e0];
  const lo: Array<[number, number]> = [[0, -0.004], [0.04, -0.01], [0.044, -0.038], [0.018, -0.046], [0, -0.022]];
  const loc = [0xe8e8e8, 0xd0d0d0, 0x909090, 0xb0b0b0, 0xe0e0e0];
  b.poly(up, 0, 0.004, 0, upc, PART.WING_R, false);
  b.poly(lo, 0, 0.004, 0, loc, PART.WING_R, false);
  b.poly(up, 0, -0.004, 0, upc, PART.WING_L, true);
  b.poly(lo, 0, -0.004, 0, loc, PART.WING_L, true);
  return b.build();
}
