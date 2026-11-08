// Shared desk pieces: monitor and keyboard sizes, the office chair geometry and the desk-local pose matrix.
// Used by Desks.tsx (subagent desks) and LeadDesk.tsx (the lead's desk). Monitors are 1.5x the old 0.62 x 0.38 m.
import * as THREE from 'three';
import { mergeParts } from './geometry';
import type { Vec2 } from './layout';

export const MON = { w: 0.93, h: 0.57, t: 0.03, lift: 0.1, x: 0.52, z: -0.2, yaw: 0.12 } as const;
export const SCREEN_GAP = 0.004; // screen plane in front of the bezel face
export const KEY = { w: 0.42, d: 0.14, h: 0.018, z: 0.1 } as const;
const KEY_LIFT = 0.001; // keyboard underside 1 mm above the desk top

/** Keyboard in desk-local space, origin on the desk top at its centre. */
export function keyboardGeometry(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(KEY.w, KEY.h, KEY.d).translate(0, KEY.h / 2 + KEY_LIFT, KEY.z);
}

/** Office chair (seat, back, post, base), merged, desk-local origin on the floor under the seat centre. */
export function chairGeometry(): THREE.BufferGeometry {
  const seat = new THREE.BoxGeometry(0.46, 0.06, 0.46).translate(0, 0.46, 0);
  const back = new THREE.BoxGeometry(0.46, 0.5, 0.05).translate(0, 0.76, 0.21);
  const post = new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8).translate(0, 0.22, 0);
  const base = new THREE.CylinderGeometry(0.26, 0.26, 0.03, 16).translate(0, 0.016, 0);
  return mergeParts([seat, back, post, base].map((geo) => ({ geo })));
}

/** Desk-local (x, y, z; +z faces the front) to world, for a desk at `pos` with `yaw`. */
export function poseMatrix(pos: Vec2, yaw: number, x: number, y: number, z: number, extraYaw = 0): THREE.Matrix4 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const p = new THREE.Vector3(pos.x + x * c + z * s, y, pos.z - x * s + z * c);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw + extraYaw, 0));
  return new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1));
}
