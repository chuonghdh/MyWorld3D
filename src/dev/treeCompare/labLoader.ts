// LAB COPY of the city's loadNatureAssets (src/scene/useNatureTrees.ts), without the React hook. Cloned so lab edits
// never reach the city. Builds the six types through the lab's own natureAssetFromGltf (labNatureTrees.ts).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { WindUniforms } from '../../environment/trees';
import { natureAssetFromGltf, NATURE_TYPES, type NatureAsset } from './labNatureTrees';

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
