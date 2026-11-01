// Sign material: textured panels from the canvas atlas (atlas.ts), glowing at night.
import * as THREE from 'three';
import { getSignAtlasTexture } from './atlas';
import { WIND_VERTEX_ATTR_SIGN, WIND_VERTEX_COMMON, WIND_VERTEX_MAIN_SIGN, windUniforms } from '../shaders/wind';
import { buildings } from '../../config/tuning';

export * from './layout';

let signMaterial: THREE.MeshStandardMaterial | null = null;

const SIGN_NIGHT_EMISSIVE = buildings.signNightEmissive;

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
    // Blade signs swing in the wind: the per-vertex aWind attribute is (0, 0) on fixed signs.
    signMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uWTime = windUniforms.uWTime;
      shader.uniforms.uWWind = windUniforms.uWWind;
      shader.uniforms.uWGust = windUniforms.uWGust;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
${WIND_VERTEX_ATTR_SIGN}
${WIND_VERTEX_COMMON}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
${WIND_VERTEX_MAIN_SIGN}`);
    };
    signMaterial.customProgramCacheKey = () => 'building-sign-v2';
  }
  return signMaterial;
}

/** Turns sign glow on or off with the street lights. */
export function setSignNight(on: boolean): void {
  getSignMaterial().emissiveIntensity = on ? SIGN_NIGHT_EMISSIVE : 0;
}
