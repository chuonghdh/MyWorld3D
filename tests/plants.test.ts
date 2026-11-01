import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createRng } from '../src/core/rng';
import {
  blossomShare,
  bloomOpenness,
  chooseVariant,
  colorSpread,
  particleProfile,
  particleTarget,
  treeTint,
  treeVariation,
} from '../src/environment/seasons';
import { createStreetFlora, plazaMarginOf, type FloraTree } from '../src/environment/streetflora';
import { createCourtyardGreenery, setGreenerySeason } from '../src/environment/greenery';
import { createTreeField } from '../src/environment/forest';
import { createWindUniforms } from '../src/environment/trees';
import { LeafSystem, MAX_LEAVES } from '../src/environment/leaves';

describe('blossom and species', () => {
  it('only blossoms in spring and never on ginkgo', () => {
    for (const season of ['summer', 'autumn', 'winter'] as const) {
      expect(blossomShare('maple', season)).toBeNull();
    }
    expect(blossomShare('ginkgo', 'spring')).toBeNull();
    expect(blossomShare('maple', 'spring')?.color).toBe('pink');
    expect(blossomShare('birch', 'spring')?.color).toBe('white');
  });

  it('chooses crown variants in range for every roll', () => {
    expect(chooseVariant(0, 4)).toBe(0);
    expect(chooseVariant(0.999999, 4)).toBe(3);
    expect(chooseVariant(1, 4)).toBe(3);
  });
});

describe('per-tree variation', () => {
  it('is deterministic and bounded', () => {
    const a = treeVariation(createRng(5));
    const b = treeVariation(createRng(5));
    expect(a).toEqual(b);
    expect(a.width).toBeGreaterThan(0.85);
    expect(a.width).toBeLessThan(1.15);
    expect(Math.abs(a.leanX)).toBeLessThanOrEqual(0.05);
  });

  it('tint varies more in autumn than in summer and is neutral in winter', () => {
    const v = { ...treeVariation(createRng(2)), light: 1, hue: 1 };
    expect(colorSpread('autumn')).toBeGreaterThan(colorSpread('summer'));
    const [rA, , bA] = treeTint(v, 'autumn');
    const [rS, , bS] = treeTint(v, 'summer');
    expect(rA - bA).toBeGreaterThan(rS - bS);
    expect(treeTint(v, 'winter')).toEqual([1, 1, 1]);
  });
});

describe('seasonal particles', () => {
  it('picks petals, pollen, leaves and nothing by season', () => {
    expect(particleProfile('spring').kind).toBe('petal');
    expect(particleProfile('summer').kind).toBe('pollen');
    expect(particleProfile('autumn').kind).toBe('leaf');
    expect(particleProfile('winter').kind).toBe('none');
    expect(particleTarget('winter', 600)).toBe(0);
    expect(particleTarget('autumn', 600)).toBe(600);
    expect(particleTarget('summer', 600)).toBeLessThan(particleTarget('spring', 600));
    expect(particleProfile('spring').sizeScale).toBeLessThan(particleProfile('autumn').sizeScale);
  });

  it('LeafSystem spawns petals in spring, nothing in winter, and stays within the cap', () => {
    const run = (season: 'spring' | 'summer' | 'autumn' | 'winter') => {
      const sys = new LeafSystem({ bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, seed: 4 });
      sys.setTreePoints([
        { x: 0, z: 0 },
        { x: 10, z: 10 },
      ]);
      for (let i = 0; i < 400; i++) sys.update(0.05, { x: 0.5, z: 0 }, { leafAmount: 1, leafSize: 1, season });
      const n = sys.activeCount();
      const kind = sys.particleKind();
      sys.dispose();
      return { n, kind };
    };
    const spring = run('spring');
    expect(spring.kind).toBe('petal');
    expect(spring.n).toBeGreaterThan(50);
    expect(spring.n).toBeLessThanOrEqual(MAX_LEAVES);
    expect(run('winter').n).toBe(0);
    const summer = run('summer');
    expect(summer.n).toBeGreaterThan(0);
    expect(summer.n).toBeLessThanOrEqual(Math.floor(MAX_LEAVES * particleProfile('summer').density));
  });
});

describe('tree field plants', () => {
  const trees = Array.from({ length: 80 }, (_, i) => ({
    id: 't' + i,
    position: { x: (i % 10) * 8, z: Math.floor(i / 10) * 8 },
    species: (['maple', 'oak', 'birch', 'ginkgo'] as const)[i % 4],
    scale: 1.2,
  }));

  it('spring maple crowns carry pink blossom and winter adds no draw calls', () => {
    const field = createTreeField(trees, { season: 'summer', uniforms: createWindUniforms(), seed: 2 });
    const before = field.group.children.length;
    const crown = field.group.getObjectByName('tree-crown-maple-0') as THREE.InstancedMesh;
    field.setSeason('spring');
    const arr = crown.geometry.getAttribute('color').array;
    let pinkish = 0;
    for (let i = 0; i < arr.length; i += 3) if (arr[i] > arr[i + 1] * 1.1) pinkish++;
    expect(pinkish).toBeGreaterThan(20);
    field.setSeason('winter');
    expect(field.group.children.length).toBe(before);
    expect(crown.instanceColor).not.toBeNull();
    field.dispose();
  });

  it('per-instance tints differ between trees of one species', () => {
    const field = createTreeField(trees, { season: 'autumn', uniforms: createWindUniforms(), seed: 2 });
    const crown = field.group.getObjectByName('tree-crown-oak-0') as THREE.InstancedMesh;
    const seen = new Set<string>();
    const c = new THREE.Color();
    for (let i = 0; i < crown.count; i++) {
      crown.getColorAt(i, c);
      seen.add(c.getHexString());
    }
    expect(seen.size).toBeGreaterThan(Math.min(3, crown.count - 1));
    field.dispose();
  });
});

describe('street flora', () => {
  const trees: FloraTree[] = [
    { position: { x: 0, z: 0 }, species: 'oak', scale: 1.5, setting: 'street' },
    { position: { x: 10, z: 0 }, species: 'birch', scale: 1.3, setting: 'plaza' },
    { position: { x: 20, z: 0 }, species: 'maple', scale: 1.3, setting: 'courtyard' },
  ];
  const plazas = [{ minX: 40, maxX: 80, minZ: 40, maxZ: 80 }];

  it('builds one mesh: pits for street and plaza trees only, plus plaza hedges and beds', () => {
    const f = createStreetFlora(trees, plazas, { season: 'spring', seed: 1 });
    expect(f.stats.pits).toBe(2);
    expect(f.stats.hedgeRuns).toBeGreaterThan(3);
    expect(f.stats.beds).toBeGreaterThan(0);
    const meshes = f.group.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
    expect(meshes.length).toBe(1);
    expect(plazaMarginOf(plazas[0])).toBe(5);
    f.dispose();
  });

  it('is deterministic and recolours by season without changing geometry', () => {
    const a = createStreetFlora(trees, plazas, { season: 'summer', seed: 3 });
    const b = createStreetFlora(trees, plazas, { season: 'summer', seed: 3 });
    const ga = (a.group.children[0] as THREE.Mesh).geometry;
    const gb = (b.group.children[0] as THREE.Mesh).geometry;
    expect(Array.from(ga.getAttribute('position').array)).toEqual(Array.from(gb.getAttribute('position').array));
    const summer = Array.from(ga.getAttribute('color').array);
    const count = ga.getAttribute('position').count;
    a.setSeason('winter');
    expect(ga.getAttribute('position').count).toBe(count);
    expect(Array.from(ga.getAttribute('color').array)).not.toEqual(summer);
    a.setSeason('summer');
    expect(Array.from(ga.getAttribute('color').array)).toEqual(summer);
    expect(bloomOpenness('winter')).toBe(0);
    a.dispose();
    b.dispose();
  });

  it('handles no trees and tiny plazas', () => {
    const f = createStreetFlora([], [{ minX: 0, maxX: 6, minZ: 0, maxZ: 6 }], { season: 'summer' });
    expect(f.group.children.length).toBe(0);
    f.dispose();
  });
});

describe('courtyard greenery seasons', () => {
  it('recolours hedges for winter and back', () => {
    const g = createCourtyardGreenery([{ minX: 0, maxX: 20, minZ: 0, maxZ: 20 }], 5);
    const hedges = g.getObjectByName('greenery-hedges') as THREE.Mesh;
    const summer = Array.from(hedges.geometry.getAttribute('color').array);
    setGreenerySeason(g, 'winter');
    expect(Array.from(hedges.geometry.getAttribute('color').array)).not.toEqual(summer);
    setGreenerySeason(g, 'summer');
    expect(Array.from(hedges.geometry.getAttribute('color').array)).toEqual(summer);
  });
});
