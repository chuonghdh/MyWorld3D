// Camera input: keyboard shortcuts, orbit interrupts and street-walk drag. Split out of CameraRig.tsx (line cap).
import { useEffect, type MutableRefObject } from 'react';
import { useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { uiCamera } from '../config/tuning';
import { runtime } from './runtime';
import { clampPitch, type CameraPresetId, type V3 } from './cameraMath';
import { isTyping } from './cameraDom';

export interface Tween {
  t: number;
  fromPos: V3;
  toPos: V3;
  fromTarget: V3;
  toTarget: V3;
  /** True when the tween ends in the street walk (orbit controls are off while it runs). */
  toStreet: boolean;
  /** Yaw to adopt on arrival in the street walk. */
  yaw: number;
}

export interface StreetState {
  active: boolean;
  yaw: number;
  pitch: number;
  x: number;
  z: number;
}

const PRESET_KEYS: Record<string, CameraPresetId> = {
  Digit1: 'overview',
  Digit2: 'street',
};

interface CameraInputArgs {
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  tween: MutableRefObject<Tween | null>;
  street: MutableRefObject<StreetState>;
  keys: MutableRefObject<Set<string>>;
  cancelTween: () => void;
  leaveStreet: () => void;
}

export function useCameraInput({ controlsRef, tween, street, keys, cancelTween, leaveStreet }: CameraInputArgs) {
  const gl = useThree((s) => s.gl);

  // Keyboard: preset shortcuts, Escape leaves the street walk, held keys feed the walk step.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const preset = PRESET_KEYS[e.code];
      if (preset && !e.repeat) {
        runtime.cameraPresetRequests.push(preset);
        return;
      }
      if (e.code === 'Escape' && (street.current.active || tween.current?.toStreet)) {
        cancelTween();
        leaveStreet();
        return;
      }
      keys.current.add(e.code);
      if (street.current.active && e.code.startsWith('Arrow')) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const onBlur = () => keys.current.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Orbit input interrupts a running tween.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const onStart = () => {
      if (tween.current && !tween.current.toStreet) tween.current = null;
    };
    controls.addEventListener('start', onStart);
    return () => controls.removeEventListener('start', onStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Street walk: drag to look; any pointer/wheel input also interrupts the walk-in tween.
  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    const onDown = (e: PointerEvent) => {
      if (tween.current?.toStreet) {
        cancelTween();
        return;
      }
      if (!street.current.active) return;
      dragging = true;
      el.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging || !street.current.active) return;
      street.current.yaw -= e.movementX * uiCamera.lookSensitivity;
      street.current.pitch = clampPitch(street.current.pitch - e.movementY * uiCamera.lookSensitivity);
    };
    const onUp = () => {
      dragging = false;
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);
}
