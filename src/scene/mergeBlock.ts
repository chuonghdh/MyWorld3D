// Merges many building groups (each made of meshes sharing the city-wide materials)
// into one mesh per material, so a whole block of houses costs about three draw calls.
//
// Neighbouring houses of a block can overlap a little: a courtyard door step or a rear balcony of one
// house may reach into the next house standing right behind it. Such geometry is hidden inside that
// neighbour, but its faces would sit within a centimetre or two of the neighbour's walls, which is
// exactly what makes pixels flicker. Triangles that lie inside another house's walls are therefore
// dropped while merging.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface PlacedObject {
  object: THREE.Object3D;
  /** World transform to bake into the geometry. */
  matrix: THREE.Matrix4;
}

/**
 * The part of a lot that counts as another house's solid: its whole lot rectangle (a house keeps its
 * own geometry inside its lot, apart from rear steps, drainpipes and similar details that reach over
 * the line), up to its ridge.
 */
const CORE_MARGIN = 0;

interface Core {
  inverse: THREE.Matrix4;
  hw: number;
  hd: number;
  top: number;
  /** World-space bounds, for a quick reject. */
  box: THREE.Box3;
}

function coreOf(p: PlacedObject): Core | null {
  const u = p.object.userData as { width?: number; depth?: number; height?: number };
  if (!u.width || !u.depth || !u.height) return null;
  const hw = u.width / 2 - CORE_MARGIN;
  const hd = u.depth / 2 - CORE_MARGIN;
  if (hw <= 0 || hd <= 0) return null;
  // Up to the ridge plus 1.5 m of rooftop clutter: anything of a neighbour in there is inside this house.
  const top = u.height + 1.5;
  const box = new THREE.Box3(new THREE.Vector3(-hw, -0.01, -hd), new THREE.Vector3(hw, top, hd)).applyMatrix4(p.matrix);
  return { inverse: p.matrix.clone().invert(), hw, hd, top, box };
}

/** Removes the triangles of `geo` whose centroid is inside one of the cores. Returns `geo` when nothing is dropped. */
function cullInside(geo: THREE.BufferGeometry, cores: readonly Core[]): THREE.BufferGeometry {
  if (cores.length === 0 || geo.getIndex()) return geo;
  const pos = geo.getAttribute('position');
  const tris = pos.count / 3;
  const keep: number[] = [];
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let t = 0; t < tris; t++) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(v.fromBufferAttribute(pos, t * 3 + k));
    c.multiplyScalar(1 / 3);
    let inside = false;
    for (const core of cores) {
      if (!core.box.containsPoint(c)) continue;
      v.copy(c).applyMatrix4(core.inverse);
      if (Math.abs(v.x) < core.hw && Math.abs(v.z) < core.hd && v.y > -0.01 && v.y < core.top) {
        inside = true;
        break;
      }
    }
    if (!inside) keep.push(t);
  }
  if (keep.length === tris) return geo;
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.getAttribute(name);
    const size = a.itemSize;
    const src = a.array as Float32Array;
    const dst = new Float32Array(keep.length * 3 * size);
    keep.forEach((t, i) => dst.set(src.subarray(t * 3 * size, (t * 3 + 3) * size), i * 3 * size));
    out.setAttribute(name, new THREE.BufferAttribute(dst, size, a.normalized));
  }
  geo.dispose();
  return out;
}

/** Per-vertex flag written by HouseMesh (src/buildings/facade/mesh.ts): 1 = shadow caster, 0 = small detail. */
const CASTER_ATTRIBUTE = 'aCaster';
const BODY_MATERIAL = 'building-body';

/**
 * Splits a body geometry into [casters, details] by the aCaster attribute and strips the attribute.
 * Geometry without the attribute (monuments) is all casters. Triangles keep their order and data, so
 * casters plus details are exactly the input triangles.
 */
function splitCasters(geo: THREE.BufferGeometry): [THREE.BufferGeometry | null, THREE.BufferGeometry | null] {
  const flag = geo.getAttribute(CASTER_ATTRIBUTE);
  if (!flag || geo.getIndex()) return [geo, null];
  const tris = flag.count / 3;
  const cast: number[] = [];
  const detail: number[] = [];
  for (let t = 0; t < tris; t++) (flag.getX(t * 3) > 0.5 ? cast : detail).push(t);
  const build = (list: number[]): THREE.BufferGeometry | null => {
    if (list.length === 0) return null;
    const out = new THREE.BufferGeometry();
    for (const name of Object.keys(geo.attributes)) {
      if (name === CASTER_ATTRIBUTE) continue;
      const a = geo.getAttribute(name);
      const size = a.itemSize;
      const src = a.array as Float32Array;
      const dst = new Float32Array(list.length * 3 * size);
      list.forEach((t, i) => dst.set(src.subarray(t * 3 * size, (t * 3 + 3) * size), i * 3 * size));
      out.setAttribute(name, new THREE.BufferAttribute(dst, size, a.normalized));
    }
    return out;
  };
  const result: [THREE.BufferGeometry | null, THREE.BufferGeometry | null] = [build(cast), build(detail)];
  geo.dispose();
  return result;
}

export function mergeByMaterial(items: readonly PlacedObject[], name: string): THREE.Group {
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  // Small body detail (frames, railings, shutters, pots ...) that is drawn but does not cast shadows.
  const details = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const push = (map: Map<THREE.Material, THREE.BufferGeometry[]>, material: THREE.Material, geo: THREE.BufferGeometry): void => {
    const list = map.get(material);
    if (list) list.push(geo);
    else map.set(material, [geo]);
  };
  const local = new THREE.Matrix4();
  const cores = items.map(coreOf);

  items.forEach(({ object, matrix }, index) => {
    object.updateMatrixWorld(true);
    // Cores of the other houses whose bounds touch this house's bounds.
    const bounds = new THREE.Box3().setFromObject(object).applyMatrix4(matrix);
    const others: Core[] = [];
    cores.forEach((core, j) => {
      if (j !== index && core && core.box.intersectsBox(bounds)) others.push(core);
    });
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const material = child.material as THREE.Material;
      // child.matrixWorld is relative to the (unparented) building root.
      local.multiplyMatrices(matrix, child.matrixWorld);
      let geo = (child.geometry as THREE.BufferGeometry).clone().applyMatrix4(local);
      geo = cullInside(geo, others);
      if (material.name === BODY_MATERIAL) {
        const [cast, detail] = splitCasters(geo);
        if (cast) push(buckets, material, cast);
        if (detail) push(details, material, detail);
      } else push(buckets, material, geo);
      (child.geometry as THREE.BufferGeometry).dispose();
    });
  });

  const group = new THREE.Group();
  group.name = name;
  for (const [material, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = material.name || 'merged';
    mesh.castShadow = material.name === BODY_MATERIAL;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const [material, geos] of details) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = (material.name || 'merged') + '-detail';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** Frees the merged geometry of a group built by mergeByMaterial. Materials are shared and kept. */
export function disposeMerged(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) (child.geometry as THREE.BufferGeometry).dispose();
  });
}
