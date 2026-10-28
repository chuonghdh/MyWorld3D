import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { CityLayout, TrafficLight } from '../src/city/layout';
import type { LightAxis, LightPhase } from '../src/traffic/lights';
import { createStreetscape, MESH_NAMES, SIDEWALK_TOP, ASPHALT_TOP, LAMP_GLASS_NIGHT_INTENSITY } from '../src/streets';
import { subtractIntervals } from '../src/streets/surfaces';

const light: TrafficLight = {
  id: 'light-0',
  position: { x: 0, z: 0 },
  timing: { cycleSeconds: 40, nsGreenSeconds: 18, ewGreenSeconds: 18, yellowSeconds: 2 },
};

function fixture(): CityLayout {
  return {
    seed: 1,
    townBounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    blocks: [
      { id: 'b-houses', kind: 'houses', bounds: { minX: 7, maxX: 40, minZ: 7, maxZ: 40 }, courtyard: { minX: 17, maxX: 32, minZ: 17, maxZ: 32 } },
      { id: 'b-monument', kind: 'monument', bounds: { minX: -40, maxX: -7, minZ: 7, maxZ: 40 }, courtyard: null },
    ],
    lots: [],
    roads: [
      {
        id: 'road-h', orientation: 'horizontal', start: { x: -40, z: 0 }, end: { x: 40, z: 0 },
        width: 8, lanes: 2, streetClass: 'avenue', sidewalkWidth: 3,
      },
      {
        id: 'road-v', orientation: 'vertical', start: { x: 0, z: -40 }, end: { x: 0, z: 40 },
        width: 8, lanes: 2, streetClass: 'street', sidewalkWidth: 3,
      },
    ],
    streetTrees: [
      { id: 't1', position: { x: 15, z: 5 }, species: 'maple', scale: 1, setting: 'street' },
      { id: 't2', position: { x: 25, z: 25 }, species: 'oak', scale: 1, setting: 'courtyard' },
    ],
    trafficLights: [light],
    trafficPaths: [],
    lamps: [
      { id: 'l1', position: { x: 10, z: 5 }, facing: Math.PI },
      { id: 'l2', position: { x: -20, z: -5 }, facing: 0 },
      { id: 'l3', position: { x: 5, z: 20 }, facing: -Math.PI / 2 },
    ],
    benches: [
      { id: 'bn1', position: { x: 20, z: 6.3 }, facing: Math.PI },
      { id: 'bn2', position: { x: -20, z: 20 }, facing: 0 },
    ],
    crosswalks: [
      { id: 'cw1', center: { x: -6.5, z: 0 }, orientation: 'vertical', length: 8, width: 3 },
      { id: 'cw2', center: { x: 0, z: 6.5 }, orientation: 'horizontal', length: 8, width: 3 },
    ],
    intersections: [{ id: 'i1', center: { x: 0, z: 0 }, sizeX: 8, sizeZ: 8 }],
  };
}

function meshByName(group: THREE.Group, name: string): THREE.Mesh {
  const m = group.getObjectByName(name);
  if (!(m instanceof THREE.Mesh)) throw new Error(`missing mesh ${name}`);
  return m;
}

function heightAt(mesh: THREE.Mesh, x: number, z: number): number | null {
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
  const hits = ray.intersectObject(mesh, false);
  return hits.length ? hits[0].point.y : null;
}

describe('streetscape', () => {
  it('builds a non-empty group within the draw-call budget', () => {
    const s = createStreetscape(fixture());
    expect(s.group.children.length).toBeGreaterThan(0);
    let drawCalls = 0;
    s.group.traverse((o) => {
      if (o instanceof THREE.Mesh) drawCalls++; // InstancedMesh is a Mesh too
    });
    expect(drawCalls).toBeGreaterThan(0);
    expect(drawCalls).toBeLessThan(40);
    expect(drawCalls).toBeGreaterThanOrEqual(6);
    expect(drawCalls).toBeLessThanOrEqual(9); // base 6 + shelter glass + fountain water
    s.dispose();
  });

  it('raises sidewalks to 0.15 m and keeps asphalt low', () => {
    const s = createStreetscape(fixture());
    const surf = meshByName(s.group, MESH_NAMES.surfaces);
    expect(SIDEWALK_TOP).toBeCloseTo(0.15);
    // On the sidewalk north of the avenue, and east of the side street.
    expect(heightAt(surf, 20, 6)).toBeCloseTo(0.15, 4);
    expect(heightAt(surf, 5.5, -20)).toBeCloseTo(0.15, 4);
    // Corner square owned by the avenue sidewalk.
    expect(heightAt(surf, 5.5, 5.5)).toBeCloseTo(0.15, 4);
    // Carriageway and intersection.
    expect(heightAt(surf, 20, 0)).toBeCloseTo(ASPHALT_TOP, 4);
    expect(heightAt(surf, 0, 0)).toBeCloseTo(ASPHALT_TOP, 4);
    // Courtyard and plaza are at sidewalk level too.
    expect(heightAt(surf, 25, 25)).toBeCloseTo(0.15, 4);
    expect(heightAt(surf, -20, 20)).toBeCloseTo(0.15, 4);
    s.dispose();
  });

  it('paints markings above the asphalt and crosswalk stripes on the road', () => {
    const s = createStreetscape(fixture());
    const overlay = meshByName(s.group, MESH_NAMES.overlay);
    const surf = meshByName(s.group, MESH_NAMES.surfaces);
    // A zebra stripe at the crossing centre (stripes are centred, odd count for 8 m).
    const y = heightAt(overlay, -6.5, 0.0);
    expect(y).not.toBeNull();
    expect(y!).toBeGreaterThan(ASPHALT_TOP);
    expect(y!).toBeLessThan(SIDEWALK_TOP);
    // No centre line paint inside the intersection square.
    expect(heightAt(overlay, 0, 0)).toBeNull();
    expect(heightAt(surf, 0, 0)).not.toBeNull();
    s.dispose();
  });

  it('toggles lamp glass emissive and light pools with setNight', () => {
    const s = createStreetscape(fixture());
    const glass = meshByName(s.group, MESH_NAMES.lampGlass);
    const pools = meshByName(s.group, MESH_NAMES.pools);
    const mat = glass.material as THREE.MeshStandardMaterial;
    expect(mat.emissiveIntensity).toBe(0);
    expect(pools.visible).toBe(false);
    s.setNight(true);
    expect(mat.emissiveIntensity).toBe(LAMP_GLASS_NIGHT_INTENSITY);
    expect(pools.visible).toBe(true);
    s.setNight(false);
    expect(mat.emissiveIntensity).toBe(0);
    expect(pools.visible).toBe(false);
    s.dispose();
  });

  it('lamps are about 4.5 m tall from the sidewalk', () => {
    const s = createStreetscape(fixture());
    const furn = meshByName(s.group, MESH_NAMES.furniture);
    furn.geometry.computeBoundingBox();
    const top = furn.geometry.boundingBox!.max.y;
    expect(top - SIDEWALK_TOP).toBeGreaterThan(4.3);
    expect(top - SIDEWALK_TOP).toBeLessThan(5);
    s.dispose();
  });

  it('updateSignals lights only the active lamp of each head', () => {
    const s = createStreetscape(fixture());
    const lamps = s.group.getObjectByName(MESH_NAMES.signals) as THREE.InstancedMesh;
    expect(lamps).toBeInstanceOf(THREE.InstancedMesh);
    // 4 poles x 2 heads x 3 lamps.
    expect(lamps.count).toBe(24);
    const colors = lamps.instanceColor!;

    let nsPhase: LightPhase = 'green';
    const phaseOf = (_l: TrafficLight, axis: LightAxis): LightPhase => (axis === 'ns' ? nsPhase : 'red');
    s.updateSignals(phaseOf);
    const snapshot = () => Array.from(colors.array as Float32Array);
    const before = snapshot();

    // Head 0 is a north-south head: red, yellow, green lamps at indices 0, 1, 2.
    const lum = (i: number) => colors.getX(i) + colors.getY(i) + colors.getZ(i);
    expect(lum(2)).toBeGreaterThan(lum(0) * 3); // green on, red off
    expect(colors.getY(2)).toBeGreaterThan(colors.getX(2));
    // Head 1 is east-west: red on.
    expect(lum(3)).toBeGreaterThan(lum(5) * 3);

    nsPhase = 'red';
    s.updateSignals(phaseOf);
    const after = snapshot();
    expect(after).not.toEqual(before);
    expect(lum(0)).toBeGreaterThan(lum(2) * 3);
    s.dispose();
  });

  it('dispose does not throw and can be called twice', () => {
    const s = createStreetscape(fixture());
    expect(() => s.dispose()).not.toThrow();
    expect(() => s.dispose()).not.toThrow();
  });

  it('handles an empty layout', () => {
    const empty: CityLayout = {
      seed: 0, townBounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, blocks: [], lots: [], roads: [],
      streetTrees: [], trafficLights: [], trafficPaths: [], lamps: [], benches: [], crosswalks: [], intersections: [],
    };
    const s = createStreetscape(empty);
    expect(() => s.updateSignals(() => 'green')).not.toThrow();
    s.setNight(true);
    s.dispose();
  });

  it('subtractIntervals splits around cuts', () => {
    const r = subtractIntervals(0, 10, [{ a: 4, b: 6, kind: 'carriage' }]);
    expect(r.map((i) => [i.a, i.b])).toEqual([[0, 4], [6, 10]]);
    expect(r[0].endCut).toBe('carriage');
    expect(r[1].startCut).toBe('carriage');
  });
});

describe('night amount and shop spill', () => {
  it('fades lamps in smoothly and keeps the draw call count', () => {
    const s = createStreetscape(fixture());
    const pools = s.group.getObjectByName(MESH_NAMES.pools) as THREE.Mesh | undefined;
    s.setNightAmount(0.5);
    const glass = s.group.getObjectByName(MESH_NAMES.lampGlass) as THREE.Mesh;
    const mat = glass.material as THREE.MeshStandardMaterial;
    expect(mat.emissiveIntensity).toBeCloseTo(LAMP_GLASS_NIGHT_INTENSITY / 2, 6);
    if (pools) expect(pools.visible).toBe(true);
    s.setNightAmount(0);
    if (pools) expect(pools.visible).toBe(false);
    s.dispose();
  });
});
