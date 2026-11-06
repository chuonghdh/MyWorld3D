// Map-view keyboard moves for the orbit branch of CameraRig: Up/Down moves the camera along its view,
// Left/Right and W/S turn the view about the camera. The orbit pivot is never changed here.
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { uiCamera } from '../config/tuning';
import { PAN_MARGIN, type Bounds, type V3 } from './cameraMath';
import { mapLookAxes, mapLookStep, mapMoveSpeedAt, moveCameraAlong } from './pivotMath';

/**
 * Applies one frame of map keys. `mv` is the Up/Down axis (-1, 0, 1) and `lookOverride` the view direction
 * (null = look at the pivot). Orbit controls are disabled while a key is held, so damping cannot pull back.
 */
export function applyMapKeys(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControlsImpl,
  keys: ReadonlySet<string>,
  mv: number,
  lookOverride: { current: V3 | null },
  bounds: Bounds,
  dt: number,
): void {
  // Map Up/Down: only the camera moves, along its view direction. The orbit target is not changed.
  if (mv) {
    const dirV = new THREE.Vector3();
    camera.getWorldDirection(dirV);
    const p = moveCameraAlong(
      [camera.position.x, camera.position.y, camera.position.z],
      [dirV.x, dirV.y, dirV.z],
      mv * mapMoveSpeedAt(camera.position.y, {
        low: uiCamera.mapMoveSpeedLow,
        high: uiCamera.mapMoveSpeedHigh,
        lowHeight: uiCamera.mapMoveSpeedLowHeight,
        highHeight: uiCamera.mapMoveSpeedHighHeight,
      }) * dt,
      { groundY: 0, bounds, margin: -PAN_MARGIN },
    );
    camera.position.set(p[0], p[1], p[2]);
  }
  // Map Left/Right and W/S: turn the view about the camera. The camera position and the orbit pivot stay.
  // The start direction is the camera's own view direction, never the pivot.
  const la = mapLookAxes(keys);
  // Keyboard move or look pauses OrbitControls (enabled off): its damping cannot pull the camera back to the pivot.
  controls.enabled = !(mv || la.turn || la.look);
  if (la.turn || la.look) {
    let base: V3 | null = lookOverride.current;
    if (!base) {
      const dirL = new THREE.Vector3();
      camera.getWorldDirection(dirL);
      base = [dirL.x, dirL.y, dirL.z];
    }
    lookOverride.current = mapLookStep(base, la, dt);
  }
  if (lookOverride.current) {
    const l = lookOverride.current;
    camera.lookAt(camera.position.x + l[0], camera.position.y + l[1], camera.position.z + l[2]);
  }
}
