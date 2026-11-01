// Assembles the instanced traffic visuals: vehicles (vehicleMeshes.ts) and people (people/peopleMeshes.ts).
// Add `group` to the scene once, then call `update` every frame.

import * as THREE from 'three';
import type { PedestrianRender } from './pedestrians';
import type { VehicleRender } from './vehicles';
import type { VisualContext } from './meshKit';
import type { CityLayout } from '../city/layout';
import { createVehicleMeshes, type VehicleMeshes } from './vehicleMeshes';
import { createPeopleMeshes, type PeopleMeshes } from './people/peopleMeshes';

export type { VisualContext } from './meshKit';

export interface TrafficMeshOptions {
  /** Max instances per vehicle class. Extra vehicles are not drawn. */
  vehicleCapacity?: number;
  pedestrianCapacity?: number;
  dogCapacity?: number;
  /** Layout used to place parked cars along avenue curbs. Without it there are no parked cars. */
  layout?: CityLayout;
}

export interface TrafficMeshes {
  group: THREE.Group;
  vehicles: VehicleMeshes;
  people: PeopleMeshes;
  /** Night look on or off (vehicle lights, people with lights). */
  setNight(on: boolean): void;
  setHeadlights(level: number): void;
  update(vehicles: readonly VehicleRender[], pedestrians: readonly PedestrianRender[], ctx: VisualContext): void;
  dispose(): void;
}

export function createTrafficMeshes(options: TrafficMeshOptions = {}): TrafficMeshes {
  const group = new THREE.Group();
  group.name = 'traffic';
  const vehicles = createVehicleMeshes(options.vehicleCapacity ?? 256, options.layout);
  const people = createPeopleMeshes(options.pedestrianCapacity ?? 512, options.dogCapacity ?? 256);
  group.add(vehicles.group, people.group);

  return {
    group,
    vehicles,
    people,
    setHeadlights(level) {
      vehicles.setHeadlights(level);
    },
    setNight(on) {
      vehicles.setNight(on);
      people.setNight(on);
    },
    update(v, p, ctx) {
      vehicles.update(v, ctx);
      people.update(p, ctx);
    },
    dispose() {
      vehicles.dispose();
      people.dispose();
    },
  };
}
