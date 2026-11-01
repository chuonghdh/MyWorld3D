// City trees from the Quaternius GLBs. Loads the six types once per wind-uniform object, then builds the instanced
// field for the layout. The field is an empty group until the GLBs arrive, so nothing waits on the network and the
// first frame is not blocked. If the GLBs fail to load, the procedural trees stand in (a visible city, not an empty one).
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CityLayout } from '../city/layout';
import type { Season } from '../core/types';
import { createTreeField, type TreeField } from '../environment/forest';
import type { WindUniforms } from '../environment/trees';
import type { TreeOverride } from '../store';
import {
  createNatureTreeField,
  NATURE_TYPES,
  natureAssetFromGltf,
  natureItems,
  type NatureAsset,
  type NatureOverrides,
} from '../streets/natureTrees';
import { hashId } from './runtime';

/** Store species overrides mapped to NATURE_TYPES indices: a tree picks one matching type by its id hash. */
export function natureOverridesFor(treeOverrides: Record<string, TreeOverride>): NatureOverrides {
  const types: Record<string, number> = {};
  for (const [id, ov] of Object.entries(treeOverrides)) {
    if (!ov.species) continue;
    const candidates = NATURE_TYPES.flatMap((t, i) => (t.species === ov.species ? [i] : []));
    if (candidates.length > 0) types[id] = candidates[Math.floor(hashId(id) * candidates.length)];
  }
  return { types };
}

/** Scale of the procedural fallback trees, as the scene used before the Quaternius trees. */
const FALLBACK_TREE_SCALE = 1.35;

const assetCache = new WeakMap<WindUniforms, Promise<NatureAsset[]>>();

function loadTexture(loader: THREE.TextureLoader, name: string): Promise<THREE.Texture> {
  return loader.loadAsync(`/models/quaternius/textures/${name}`).then((t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Loads all six types with their textures and sway materials. Memoised per uniforms object. */
export function loadNatureAssets(uniforms: WindUniforms): Promise<NatureAsset[]> {
  let p = assetCache.get(uniforms);
  if (!p) {
    const gltfLoader = new GLTFLoader();
    const texLoader = new THREE.TextureLoader();
    p = Promise.all(
      NATURE_TYPES.map(async (type) => {
        const [gltf, bark, leaf] = await Promise.all([
          gltfLoader.loadAsync(`/models/quaternius/${type.file}.glb`),
          loadTexture(texLoader, type.barkTex),
          loadTexture(texLoader, type.leafTex),
        ]);
        return natureAssetFromGltf(type, gltf, { bark, leaf }, uniforms);
      }),
    );
    assetCache.set(uniforms, p);
  }
  return p;
}

/** Field for the layout's city trees; empty until the GLBs load, procedural trees if they fail. */
export function useNatureTrees({
  layout,
  seed,
  uniforms,
  season,
  treeOverrides,
}: {
  layout: CityLayout;
  seed: number;
  uniforms: WindUniforms;
  season: Season;
  treeOverrides: Record<string, TreeOverride>;
}): TreeField {
  const [assets, setAssets] = useState<NatureAsset[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    loadNatureAssets(uniforms)
      .then((a) => {
        if (alive) setAssets(a);
      })
      .catch((err: unknown) => {
        console.error('[nature trees] load failed', err);
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [uniforms]);

  const overrides = useMemo(() => natureOverridesFor(treeOverrides), [treeOverrides]);
  const field = useMemo(
    () => (assets ? createNatureTreeField(natureItems(layout, seed, overrides), assets, season) : null),
    // Season changes go through setSeason below instead of rebuilding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assets, layout, seed, overrides],
  );
  const procedural = useMemo(
    () =>
      failed
        ? createTreeField(
            layout.streetTrees.map((t) => ({
              id: t.id,
              position: t.position,
              species: treeOverrides[t.id]?.species ?? t.species,
              scale: t.scale * FALLBACK_TREE_SCALE,
            })),
            { season, uniforms, seed },
          )
        : null,
    // Season changes go through setSeason below instead of rebuilding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [failed, layout, treeOverrides, uniforms, seed],
  );
  const empty = useMemo(() => createNatureTreeField([], [], season), [season]);
  const active = field ?? procedural ?? empty;
  useEffect(() => active.setSeason(season), [active, season]);
  useEffect(() => {
    return () => {
      if (field) field.dispose();
    };
  }, [field]);
  useEffect(() => {
    return () => {
      if (procedural) procedural.dispose();
    };
  }, [procedural]);
  useEffect(() => () => empty.dispose(), [empty]);
  return active;
}
