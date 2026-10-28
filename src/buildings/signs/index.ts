// Sign material: textured panels from the canvas atlas (atlas.ts), glowing at night.
import * as THREE from 'three';
import { getSignAtlasTexture } from './atlas';

export * from './layout';

let signMaterial: THREE.MeshStandardMaterial | null = null;

const SIGN_NIGHT_EMISSIVE = 1.0;

/** Shared material for all shop signs. Without a canvas (node) it has no map. */
export function getSignMaterial(): THREE.MeshStandardMaterial {
  if (!signMaterial) {
    const map = getSignAtlasTexture();
    signMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.6,
      metalness: 0,
      map: map ?? null,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: map ?? null,
      emissiveIntensity: 0,
    });
    signMaterial.name = 'building-sign';
  }
  return signMaterial;
}

/** Turns sign glow on or off with the street lights. */
export function setSignNight(on: boolean): void {
  getSignMaterial().emissiveIntensity = on ? SIGN_NIGHT_EMISSIVE : 0;
}
