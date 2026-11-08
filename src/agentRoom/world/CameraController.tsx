// Camera: OrbitControls plus damped fly-to presets, follow, target clamp and inset fit (view offset).
// Reads uiStore (requests, follow, insets) and the live world; writes only the camera and controls.
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import type { LiveWorld } from './liveWorld';
import { useUi } from '../ui/uiStore';
import { useRoomMirror } from '../store';
import { LIMITS, clampTarget, dampK, fitScale, overviewFit, presetPose, viewShift } from './cameraPresets';
import { agentRoom } from '../../config/tuning';

const SETTLE = 0.01;
const goalPos = new THREE.Vector3();
const goalTarget = new THREE.Vector3();
const off = new THREE.Vector3();

export function CameraController({ world }: { world: LiveWorld }) {
  const controls = useRef<OrbitImpl>(null);
  const { camera, size } = useThree();
  const flying = useRef(false);
  const lastNonce = useRef(-1);
  const lastShift = useRef('');
  /** True while the view rests on a preset (no user drag since); a layout change then refits it. */
  const onPreset = useRef(false);
  const lastFit = useRef('');
  const directorClock = useRef(0);
  const lastDirected = useRef(-1);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const stop = () => {
      flying.current = false;
      onPreset.current = false;
      const ui = useUi.getState();
      if (ui.followId || ui.director) ui.set({ followId: null, director: false });
    };
    c.addEventListener('start', stop);
    return () => c.removeEventListener('start', stop);
  }, []);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const ui = useUi.getState();
    const scale = fitScale(size.width, size.height, ui.insets, agentRoom.camFitMax);

    const { left, top, right, bottom } = ui.insets;
    const fitKey = [size.width, size.height, left, top, right, bottom].join(',');
    const refit = fitKey !== lastFit.current && onPreset.current && !ui.followId;
    lastFit.current = fitKey;
    if (ui.camera.nonce !== lastNonce.current || refit) {
      lastNonce.current = ui.camera.nonce;
      onPreset.current = true;
      const overview = ui.camera.preset === 'overview';
      const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 42;
      // Overview is fitted to the office corners inside the free area; other presets scale by the inset fit.
      const p = overview ? overviewFit(size.width, size.height, ui.insets, fov) : presetPose(ui.camera.preset, agentRoom.viewDistance, agentRoom.camFocusDistance);
      goalTarget.set(...p.target);
      off.set(p.pos[0] - p.target[0], p.pos[1] - p.target[1], p.pos[2] - p.target[2]).multiplyScalar(overview ? 1 : scale);
      goalPos.copy(goalTarget).add(off);
      flying.current = true;
    }

    // Director: every directorDwellSec, ease toward the agent of the newest event (keeps the current view angle).
    directorClock.current += dt;
    if (ui.director && !ui.followId && directorClock.current >= agentRoom.directorDwellSec) {
      directorClock.current = 0;
      const log = useRoomMirror.getState().log;
      const e = log[log.length - 1];
      if (e && e.seq !== lastDirected.current) {
        lastDirected.current = e.seq;
        const a = world.agents[e.agent].pos;
        off.copy(camera.position).sub(c.target).setLength(agentRoom.camFocusDistance * 1.4 * scale);
        goalTarget.set(a.x, 0.9, a.z);
        goalPos.copy(goalTarget).add(off);
        flying.current = true;
        onPreset.current = false;
      }
    }

    if (ui.followId) {
      const a = world.agents[ui.followId].pos;
      off.copy(camera.position).sub(c.target);
      goalTarget.set(a.x, 0.9, a.z);
      goalPos.copy(goalTarget).add(off);
      c.target.lerp(goalTarget, dampK(agentRoom.camDampTarget, dt));
      camera.position.copy(c.target).add(off);
    } else if (flying.current) {
      c.target.lerp(goalTarget, dampK(agentRoom.camDampTarget, dt));
      camera.position.lerp(goalPos, dampK(agentRoom.camDampDistance, dt));
      if (camera.position.distanceTo(goalPos) < SETTLE && c.target.distanceTo(goalTarget) < SETTLE) flying.current = false;
    }

    // Clamp the target and move the camera by the same delta, so hitting a limit slides instead of rotating.
    const t = clampTarget([c.target.x, c.target.y, c.target.z]);
    off.set(t[0] - c.target.x, t[1] - c.target.y, t[2] - c.target.z);
    if (off.lengthSq() > 0) {
      c.target.add(off);
      camera.position.add(off);
    }
    c.update();

    const shift = viewShift(ui.insets);
    const key = `${size.width}x${size.height}:${shift.x},${shift.y}`;
    if (key !== lastShift.current && camera instanceof THREE.PerspectiveCamera) {
      lastShift.current = key;
      camera.setViewOffset(size.width, size.height, shift.x, shift.y, size.width, size.height);
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      minDistance={LIMITS.minDistance}
      maxDistance={LIMITS.maxDistance}
      minPolarAngle={LIMITS.minPolar}
      maxPolarAngle={LIMITS.maxPolar}
    />
  );
}
