// Renders the House panel type thumbnails with the main renderer, one preset per frame after the UI requested them
// (scene/houseThumbs.ts). Own scene and lights (warm key + sky fill, no fog, no shadows), transparent background,
// 3/4 front view from slightly above. The scene pass goes into an MSAA half-float target, then OutputPass applies the
// app's tone mapping and colour space (the same pass the composer ends with), so colours match the town.
// Every renderer setting touched is restored after the preset. Paused while filming.
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { HOUSE_PRESETS, buildHousePreview, disposeHousePreview, housePreviewBounds } from '../buildings';
import { sceneQa } from '../config/tuning';
import { useWorldStore } from '../store';
import { flipAndUnpremultiply, frameThumbCamera, nextThumbPreset, storeHouseThumb, useHouseThumbs, type Vec3 } from './houseThumbs';

const KEY_COLOR = 0xfff0d8;
const SKY_COLOR = 0xf4f1ea;
const GROUND_COLOR = 0x8a7a66;

interface Kit {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  key: THREE.DirectionalLight;
  sceneTarget: THREE.WebGLRenderTarget;
  outTarget: THREE.WebGLRenderTarget;
  output: OutputPass;
  pixels: Uint8Array;
  canvas: HTMLCanvasElement;
  image: ImageData;
}

function createKit(size: number): Kit {
  const t = sceneQa.houseThumbs;
  const scene = new THREE.Scene();
  const key = new THREE.DirectionalLight(KEY_COLOR, t.thumbKeyIntensity);
  scene.add(key, key.target, new THREE.HemisphereLight(SKY_COLOR, GROUND_COLOR, t.thumbFillIntensity));
  const camera = new THREE.PerspectiveCamera(t.thumbFovDeg, 1, 0.1, 1000);
  const sceneTarget = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, samples: 4 });
  const outTarget = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType });
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return {
    scene,
    camera,
    key,
    sceneTarget,
    outTarget,
    output: new OutputPass(),
    pixels: new Uint8Array(size * size * 4),
    canvas,
    image: new ImageData(size, size),
  };
}

function disposeKit(k: Kit): void {
  k.sceneTarget.dispose();
  k.outTarget.dispose();
  k.output.dispose();
}

const _clear = new THREE.Color();
const _key = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const KEY_SWING_RAD = (-50 * Math.PI) / 180;

/** Renders one group framed on its box (min/max in the group's space) and returns a PNG data URL. */
function renderGroup(gl: THREE.WebGLRenderer, k: Kit, house: THREE.Group, boxMin: Vec3, boxMax: Vec3): string {
  const t = sceneQa.houseThumbs;
  k.scene.add(house);
  try {
    const f = frameThumbCamera(boxMin, boxMax, {
      fovDeg: t.thumbFovDeg,
      azimuthDeg: t.thumbAzimuthDeg,
      elevationDeg: t.thumbElevationDeg,
      margin: t.thumbMargin,
    });
    k.camera.position.set(...f.position);
    k.camera.near = f.near;
    k.camera.far = f.far;
    k.camera.updateProjectionMatrix();
    k.camera.lookAt(...f.target);
    // Key light: the camera direction swung 50 degrees to the left and raised, aimed at the house centre.
    _key.set(f.position[0] - f.target[0], 0, f.position[2] - f.target[2]).applyAxisAngle(_up, KEY_SWING_RAD);
    _key.y = (f.position[1] - f.target[1]) + _key.length();
    k.key.position.set(f.target[0] + _key.x, f.target[1] + _key.y, f.target[2] + _key.z);
    k.key.target.position.set(...f.target);
    k.key.target.updateMatrixWorld();

    const prevTarget = gl.getRenderTarget();
    gl.getClearColor(_clear);
    const prevAlpha = gl.getClearAlpha();
    const prevAutoClear = gl.autoClear;
    const prevShadowNeeds = gl.shadowMap.needsUpdate;
    try {
      gl.autoClear = true;
      gl.setClearColor(0x000000, 0);
      gl.setRenderTarget(k.sceneTarget);
      gl.render(k.scene, k.camera);
      // Tone mapping and colour space from the renderer, as the composer's last pass does.
      k.output.render(gl, k.outTarget, k.sceneTarget, 0, false);
      gl.readRenderTargetPixels(k.outTarget, 0, 0, k.outTarget.width, k.outTarget.height, k.pixels);
    } finally {
      gl.setRenderTarget(prevTarget);
      gl.setClearColor(_clear, prevAlpha);
      gl.autoClear = prevAutoClear;
      gl.shadowMap.needsUpdate = prevShadowNeeds;
    }
    flipAndUnpremultiply(k.pixels, k.outTarget.width, k.outTarget.height, k.image.data);
    k.canvas.getContext('2d')!.putImageData(k.image, 0, 0);
    return k.canvas.toDataURL('image/png');
  } finally {
    k.scene.remove(house);
    disposeHousePreview(house);
  }
}

function renderThumb(gl: THREE.WebGLRenderer, k: Kit, preset: (typeof HOUSE_PRESETS)[number]): string {
  const house = buildHousePreview(preset);
  const b = housePreviewBounds(house);
  return renderGroup(gl, k, house, b.min.toArray(), b.max.toArray());
}

export function HouseThumbRenderer() {
  const gl = useThree((s) => s.gl);
  const kit = useRef<Kit | null>(null);

  useEffect(
    () => () => {
      if (kit.current) disposeKit(kit.current);
      kit.current = null;
    },
    [gl],
  );

  useFrame(() => {
    if (useWorldStore.getState().toggles.filming) return;
    const preset = nextThumbPreset(HOUSE_PRESETS, useHouseThumbs.getState());
    if (!preset) {
      // All done: free the targets until the next request.
      if (kit.current) {
        disposeKit(kit.current);
        kit.current = null;
      }
      return;
    }
    kit.current ??= createKit(sceneQa.houseThumbs.thumbSizePx);
    try {
      storeHouseThumb(preset, renderThumb(gl, kit.current, preset));
    } catch (err) {
      // Never retry every frame: store an empty entry so the UI keeps its placeholder.
      storeHouseThumb(preset, '');
      console.error(`[house thumbs] ${preset}:`, err);
    }
  });

  return null;
}
