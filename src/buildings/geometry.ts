// Internal helpers for building low-poly geometry.
// Pieces are collected per material key and merged into one mesh per key,
// so a whole house or monument costs only a handful of draw calls.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Vertex position [x, y, z]. */
export type V3 = readonly [number, number, number];
/** Triangle made of three vertices. */
export type Tri = readonly [V3, V3, V3];

import { getBodyMaterial, getGlassLitMaterial, getGlassMaterial } from './materials';
import { paneSeed } from './facade/polish';

const KEPT_ATTRIBUTES = ['position', 'normal', 'uv'];

export function standardMaterial(color: THREE.ColorRepresentation, roughness = 0.85, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/** Makes every geometry share the same attribute layout so they can be merged. */
function normalizeGeometry(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const name of Object.keys(g.attributes)) {
    if (!KEPT_ATTRIBUTES.includes(name)) g.deleteAttribute(name);
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) {
    const count = g.getAttribute('position').count;
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
  }
  return g;
}

export class GeoBatch {
  private readonly parts = new Map<string, THREE.BufferGeometry[]>();

  /** Adds a geometry under a material key, with position, XYZ Euler rotation and scale. */
  add(key: string, geo: THREE.BufferGeometry, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): this {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(pos[0], pos[1], pos[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
      new THREE.Vector3(scale[0], scale[1], scale[2]),
    );
    const g = normalizeGeometry(geo).applyMatrix4(m);
    const list = this.parts.get(key);
    if (list) list.push(g);
    else this.parts.set(key, [g]);
    return this;
  }

  /** Adds an axis-aligned box centred on pos. */
  box(key: string, w: number, h: number, d: number, pos: V3, rot: V3 = [0, 0, 0]): this {
    return this.add(key, new THREE.BoxGeometry(w, h, d), pos, rot);
  }

  /** Merges each key into one mesh. Every key used must exist in materials. */
  build(materials: Record<string, THREE.Material>): THREE.Group {
    const group = new THREE.Group();
    for (const [key, list] of this.parts) {
      const material = materials[key];
      if (!material) throw new Error(`GeoBatch: no material for key "${key}"`);
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = key;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}

export type ColorTarget = 'body' | 'glass' | 'glassLit';

/**
 * Collects pieces with a vertex colour each and merges them into at most three meshes
 * (body, glass, glassLit) that use the shared materials from materials.ts.
 * Prefer this over GeoBatch for new code: a whole house costs at most three draw calls,
 * and houses can be merged further per block.
 */
export class ColorBatch {
  private readonly parts: Record<ColorTarget, THREE.BufferGeometry[]> = { body: [], glass: [], glassLit: [] };
  private readonly color = new THREE.Color();
  private panes = 0;
  /**
   * Per-vertex wind data (id, anchor weight) for the next body piece added, or null (rigid, the default).
   * The caller sets it right before add() and add() consumes it, so only pieces that ask are flexible.
   */
  windUv: Float32Array | null = null;

  /** Adds a geometry with one flat vertex colour, positioned by pos, XYZ Euler rot and scale. */
  add(
    target: ColorTarget,
    geo: THREE.BufferGeometry,
    color: THREE.ColorRepresentation,
    pos: V3 = [0, 0, 0],
    rot: V3 = [0, 0, 0],
    scale: V3 = [1, 1, 1],
  ): this {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(pos[0], pos[1], pos[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
      new THREE.Vector3(scale[0], scale[1], scale[2]),
    );
    const g = normalizeGeometry(geo).applyMatrix4(m);
    this.color.set(color);
    const count = g.getAttribute('position').count;
    // The body shader reads uv as (wind id, anchor weight) and lit glass reads uv.x as its window seed, so
    // texture coordinates must not leak through (a box uv of 1 would make monument walls flutter like flags).
    const seed = target === 'glassLit' ? paneSeed(this.panes++) : 0;
    const wind = target === 'body' ? this.windUv : null;
    this.windUv = null;
    const uv = wind && wind.length === count * 2 ? wind : new Float32Array(count * 2);
    if (seed > 0) for (let i = 0; i < count; i++) uv[i * 2] = seed;
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = this.color.r;
      colors[i * 3 + 1] = this.color.g;
      colors[i * 3 + 2] = this.color.b;
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.parts[target].push(g);
    return this;
  }

  /** Axis-aligned (or rotated) box on the body. */
  box(color: THREE.ColorRepresentation, w: number, h: number, d: number, pos: V3, rot: V3 = [0, 0, 0]): this {
    return this.add('body', new THREE.BoxGeometry(w, h, d), color, pos, rot);
  }

  /** Glass pane; lit panes glow at night. */
  glassBox(lit: boolean, w: number, h: number, d: number, pos: V3, color: THREE.ColorRepresentation = '#2c3a48', rot: V3 = [0, 0, 0]): this {
    return this.add(lit ? 'glassLit' : 'glass', new THREE.BoxGeometry(w, h, d), color, pos, rot);
  }

  /**
   * Multiplies the vertex colour of everything added so far by a factor that depends on height,
   * e.g. darken the bottom metre for a cheap ground-occlusion look.
   */
  shade(fn: (y: number) => number): this {
    for (const list of Object.values(this.parts)) {
      for (const g of list) {
        const p = g.getAttribute('position');
        const c = g.getAttribute('color');
        for (let i = 0; i < p.count; i++) {
          const k = fn(p.getY(i));
          c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
        }
      }
    }
    return this;
  }

  /** Merges into a Group of up to three meshes named body, glass and glassLit. */
  build(): THREE.Group {
    const materials: Record<ColorTarget, THREE.Material> = {
      body: getBodyMaterial(),
      glass: getGlassMaterial(),
      glassLit: getGlassLitMaterial(),
    };
    const group = new THREE.Group();
    for (const target of ['body', 'glass', 'glassLit'] as const) {
      const list = this.parts[target];
      if (list.length === 0) continue;
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, materials[target]);
      mesh.name = target;
      mesh.castShadow = target === 'body';
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}

function sub(a: V3, b: V3): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Builds a closed-looking solid from triangles. Winding is fixed so every face
 * points away from `interior`, a point inside the solid (solids must be convex).
 */
export function solidFromTris(tris: readonly Tri[], interior: V3): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const t of tris) {
    let [a, b, c] = t;
    const ab = sub(b, a);
    const ac = sub(c, a);
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const cen = sub([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3], interior);
    if (n[0] * cen[0] + n[1] * cen[1] + n[2] * cen[2] < 0) [b, c] = [c, b];
    pos.push(...a, ...b, ...c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Truncated pyramid from a w0 x d0 base at y = 0 to a w1 x d1 top at y = h, closed on top. */
export function frustum(w0: number, d0: number, w1: number, d1: number, h: number): THREE.BufferGeometry {
  const b: V3[] = [
    [-w0 / 2, 0, -d0 / 2],
    [w0 / 2, 0, -d0 / 2],
    [w0 / 2, 0, d0 / 2],
    [-w0 / 2, 0, d0 / 2],
  ];
  const t: V3[] = [
    [-w1 / 2, h, -d1 / 2],
    [w1 / 2, h, -d1 / 2],
    [w1 / 2, h, d1 / 2],
    [-w1 / 2, h, d1 / 2],
  ];
  const tris: Tri[] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    tris.push([b[i], b[j], t[j]], [b[i], t[j], t[i]]);
  }
  tris.push([t[0], t[1], t[2]], [t[0], t[2], t[3]]);
  return solidFromTris(tris, [0, h * 0.3, 0]);
}

/** Pitched roof with its ridge along z; the gable triangles sit at z = +-d/2. Base at y = 0. */
export function gable(w: number, h: number, d: number): THREE.BufferGeometry {
  const A: V3 = [-w / 2, 0, -d / 2];
  const B: V3 = [-w / 2, 0, d / 2];
  const E: V3 = [w / 2, 0, -d / 2];
  const F: V3 = [w / 2, 0, d / 2];
  const C: V3 = [0, h, -d / 2];
  const D: V3 = [0, h, d / 2];
  const tris: Tri[] = [
    [A, B, D], [A, D, C],
    [C, D, F], [C, F, E],
    [B, F, D], [A, C, E],
  ];
  return solidFromTris(tris, [0, h * 0.3, 0]);
}
