// CameraRig: owns all camera behaviour (orbit with zoom-to-cursor and pan, clip planes, tweened presets,
// street walk). Mounted inside the Canvas, before <Town/> so the camera is final when the town reads it.
// Keyboard, orbit-interrupt and street-drag input live in cameraInput.ts.
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { getCityLayout } from '../city';
import { useWorldStore } from '../store';
import { uiCamera } from '../config/tuning';
import { runtime } from './runtime';
import { autoFilmHoldsCamera } from './FilmRig';
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
  streetKeyAxes,
  streetLookStep,
  streetStart,
  walkStep,
  wholeMapFraming,
  type CameraPresetId,
  type ShiftState,
  type V3,
} from './cameraMath';
import { RIGHT_PANEL_ATTR, measureRightInset } from './cameraDom';
import { useCameraInput, type StreetState, type Tween } from './cameraInput';
import { applyMapKeys } from './cameraMapKeys';
import { stepPanelViewOffset } from './cameraViewShift';
import {
  boundsCentre,
  mapMoveAxis,
  pivotForSelection,
  pivotSourceFrom,
  sameSelection,
  startPivotGlide,
  stepPivotGlide,
  type GroundPoint,
  type PivotGlide,
  type PivotTarget,
} from './pivotMath';

export { RIGHT_PANEL_ATTR, measureRightInset };

/** Ground plane (y = 0) used to turn a dropped point on the map into world coordinates. */
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const tween = useRef<Tween | null>(null);
  const street = useRef<StreetState>({ active: false, yaw: 0, pitch: 0, x: 0, z: 0 });
  const keys = useRef(new Set<string>());
  const lastTarget = useRef(new THREE.Vector3());
  // Overview keeps the pivot on the map centre and shifts the picture instead (camera view offset).
  const overviewOn = useRef(false);
  // Panel view offset: animated shift (px) and speed, and the w/h/x last given to setViewOffset (null = cleared).
  const viewShift = useRef<ShiftState>({ x: 0, v: 0 });
  const viewApplied = useRef<{ w: number; h: number; x: number } | null>(null);
  const ndc = useRef(new THREE.Vector2());
  const raycaster = useRef(new THREE.Raycaster());
  // Auto film holds the camera: FilmRig places it alone; orbit controls are off until the film ends.
  const autoHeld = useRef(false);
  // Orbit pivot follows the selection centroid (map centre when cleared). A new selection sets pivotRequest.
  const pivotGlide = useRef<PivotGlide | null>(null);
  const pivotRequest = useRef<GroundPoint | null>(null);
  const lastSelection = useRef<PivotTarget | null>(null);
  // Map view look (Left/Right, W/S): view direction override, applied after the orbit update. Null = look at the pivot.
  const lookOverride = useRef<V3 | null>(null);

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
    // A tween owns the pivot: a pivot glide in progress stops where it is.
    pivotGlide.current = null;
    lookOverride.current = null;
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
      const { x: cx, z: cz } = boundsCentre(g);
      const v: V3 = [f.position[0] - f.target[0], f.position[1] - f.target[1], f.position[2] - f.target[2]];
      overviewOn.current = true;
      pivotRequest.current = null;
      startTween([cx + v[0], v[1], cz + v[2]], [cx, 0, cz]);
      return;
    }
    // Street walk: from the ground point under the orbit target, or the camera when already walking.
    const px = street.current.active ? camera.position.x : controls.target.x;
    const pz = street.current.active ? camera.position.z : controls.target.z;
    startStreetAt(px, pz);
  };

  // First load: frame the whole town. The overview tween starts from the default camera pose, so the intro is motion.
  useEffect(() => {
    runtime.cameraPresetRequests.push('overview');
  }, []);

  useCameraInput({ controlsRef, tween, street, keys, cancelTween, leaveStreet });

  // Orbit drag or zoom hands the view back to the pivot.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const onStart = () => {
      lookOverride.current = null;
    };
    controls.addEventListener('start', onStart);
    return () => controls.removeEventListener('start', onStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_state, frameDt) => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (autoFilmHoldsCamera()) {
      autoHeld.current = true;
      lookOverride.current = null;
      controls.enabled = false;
      pivotGlide.current = null;
      // The auto film frames the whole town: no panel offset, even on its first frame.
      viewShift.current = { x: 0, v: 0 };
      if (viewApplied.current) {
        camera.clearViewOffset();
        viewApplied.current = null;
      }
      return;
    }
    if (autoHeld.current) {
      // Film ended: resume orbit from the camera pose, pivot on the ground point it looks at.
      autoHeld.current = false;
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const hit = new THREE.Vector3();
      if (new THREE.Ray(camera.position, dir).intersectPlane(GROUND, hit)) controls.target.copy(hit);
      else controls.target.set(0, 0, 0);
      controls.enabled = !street.current.active;
      controls.update();
    }
    const dt = Math.min(frameDt, 0.1);
    const bounds = layoutOf().townBounds;
    const selection = useWorldStore.getState().selected; // changed: pivot to its centroid, or the map centre
    if (!sameSelection(selection, lastSelection.current)) {
      lastSelection.current = selection;
      pivotRequest.current = pivotForSelection(selection, pivotSourceFrom(layoutOf()), bounds);
    }

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
    // Overview: shift the picture so the town centre sits in the free area between the side panels. The shift
    // glides (real frame time, also while paused) when a panel opens or closes. Filming hides the panels: the
    // offset is cleared at once so the film starts centred; after the film it glides back.
    const filming = useWorldStore.getState().toggles.filming;
    stepPanelViewOffset(camera, gl.domElement, overviewOn.current, filming, dt, {
      shift: viewShift,
      applied: viewApplied,
    });

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
      const axes = streetKeyAxes(k);
      const run = k.has('ShiftLeft') || k.has('ShiftRight');
      const s = street.current;
      const look = streetLookStep(s.yaw, s.pitch, axes, dt);
      s.yaw = look.yaw;
      s.pitch = look.pitch;
      const next = walkStep(s.x, s.z, s.yaw, axes.walk, 0, dt, run, bounds);
      s.x = next.x;
      s.z = next.z;
      camera.position.set(s.x, EYE_HEIGHT, s.z);
      camera.rotation.set(s.pitch, s.yaw, 0, 'YXZ');
      distToTarget = EYE_HEIGHT;
    } else {
      // Orbit: pivot glide (target and camera move by the same step, so the view does not jump), then the pan clamp.
      const t = controls.target;
      const req = pivotRequest.current;
      if (req) {
        pivotRequest.current = null;
        pivotGlide.current = startPivotGlide({ x: t.x, z: t.z }, req);
      }
      const pg = pivotGlide.current;
      if (pg) {
        const step = stepPivotGlide(pg, dt, uiCamera.pivotSeconds);
        t.x += step.dx;
        t.z += step.dz;
        camera.position.x += step.dx;
        camera.position.z += step.dz;
        if (step.done) pivotGlide.current = null;
      }
      // While the Up/Down move key is held the pivot clamp is skipped: the keyboard move does not touch the target.
      const mv = mapMoveAxis(keys.current);
      const c = mv ? { x: t.x, z: t.z } : clampToBounds(t.x, t.z, bounds, -PAN_MARGIN);
      const ty = mv ? t.y : clamp(t.y, 0, uiCamera.targetHeightMax);
      if (c.x !== t.x || c.z !== t.z || ty !== t.y) {
        camera.position.x += c.x - t.x;
        camera.position.z += c.z - t.z;
        camera.position.y += ty - t.y;
        t.set(c.x, ty, c.z);
      }
      applyMapKeys(camera, controls, keys.current, mv, lookOverride, bounds, dt);
      lastTarget.current.copy(t);
      distToTarget = camera.position.distanceTo(t);
    }

    runtime.cameraHeight = camera.position.y;
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
      dampingFactor={uiCamera.dampingFactor}
      enablePan
      screenSpacePanning
      zoomToCursor
      maxPolarAngle={uiCamera.maxPolarAngle}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
    />
  );
}
