// Falling-leaf meshes: outline, main vein and the near-camera shrink shared by the leaf and vein materials.

import * as THREE from 'three';
import { skyEnvironment } from '../config/tuning';

/** Distance in metres from the camera within which leaves fade out by shrinking. */
const LEAF_NEAR_FADE = skyEnvironment.leaves.nearFadeM;
/** Leaf silhouette scale (outline, curl, bend and vein together): 70% of the earlier 1.3 x size (about 0.29 m by 0.35 m). */
const LEAF_SCALE = skyEnvironment.leaves.leafScale;
/** Edge lift along the midrib at the outer edge, metres before LEAF_SCALE. */
const LEAF_CURL = 0.05;
/** Lengthwise bend towards the concave (upper) side, metres at the tip and stem ends, before LEAF_SCALE. */
const LEAF_BEND = 0.04;
/** Vein lift above the crest, metres before LEAF_SCALE. */
const VEIN_LIFT = 0.006;

/** Lengthwise bend along leaf-local y (midrib centre at y = -0.06): tip and stem lift, the middle stays down. */
function leafBendZ(y: number): number {
  const u = (y + 0.06) / 0.19;
  return LEAF_BEND * Math.min(1, u * u);
}

/** Leaf outline with a notched tip, a stem at the base, a fold along the midrib and a bend along its length. */
export function leafGeometry(): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -0.25);
  s.bezierCurveTo(0.15, -0.15, 0.16, 0.05, 0.05, 0.13);
  s.lineTo(0, 0.07);
  s.lineTo(-0.05, 0.13);
  s.bezierCurveTo(-0.16, 0.05, -0.15, -0.15, 0, -0.25);
  const geo = new THREE.ShapeGeometry(s, 4);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, (LEAF_CURL * Math.abs(pos.getX(i))) / 0.16 + leafBendZ(pos.getY(i)));
  }
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) * LEAF_SCALE, pos.getY(i) * LEAF_SCALE, pos.getZ(i) * LEAF_SCALE);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Main vein: a thin brown strip down the midrib, following the leaf's bend and lifted just above the crest. */
export function veinGeometry(): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(0.012, 0.32, 1, 10);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) - 0.06;
    pos.setXYZ(i, pos.getX(i) * LEAF_SCALE, y * LEAF_SCALE, (leafBendZ(y) + VEIN_LIFT) * LEAF_SCALE);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** Shrinks each instance to nothing near the camera (see LEAF_NEAR_FADE). Shared by the leaf and vein meshes. */
export function applyNearFade(material: THREE.MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 leafWorld = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float leafDist = distance(leafWorld, cameraPosition);
  transformed *= smoothstep(${LEAF_NEAR_FADE.toFixed(1)} * 0.35, ${LEAF_NEAR_FADE.toFixed(1)}, leafDist);
#endif`,
    );
  };
  material.customProgramCacheKey = () => 'leaf-near-fade-v1';
}
