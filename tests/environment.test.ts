import { describe, expect, it } from 'vitest';
import { getSunDirection, DEFAULT_LOCATION } from '../src/environment/sun';
import { gustStrength, windVector, type GustEvent } from '../src/environment/wind';
import * as THREE from 'three';
import { createFoliageMaterial, createWindUniforms, seasonLeafColor } from '../src/environment/trees';
import { CROWN_VARIANTS, createTreeField } from '../src/environment/forest';
import { createCourtyardGreenery } from '../src/environment/greenery';
import type { TreeSpecies } from '../src/core/types';

const SPRING_EQUINOX = { year: 2026, month: 3, day: 20 };
const SPECIES: TreeSpecies[] = ['maple', 'oak', 'birch', 'ginkgo'];

describe('sun', () => {
  it('is above the horizon at noon and below it at midnight (Hanoi)', () => {
    const noon = getSunDirection(12, { date: SPRING_EQUINOX, location: DEFAULT_LOCATION });
    const midnight = getSunDirection(0, { date: SPRING_EQUINOX, location: DEFAULT_LOCATION });
    expect(noon.altitudeDeg).toBeGreaterThan(0);
    expect(midnight.altitudeDeg).toBeLessThan(0);
  });

  it('returns a unit direction vector', () => {
    const s = getSunDirection(9, { date: SPRING_EQUINOX });
    expect(Math.hypot(s.x, s.y, s.z)).toBeCloseTo(1, 6);
  });
});

describe('seasonLeafColor', () => {
  it.each(SPECIES)('%s has different autumn and summer colours', (species) => {
    const autumn = seasonLeafColor(species, 'autumn').getHex();
    const summer = seasonLeafColor(species, 'summer').getHex();
    expect(autumn).not.toBe(summer);
  });
});

describe('windVector', () => {
  it('magnitude scales linearly with base speed', () => {
    const slow = windVector(5, { speed: 2, direction: 45 });
    const fast = windVector(5, { speed: 6, direction: 45 });
    const magSlow = Math.hypot(slow.x, slow.z);
    const magFast = Math.hypot(fast.x, fast.z);
    expect(magFast / magSlow).toBeCloseTo(3, 6);
  });

  it('0 degrees blows towards north (-z), 90 towards east (+x)', () => {
    const north = windVector(0, { speed: 3, direction: 0 });
    expect(north.x).toBeCloseTo(0, 6);
    expect(north.z).toBeLessThan(0);
    const east = windVector(0, { speed: 3, direction: 90 });
    expect(east.x).toBeGreaterThan(0);
    expect(east.z).toBeCloseTo(0, 6);
  });
});

describe('gustStrength', () => {
  const gusts: GustEvent[] = [{ start: 10, peak: 3 }];

  it('is zero before a gust and rises after it starts', () => {
    expect(gustStrength(9, gusts)).toBe(0);
    expect(gustStrength(10.3, gusts)).toBeGreaterThan(0);
  });

  it('decays after the gust peak and returns to near zero', () => {
    const early = gustStrength(12, gusts);
    const late = gustStrength(20, gusts);
    expect(late).toBeLessThan(early);
    expect(gustStrength(60, gusts)).toBeLessThan(0.01);
  });
});

describe('createTreeField', () => {
  const makeTrees = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: 'tree-' + i,
      position: { x: (i % 20) * 8 - 80, z: Math.floor(i / 20) * 8 - 40 },
      species: SPECIES[i % SPECIES.length],
      scale: 0.9 + (i % 5) * 0.05,
    }));
  const meshesOf = (g: THREE.Object3D) => g.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh);

  it('instances 200 trees in few draw calls with counts matching the tree parts', () => {
    const trees = makeTrees(200);
    const field = createTreeField(trees, { season: 'autumn', uniforms: createWindUniforms(), seed: 3 });
    const meshes = meshesOf(field.group);
    expect(meshes.length).toBe(field.group.children.length);
    expect(meshes.length).toBeLessThanOrEqual(4 * (2 + CROWN_VARIANTS));
    const visible = meshes.filter((m) => m.visible);
    expect(visible.length).toBeLessThan(20);
    const sum = (prefix: string) => meshes.filter((m) => m.name.startsWith(prefix)).reduce((a, m) => a + m.count, 0);
    expect(sum('tree-trunk')).toBe(200);
    expect(sum('tree-crown')).toBe(200);
    expect(sum('tree-bare')).toBe(200);
    field.dispose();
  });

  it('maps an instance back to its tree id', () => {
    const trees = makeTrees(40);
    const field = createTreeField(trees, { season: 'summer', uniforms: createWindUniforms() });
    const seen = new Set<string>();
    for (const m of meshesOf(field.group).filter((x) => x.name.startsWith('tree-crown'))) {
      for (let i = 0; i < m.count; i++) {
        const id = field.treeIdAt(m, i);
        expect(id).not.toBeNull();
        const tree = trees.find((t) => t.id === id)!;
        const mat = new THREE.Matrix4();
        m.getMatrixAt(i, mat);
        const p = new THREE.Vector3().setFromMatrixPosition(mat);
        expect(p.x).toBeCloseTo(tree.position.x, 5);
        expect(p.z).toBeCloseTo(tree.position.z, 5);
        expect(m.name).toContain(tree.species);
        seen.add(id!);
      }
    }
    expect(seen.size).toBe(40);
    expect(field.treeIdAt(new THREE.Object3D(), 0)).toBeNull();
    field.dispose();
  });

  it('winter hides crowns and shows bare branches', () => {
    const field = createTreeField(makeTrees(20), { season: 'summer', uniforms: createWindUniforms() });
    const meshes = meshesOf(field.group);
    const crowns = meshes.filter((m) => m.name.startsWith('tree-crown'));
    const bare = meshes.filter((m) => m.name.startsWith('tree-bare'));
    expect(crowns.every((m) => m.visible)).toBe(true);
    expect(bare.every((m) => !m.visible)).toBe(true);
    field.setSeason('winter');
    expect(crowns.every((m) => !m.visible)).toBe(true);
    expect(bare.every((m) => m.visible)).toBe(true);
    field.setSeason('autumn');
    expect(crowns.every((m) => m.visible)).toBe(true);
    field.dispose();
  });

  it('crown variants differ and autumn recolours them', () => {
    const field = createTreeField(makeTrees(80), { season: 'summer', uniforms: createWindUniforms() });
    const a = field.group.getObjectByName('tree-crown-maple-0') as THREE.InstancedMesh;
    const b = field.group.getObjectByName('tree-crown-maple-1') as THREE.InstancedMesh;
    expect(a && b).toBeTruthy();
    const pa = a.geometry.getAttribute('position');
    const pb = b.geometry.getAttribute('position');
    const differs = pa.count !== pb.count || Array.from(pa.array).some((v, i) => Math.abs(v - (pb.array[i] as number)) > 1e-3);
    expect(differs).toBe(true);
    // Crowns stay within the street-tree envelope (radius 2-3.5 m, height up to ~9 m).
    a.geometry.computeBoundingBox();
    const box = a.geometry.boundingBox!;
    expect(box.max.y).toBeGreaterThan(6);
    expect(box.max.y).toBeLessThan(9.5);
    expect(box.max.x - box.min.x).toBeGreaterThan(4);
    expect(box.max.x - box.min.x).toBeLessThan(7.5);
    const summer = Array.from(a.geometry.getAttribute('color').array);
    field.setSeason('autumn');
    const autumn = Array.from(a.geometry.getAttribute('color').array);
    // Autumn maple is red-dominant: red channel on average above green.
    let r = 0;
    let g = 0;
    for (let i = 0; i < autumn.length; i += 3) {
      r += autumn[i];
      g += autumn[i + 1];
    }
    expect(r).toBeGreaterThan(g);
    expect(autumn).not.toEqual(summer);
    field.dispose();
  });

  it('foliage material keeps the legacy signature', () => {
    const m = createFoliageMaterial({ species: 'oak', season: 'summer', uniforms: createWindUniforms() });
    expect(m.color.getHex()).toBe(seasonLeafColor('oak', 'summer').getHex());
    expect(typeof m.onBeforeCompile).toBe('function');
  });
});

describe('createCourtyardGreenery', () => {
  it('builds hedges, beds and bushes for 3 courtyards in a few draw calls', () => {
    const courts = [
      { minX: -20, maxX: 0, minZ: -20, maxZ: 0 },
      { minX: 10, maxX: 34, minZ: -12, maxZ: 6 },
      { minX: -30, maxX: -14, minZ: 10, maxZ: 26 },
    ];
    const g = createCourtyardGreenery(courts, 7);
    const meshes = g.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.length).toBeLessThanOrEqual(3);
    expect(meshes.map((m) => m.name).sort()).toEqual(['greenery-beds', 'greenery-bushes', 'greenery-hedges']);
    for (const m of meshes) {
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox!;
      expect(bb.min.x).toBeGreaterThanOrEqual(-30);
      expect(bb.max.x).toBeLessThanOrEqual(34);
      expect(bb.min.y).toBeGreaterThanOrEqual(-0.25); // bushes sit slightly sunk into the lawn
      expect(bb.max.y).toBeLessThan(2);
    }
  });

  it('is deterministic and tolerates tiny courtyards', () => {
    const c = [{ minX: 0, maxX: 2, minZ: 0, maxZ: 2 }];
    expect(createCourtyardGreenery(c, 1).children.length).toBe(0);
    const big = [{ minX: 0, maxX: 20, minZ: 0, maxZ: 20 }];
    const a = createCourtyardGreenery(big, 5).children[0] as THREE.Mesh;
    const b = createCourtyardGreenery(big, 5).children[0] as THREE.Mesh;
    expect(Array.from(a.geometry.getAttribute('position').array)).toEqual(
      Array.from(b.geometry.getAttribute('position').array),
    );
  });
});
