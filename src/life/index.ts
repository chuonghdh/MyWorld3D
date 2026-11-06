// Life module: animals that make the city feel inhabited.
// Pigeons (scatter, perch), flying flocks, cats, squirrels, butterflies and bees.
// Budget: 5 draw calls, well under 40k triangles, no per-frame allocation in update().
//
// Wiring (src/scene/Town.tsx):
//   const life = useMemo(() => createLife(layout, { seed: settings.seed, quality }), [layout, ...]);
//   <primitive object={life.group} />
//   useFrame: life.update(dt, { time: t, timeOfDay, season, night: lightsOn, wind, vehicles, pedestrians, camera });

import * as THREE from 'three';
import type { CityLayout } from '../city/layout';
import { FlockSystem, PigeonSystem } from './birds';
import { CatSystem } from './pets';
import { SquirrelSystem } from './squirrels';
import { ButterflySystem } from './butterflies';
import { pushLifeEvent } from './common';
import type { LifeContext, LifeEvent, LifeQuality, LifeSystem } from './common';

export type { Disturber, LifeContext, LifeEvent, LifeEventType, LifeQuality, LifeSeason, LifeSystem } from './common';
export { clearLifeEvents, getLifeEvents } from './common';

export interface LifeOptions {
  seed?: number;
  quality?: LifeQuality;
  /** Called synchronously for every audio-relevant event (scatter, bird call, meow). */
  onEvent?: (e: LifeEvent) => void;
}

/** Test and debug access to the sub-systems. */
export interface LifeSystemExt extends LifeSystem {
  readonly pigeons: PigeonSystem;
  readonly flocks: FlockSystem;
  readonly cats: CatSystem;
  readonly squirrels: SquirrelSystem;
  readonly butterflies: ButterflySystem;
  /** Draw calls (one per InstancedMesh with live instances capacity) and triangle counts. */
  stats(): { drawCalls: number; triangles: number; maxTriangles: number };
}

export function createLife(layout: CityLayout, opts: LifeOptions = {}): LifeSystemExt {
  const seed = opts.seed ?? layout.seed ?? 1;
  const quality = opts.quality ?? 'high';
  const scratch: LifeEvent = { type: 'bird-call', x: 0, z: 0 };
  const onEvent = opts.onEvent;
  const emit = (type: LifeEvent['type'], x: number, z: number): void => {
    pushLifeEvent(type, x, z);
    if (onEvent) {
      scratch.type = type;
      scratch.x = x;
      scratch.z = z;
      onEvent(scratch);
    }
  };

  const pigeons = new PigeonSystem(layout, seed, quality, emit);
  const flocks = new FlockSystem(layout, seed, quality, emit);
  const cats = new CatSystem(layout, seed, quality, emit);
  const squirrels = new SquirrelSystem(layout, seed, quality);
  const butterflies = new ButterflySystem(layout, seed, quality);

  const group = new THREE.Group();
  group.name = 'life';
  const meshes = [pigeons.mesh, flocks.mesh, cats.mesh, squirrels.mesh, butterflies.mesh];
  for (const m of meshes) group.add(m);

  let disposed = false;
  const nightU = pigeons.uniforms.uNight;
  void nightU;

  return {
    group,
    pigeons,
    flocks,
    cats,
    squirrels,
    butterflies,
    update(dt: number, ctx: LifeContext): void {
      if (disposed) return;
      pigeons.update(dt, ctx);
      flocks.update(dt, ctx);
      cats.update(dt, ctx);
      if (layout.streetTrees.length > 0) squirrels.update(dt, ctx);
      butterflies.update(dt, ctx);
      // meshes with no live instances are skipped by the renderer
      group.visible = true;
    },
    stats() {
      let triangles = 0;
      let maxTriangles = 0;
      let drawCalls = 0;
      const sys: Array<{ mesh: THREE.InstancedMesh; triangles: number; capacity: number }> = [pigeons, flocks, cats, squirrels, butterflies];
      for (const s of sys) {
        triangles += s.triangles * s.mesh.count;
        maxTriangles += s.triangles * s.capacity;
        drawCalls++;
      }
      return { drawCalls, triangles, maxTriangles };
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const s of [pigeons, flocks, cats, squirrels, butterflies]) s.dispose();
      group.clear();
    },
  };
}
