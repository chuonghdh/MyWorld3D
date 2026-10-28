// CameraRig: owns all camera behaviour (orbit with zoom-to-cursor and pan, clip planes, tweened presets,
// street walk). Mounted inside the Canvas, before <Town/> so the camera is final when the town reads it.
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { getCityLayout } from '../city';
import { useWorldStore } from '../store';
import { runtime } from './runtime';
import {
  EYE_HEIGHT,
  MAX_DISTANCE,
  MIN_DISTANCE,
  PAN_MARGIN,
  TWEEN_SECONDS,
  clamp,
  clampToBounds,
  clipPlanes,
  clipPlanesStale,
  dirFromYaw,
  easeInOut,
  lerp3,
  streetStart,
  walkStep,
  wholeMapFraming,
  type CameraPresetId,
  type V3,
} from './cameraMath';

import { RIGHT_PANEL_ATTR, isTyping, measureRightInset } from './cameraDom';

export { RIGHT_PANEL_ATTR, measureRightInset };

interface Tween {
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

/** Ground plane (y = 0) used to turn a dropped point on the map into world coordinates. */
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const PRESET_KEYS: Record<string, CameraPresetId> = {
  Digit1: 'overview',
  Digit2: 'street',
};

export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const tween = useRef<Tween | null>(null);
  const street = useRef({ active: false, yaw: 0, pitch: 0, x: 0, z: 0 });
  const keys = useRef(new Set<string>());
  const lastTarget = useRef(new THREE.Vector3());
  // Overview keeps the pivot on the map centre and shifts the picture instead (camera view offset).
  const overviewOn = useRef(false);
  const viewShift = useRef(-1);
  const ndc = useRef(new THREE.Vector2());
  const raycaster = useRef(new THREE.Raycaster());

  const layoutOf = () => getCityLayout(useWorldStore.getState().settings);

  // Leave the street walk and hand the camera back to the orbit controls, looking at a ground point ahead.
  const leaveStreet = () => {
    const controls = controlsRef.current;
    if (!street.current.active || !controls) return;
    street.current.active = false;
    runtime.streetMode = false;
    const f = dirFromYaw(street.current.yaw);
    controls.target.set(camera.position.x + f.x * 12, 0, camera.position.z + f.z * 12);
    controls.enabled = true;
    controls.update();
  };

  // A tween that was heading into the street walk is cancelled: continue as a normal orbit from here.
  const cancelTween = () => {
    const tw = tween.current;
    if (!tw) return;
    tween.current = null;
    const controls = controlsRef.current;
    if (tw.toStreet && controls) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const f = Math.hypot(dir.x, dir.z) || 1;
      controls.target.set(camera.position.x + (dir.x / f) * 12, 0, camera.position.z + (dir.z / f) * 12);
      controls.enabled = true;
      controls.update();
    }
  };

  const startTween = (toPos: V3, toTarget: V3, toStreet = false, yaw = 0) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const fromTarget: V3 = [controls.target.x, controls.target.y, controls.target.z];
    if (street.current.active) {
      const f = dirFromYaw(street.current.yaw);
      fromTarget[0] = camera.position.x + f.x * 12;
      fromTarget[1] = 0;
      fromTarget[2] = camera.position.z + f.z * 12;
      leaveStreet();
    }
    if (toStreet) controls.enabled = false;
    tween.current = {
      t: 0,
      fromPos: [camera.position.x, camera.position.y, camera.position.z],
      toPos,
      fromTarget,
      toTarget,
      toStreet,
      yaw,
    };
  };

  // Street walk starting at a ground point (the orbit target, or a point dropped on the map).
  const startStreetAt = (px: number, pz: number) => {
    overviewOn.current = false;
    const s = streetStart(layoutOf().roads, px, pz);
    const f = dirFromYaw(s.yaw);
    startTween([s.x, EYE_HEIGHT, s.z], [s.x + f.x * 12, EYE_HEIGHT, s.z + f.z * 12], true, s.yaw);
  };

  const applyPreset = (id: CameraPresetId) => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (id === 'overview') {
      const g = layoutOf().townBounds;
      const size = Math.max(g.maxX - g.minX, g.maxZ - g.minZ);
      const inset = measureRightInset();
      const f = wholeMapFraming({
        townSize: size,
        fovDeg: camera.fov,
        viewW: gl.domElement.clientWidth || window.innerWidth,
        viewH: gl.domElement.clientHeight || window.innerHeight,
        rightInset: inset,
      });
      // Pivot stays on the map centre; the view vector (distance and height) comes from the framing.
      const cx = (g.minX + g.maxX) / 2;
      const cz = (g.minZ + g.maxZ) / 2;
      const v: V3 = [f.position[0] - f.target[0], f.position[1] - f.target[1], f.position[2] - f.target[2]];
      overviewOn.current = true;
      startTween([cx + v[0], v[1], cz + v[2]], [cx, 0, cz]);
      return;
    }
    // Street walk: from the ground point under the orbit target, or the camera when already walking.
    const px = street.current.active ? camera.position.x : controls.target.x;
    const pz = street.current.active ? camera.position.z : controls.target.z;
    startStreetAt(px, pz);
  };

  // Request queue consumption happens in the frame loop; this also exposes the keyboard shortcuts.
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
      street.current.yaw -= e.movementX * 0.004;
      street.current.pitch = clamp(street.current.pitch - e.movementY * 0.004, -1.2, 1.2);
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

  useFrame((_state, frameDt) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const dt = Math.min(frameDt, 0.1);
    const bounds = layoutOf().townBounds;

    // Requests: the legacy Whole map counter and the preset queue.
    while (runtime.wholeMapRequests > 0) {
      runtime.wholeMapRequests--;
      runtime.cameraPresetRequests.push('overview');
    }
    while (runtime.cameraPresetRequests.length > 0) {
      applyPreset(runtime.cameraPresetRequests.shift() as CameraPresetId);
    }
    // A point dropped from the walking figure on the map starts a street walk there.
    while (runtime.streetDrops.length > 0) {
      const d = runtime.streetDrops.shift() as { x: number; y: number };
      const rect = gl.domElement.getBoundingClientRect();
      ndc.current.set(((d.x - rect.left) / rect.width) * 2 - 1, -((d.y - rect.top) / rect.height) * 2 + 1);
      raycaster.current.setFromCamera(ndc.current, camera);
      const hit = new THREE.Vector3();
      if (raycaster.current.ray.intersectPlane(GROUND, hit)) startStreetAt(hit.x, hit.z);
    }
    // Overview: shift the picture so the town centre sits in the free area left of the settings panel.
    if (overviewOn.current) {
      const w = gl.domElement.clientWidth;
      const h = gl.domElement.clientHeight;
      const shift = measureRightInset() / 2;
      if (w > 0 && h > 0 && Math.abs(shift - viewShift.current) > 0.5) {
        camera.setViewOffset(w, h, shift, 0, w, h);
        viewShift.current = shift;
      }
    } else if (viewShift.current >= 0) {
      camera.clearViewOffset();
      viewShift.current = -1;
    }

    let distToTarget: number;
    const tw = tween.current;
    if (tw) {
      tw.t += dt / TWEEN_SECONDS;
      const k = easeInOut(tw.t);
      const p = lerp3(tw.fromPos, tw.toPos, k);
      const tg = lerp3(tw.fromTarget, tw.toTarget, k);
      camera.position.set(p[0], p[1], p[2]);
      if (tw.toStreet) {
        camera.lookAt(tg[0], tg[1], tg[2]);
      } else {
        controls.target.set(tg[0], tg[1], tg[2]);
        controls.update();
      }
      if (tw.t >= 1) {
        tween.current = null;
        if (tw.toStreet) {
          street.current = { active: true, yaw: tw.yaw, pitch: 0, x: tw.toPos[0], z: tw.toPos[2] };
          runtime.streetMode = true;
          camera.rotation.order = 'YXZ';
          controls.enabled = false;
        }
      }
      distToTarget = camera.position.distanceTo(controls.target);
      if (tw.toStreet) distToTarget = Math.max(EYE_HEIGHT, (1 - easeInOut(tw.t)) * distToTarget);
    } else if (street.current.active) {
      const k = keys.current;
      const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const str = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const run = k.has('ShiftLeft') || k.has('ShiftRight');
      const s = street.current;
      const next = walkStep(s.x, s.z, s.yaw, fwd, str, dt, run, bounds);
      s.x = next.x;
      s.z = next.z;
      camera.position.set(s.x, EYE_HEIGHT, s.z);
      camera.rotation.set(s.pitch, s.yaw, 0, 'YXZ');
      distToTarget = EYE_HEIGHT;
    } else {
      // Orbit: keep the pan target near the town and on or above the ground, moving the camera with it.
      const t = controls.target;
      const c = clampToBounds(t.x, t.z, bounds, -PAN_MARGIN);
      const ty = clamp(t.y, 0, 40);
      if (c.x !== t.x || c.z !== t.z || ty !== t.y) {
        camera.position.x += c.x - t.x;
        camera.position.z += c.z - t.z;
        camera.position.y += ty - t.y;
        t.set(c.x, ty, c.z);
      }
      lastTarget.current.copy(t);
      distToTarget = camera.position.distanceTo(t);
    }

    // Depth precision: planes follow the distance to the orbit target (see clipPlanes).
    const want = clipPlanes(distToTarget);
    if (clipPlanesStale(camera.near, camera.far, want)) {
      camera.near = want.near;
      camera.far = want.far;
      camera.updateProjectionMatrix();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef as never}
      makeDefault
      target={[0, 0, 0]}
      enableDamping
      enablePan
      screenSpacePanning
      zoomToCursor
      maxPolarAngle={Math.PI / 2.05}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
    />
  );
}
