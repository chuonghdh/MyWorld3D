// Lab wrapper around the city's falling-leaf system (environment/leaves.ts LeafSystem), so the lab runs the same
// spawn, vein, rest, fade, surfaces, crown and camera-gate logic as the city. The lab only adds the autumn switch and
// the lab's bounds. Lab files are not imported by the city.

import * as THREE from 'three';
import type { WindVector } from '../../environment/wind';
import { LeafSystem } from '../../environment/leaves';

const LAB_BOUNDS = { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 };

export class LabLeafEmitter {
  private readonly system: LeafSystem;
  private enabled = false;
  private last = 0;

  constructor(parent: THREE.Object3D) {
    this.system = new LeafSystem({ bounds: LAB_BOUNDS });
    this.system.mesh.visible = false;
    this.system.veinMesh.visible = false;
    parent.add(this.system.mesh, this.system.veinMesh);
  }

  /** Crown discs of the lab's tree field (see crownDiscsFromGroup in environment/leaves.ts). */
  setDiscs(discs: Parameters<LeafSystem['setCrownDiscs']>[0]): void {
    this.system.setCrownDiscs(discs);
  }

  /** Autumn only. Turning off clears every leaf. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.system.mesh.visible = on;
    this.system.veinMesh.visible = on;
    if (!on) this.system.reset();
  }

  /** One frame: camera gates from the lab camera and its orbit target, then the city's update. */
  update(t: number, wind: WindVector, camera: THREE.Camera, focus: { x: number; z: number }): void {
    const dt = Math.max(t - this.last, 0);
    this.last = t;
    if (!this.enabled) return;
    this.system.setCameraView(camera, focus);
    this.system.update(dt, wind, { leafAmount: 1, leafSize: 1, season: 'autumn' });
  }

  dispose(): void {
    this.system.dispose();
  }
}
