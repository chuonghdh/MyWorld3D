// Broadleaf crown discs for autumn leaf spawning, read from the tree groups, and the camera gates that pick which
// crowns may spawn this frame.

import * as THREE from 'three';

/** A crown: world centre and radius of one broadleaf tree's leaf mass. Autumn leaves fall from inside these discs. */
export interface CrownDisc {
  x: number;
  y: number;
  z: number;
  r: number;
}

/**
 * Crown discs read from a broadleaf tree group (streets/natureTrees.ts names its leaf meshes `nature-leaves-<type>`;
 * the shadow copies are skipped). Each instance gives its leaf sphere transformed by its matrix. Empty when the group
 * has no leaf meshes (procedural trees or assets not loaded yet).
 */
export function crownDiscsFromGroup(group: THREE.Object3D): CrownDisc[] {
  const out: CrownDisc[] = [];
  const m = new THREE.Matrix4();
  const sc = new THREE.Vector3();
  group.traverse((o) => {
    if (!(o instanceof THREE.InstancedMesh)) return;
    if (!o.name.startsWith('nature-leaves-') || o.name.startsWith('nature-leaves-shadow-')) return;
    const geo = o.geometry as THREE.BufferGeometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const sphere = geo.boundingSphere;
    if (!sphere) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      const c = sphere.center.clone().applyMatrix4(m);
      sc.setFromMatrixScale(m);
      out.push({ x: c.x, y: c.y, z: c.z, r: sphere.radius * Math.max(sc.x, sc.y, sc.z) });
    }
  });
  return out;
}

/** Camera gates for crown spawning: a crown spawns only when it is in view and near the focus. */
export class CrownGate {
  private crowns: CrownDisc[] = [];
  /** Camera view for the gates (setView). Null until a frame gives one: then every crown is eligible. */
  private view: { focusX: number; focusZ: number; radius: number } | null = null;
  private readonly frustum = new THREE.Frustum();
  private readonly projScreen = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  /** Crowns passing both gates this frame, rebuilt at most once per frame and only when a leaf is due to spawn. */
  private eligible: CrownDisc[] = [];
  private stale = true;

  /** Number of crowns set (before the camera gates). */
  get count(): number {
    return this.crowns.length;
  }

  /** Replaces the crown discs (radius 0 or less is dropped). */
  setCrowns(discs: readonly CrownDisc[]): void {
    this.crowns = discs.filter((d) => d.r > 0);
    this.stale = true;
  }

  /** Camera view for the gates, once per frame. */
  setView(camera: THREE.Camera, focus: { x: number; z: number }, radius: number): void {
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    this.view = { focusX: focus.x, focusZ: focus.z, radius };
    this.stale = true;
  }

  /** Crowns that pass the camera gates this frame. Rebuilt at most once per frame. */
  list(): CrownDisc[] {
    if (!this.stale) return this.eligible;
    const view = this.view;
    this.eligible = this.crowns.filter((c) => {
      if (view) {
        if (Math.hypot(c.x - view.focusX, c.z - view.focusZ) > view.radius + c.r) return false;
        this.sphere.center.set(c.x, c.y, c.z);
        this.sphere.radius = c.r;
        if (!this.frustum.intersectsSphere(this.sphere)) return false;
      }
      return true;
    });
    this.stale = false;
    return this.eligible;
  }
}
