// Small vertex-colour mesh builder for the streetscape.
// Everything is written straight into flat arrays (position, normal, color) and merged
// into one BufferGeometry, so a whole layer of the town costs a single draw call.

import * as THREE from 'three';

type P3 = readonly [number, number, number];

const tmpColor = new THREE.Color();
const tmpNormalMatrix = new THREE.Matrix3();
const tmpV = new THREE.Vector3();

export class MeshBuilder {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly col: number[] = [];

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  private push(p: P3, n: P3, c: THREE.Color): void {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.col.push(c.r, c.g, c.b);
  }

  /** Quad a-b-c-d, counter-clockwise seen from the side it faces. Flat normal. */
  quad(a: P3, b: P3, c: P3, d: P3, color: THREE.ColorRepresentation): this {
    tmpColor.set(color);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const n: P3 = [nx, ny, nz];
    this.push(a, n, tmpColor); this.push(b, n, tmpColor); this.push(c, n, tmpColor);
    this.push(a, n, tmpColor); this.push(c, n, tmpColor); this.push(d, n, tmpColor);
    return this;
  }

  /** Upward-facing axis-aligned rectangle at height y. */
  rect(y: number, minX: number, maxX: number, minZ: number, maxZ: number, color: THREE.ColorRepresentation): this {
    if (maxX - minX <= 1e-6 || maxZ - minZ <= 1e-6) return this;
    return this.quad([minX, y, maxZ], [maxX, y, maxZ], [maxX, y, minZ], [minX, y, minZ], color);
  }

  /**
   * Upward-facing rectangle centred on (cx, cz), sizeX along local x and sizeZ along local z,
   * rotated about +Y by `angle` (same convention as Object3D.rotation.y).
   */
  rectRot(y: number, cx: number, cz: number, sizeX: number, sizeZ: number, angle: number, color: THREE.ColorRepresentation): this {
    const hx = sizeX / 2, hz = sizeZ / 2;
    const c = Math.cos(angle), s = Math.sin(angle);
    const t = (lx: number, lz: number): P3 => [cx + lx * c + lz * s, y, cz - lx * s + lz * c];
    return this.quad(t(-hx, hz), t(hx, hz), t(hx, -hz), t(-hx, -hz), color);
  }

  /** Axis-aligned box without a bottom face. */
  box(minX: number, maxX: number, y0: number, y1: number, minZ: number, maxZ: number, color: THREE.ColorRepresentation): this {
    if (maxX - minX <= 1e-6 || maxZ - minZ <= 1e-6 || y1 - y0 <= 1e-6) return this;
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    return this.boxRot(cx, cz, y0, y1, maxX - minX, maxZ - minZ, 0, color);
  }

  /** Box centred on (cx, cz), from y0 to y1, rotated about +Y by angle. No bottom face. */
  boxRot(cx: number, cz: number, y0: number, y1: number, sizeX: number, sizeZ: number, angle: number, color: THREE.ColorRepresentation): this {
    const hx = sizeX / 2, hz = sizeZ / 2;
    const c = Math.cos(angle), s = Math.sin(angle);
    const t = (lx: number, y: number, lz: number): P3 => [cx + lx * c + lz * s, y, cz - lx * s + lz * c];
    // top
    this.quad(t(-hx, y1, hz), t(hx, y1, hz), t(hx, y1, -hz), t(-hx, y1, -hz), color);
    // +z
    this.quad(t(-hx, y0, hz), t(hx, y0, hz), t(hx, y1, hz), t(-hx, y1, hz), color);
    // -z
    this.quad(t(hx, y0, -hz), t(-hx, y0, -hz), t(-hx, y1, -hz), t(hx, y1, -hz), color);
    // +x
    this.quad(t(hx, y0, hz), t(hx, y0, -hz), t(hx, y1, -hz), t(hx, y1, hz), color);
    // -x
    this.quad(t(-hx, y0, -hz), t(-hx, y0, hz), t(-hx, y1, hz), t(-hx, y1, -hz), color);
    return this;
  }

  /** Appends a Three.js geometry transformed by `matrix`, with one flat vertex colour. */
  geometry(geo: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.ColorRepresentation): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    tmpColor.set(color);
    tmpNormalMatrix.getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      tmpV.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(matrix);
      this.pos.push(tmpV.x, tmpV.y, tmpV.z);
      tmpV.set(n.getX(i), n.getY(i), n.getZ(i)).applyMatrix3(tmpNormalMatrix).normalize();
      this.nor.push(tmpV.x, tmpV.y, tmpV.z);
      this.col.push(tmpColor.r, tmpColor.g, tmpColor.b);
    }
    if (g !== geo) g.dispose();
    return this;
  }

  /** Flat upward disc with a colour that falls off from centre to rim (for additive light pools). */
  falloffDisc(cx: number, y: number, cz: number, radius: number, center: THREE.Color, rings = 4, segments = 18): this {
    const ringColor = (r: number): THREE.Color => {
      const k = Math.pow(1 - r, 2);
      return new THREE.Color(center.r * k, center.g * k, center.b * k);
    };
    const up: P3 = [0, 1, 0];
    for (let ri = 0; ri < rings; ri++) {
      const r0 = ri / rings, r1 = (ri + 1) / rings;
      const c0 = ringColor(r0), c1 = ringColor(r1);
      for (let si = 0; si < segments; si++) {
        const a0 = (si / segments) * Math.PI * 2;
        const a1 = ((si + 1) / segments) * Math.PI * 2;
        const p = (r: number, a: number): P3 => [cx + Math.cos(a) * r * radius, y, cz + Math.sin(a) * r * radius];
        // Winding chosen so the face points up: (outer a0, inner a0, inner a1) etc.
        const o0 = p(r1, a0), o1 = p(r1, a1), i0 = p(r0, a0), i1 = p(r0, a1);
        this.push(i0, up, c0); this.push(o1, up, c1); this.push(o0, up, c1);
        if (ri > 0) { this.push(i0, up, c0); this.push(i1, up, c0); this.push(o1, up, c1); }
      }
    }
    return this;
  }

  /** One triangle with a flat normal (winding decides the facing; counter-clockwise seen from the front). */
  tri(a: P3, b: P3, c: P3, color: THREE.ColorRepresentation): this {
    tmpColor.set(color);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    const n: P3 = [nx / len, ny / len, nz / len];
    this.push(a, n, tmpColor); this.push(b, n, tmpColor); this.push(c, n, tmpColor);
    return this;
  }

  /** Upward-facing sector of an annulus (r0 may be 0) between angles a0 and a1, centred on (cx, cz). */
  annulusSector(cx: number, y: number, cz: number, r0: number, r1: number, a0: number, a1: number, color: THREE.ColorRepresentation, segments = 4): this {
    const p = (r: number, a: number): P3 => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
    for (let i = 0; i < segments; i++) {
      const s0 = a0 + ((a1 - a0) * i) / segments;
      const s1 = a0 + ((a1 - a0) * (i + 1)) / segments;
      if (r0 <= 1e-6) {
        this.tri(p(r1, s1), p(r1, s0), [cx, y, cz], color);
      } else {
        this.tri(p(r1, s1), p(r1, s0), p(r0, s0), color);
        this.tri(p(r1, s1), p(r0, s0), p(r0, s1), color);
      }
    }
    return this;
  }

  /** Full upward-facing annulus or disc. */
  annulus(cx: number, y: number, cz: number, r0: number, r1: number, color: THREE.ColorRepresentation, segments = 16): this {
    return this.annulusSector(cx, y, cz, r0, r1, 0, Math.PI * 2, color, segments);
  }

  /**
   * Frustum side wall around a vertical axis, from radius r0 at y0 to r1 at y1. `inward` flips the faces so a
   * hollow basin shows its inner wall. Optionally closes the top with a disc.
   */
  frustum(cx: number, cz: number, y0: number, y1: number, r0: number, r1: number, color: THREE.ColorRepresentation, segments = 16, inward = false, cap = false): this {
    const p = (r: number, y: number, a: number): P3 => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const b0 = p(r0, y0, a0), b1 = p(r0, y0, a1), t0 = p(r1, y1, a0), t1 = p(r1, y1, a1);
      if (inward) this.quad(b0, b1, t1, t0, color);
      else this.quad(b1, b0, t0, t1, color);
      if (cap) this.tri(p(r1, y1, a1), p(r1, y1, a0), [cx, y1, cz], color);
    }
    return this;
  }

  /** Merged geometry, or null when nothing was added. */
  build(): THREE.BufferGeometry | null {
    if (this.pos.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Matrix from position, Y rotation and uniform/non-uniform scale. */
export function placeMatrix(x: number, y: number, z: number, rotY = 0, rotX = 0, rotZ = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ')),
    new THREE.Vector3(1, 1, 1),
  );
}
