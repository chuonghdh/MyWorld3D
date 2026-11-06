// Panel-aware framing: shifts the overview picture (camera view offset) so the town sits in the free area
// between the side panels. Per-frame step extracted from CameraRig; behaviour unchanged.
import type * as THREE from 'three';
import { uiCamera } from '../config/tuning';
import { stepViewShift, viewShiftTarget, type ShiftState } from './cameraMath';
import { measureLeftInset, measureRightInset } from './cameraDom';

/** Refs owned by CameraRig: the animated shift and the offset last given to the camera (null = cleared). */
export interface ViewShiftRefs {
  shift: { current: ShiftState };
  applied: { current: { w: number; h: number; x: number } | null };
}

/**
 * One frame of the panel view offset. Overview glides the shift to the free area (real frame time, also while
 * paused). Filming hides the panels: the offset is cleared at once so the film starts centred.
 */
export function stepPanelViewOffset(
  camera: THREE.PerspectiveCamera,
  dom: HTMLCanvasElement,
  overview: boolean,
  filming: boolean,
  dt: number,
  refs: ViewShiftRefs,
): void {
  const w = dom.clientWidth;
  const h = dom.clientHeight;
  if (filming || w <= 0 || h <= 0) {
    refs.shift.current = { x: 0, v: 0 };
    if (refs.applied.current) {
      camera.clearViewOffset();
      refs.applied.current = null;
    }
    return;
  }
  const target = overview ? viewShiftTarget(measureLeftInset(), measureRightInset()) : 0;
  refs.shift.current = stepViewShift(refs.shift.current, target, dt, uiCamera.panelShiftSeconds);
  const x = refs.shift.current.x;
  const a = refs.applied.current;
  if (x === 0 && target === 0) {
    if (a) {
      camera.clearViewOffset();
      refs.applied.current = null;
    }
  } else if (!a || a.w !== w || a.h !== h || Math.abs(a.x - x) > 0.01) {
    camera.setViewOffset(w, h, x, 0, w, h);
    refs.applied.current = { w, h, x };
  }
}
