// Shared types, event queue and small helpers for the life module (animals).
// No allocation in hot paths: events come from a fixed pool.

import type * as THREE from 'three';

/** Anything that scares animals: vehicles and pedestrians (structurally typed). */
export interface Disturber {
  position: { x: number; z: number };
}

export type LifeSeason = 'spring' | 'summer' | 'autumn' | 'winter';

export interface LifeContext {
  /** Seconds, for shader animation. */
  time: number;
  /** Hours 0-24. */
  timeOfDay: number;
  season: LifeSeason;
  night: boolean;
  wind: { x: number; z: number };
  vehicles: readonly Disturber[];
  pedestrians: readonly Disturber[];
  /** 0-1, optional (weather arrives in Round 2). */
  rain?: number;
  camera?: { x: number; y: number; z: number };
}

export interface LifeSystem {
  /** Add to the scene once. */
  readonly group: THREE.Object3D;
  update(dt: number, ctx: LifeContext): void;
  dispose(): void;
}

export type LifeQuality = 'low' | 'medium' | 'high';

export type LifeEventType = 'pigeon-scatter' | 'bird-call' | 'cat-meow';

export interface LifeEvent {
  type: LifeEventType;
  x: number;
  z: number;
}

export type EmitFn = (type: LifeEventType, x: number, z: number) => void;

// ---- event queue (module level so the audio system can poll it) ----
const POOL_SIZE = 64;
const pool: LifeEvent[] = [];
for (let i = 0; i < POOL_SIZE; i++) pool.push({ type: 'bird-call', x: 0, z: 0 });
const active: LifeEvent[] = [];
let activeCount = 0;

/** Pushes an event into the shared queue (dropped silently when the queue is full). */
export function pushLifeEvent(type: LifeEventType, x: number, z: number): void {
  if (activeCount >= POOL_SIZE) return;
  const e = pool[activeCount];
  e.type = type;
  e.x = x;
  e.z = z;
  active[activeCount] = e;
  activeCount++;
}

/** Events fired since the last clearLifeEvents(). The array is reused: copy what you need. */
export function getLifeEvents(): readonly LifeEvent[] {
  return active;
}

export function clearLifeEvents(): void {
  activeCount = 0;
  active.length = 0;
}

// ---- quality ----
export function qualityFactor(q: LifeQuality): number {
  return q === 'low' ? 0.4 : q === 'medium' ? 0.7 : 1;
}

export function scaledCount(base: number, q: LifeQuality): number {
  return Math.max(1, Math.round(base * qualityFactor(q)));
}

// ---- math ----
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Shortest signed angle from a to b. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Writes an instance matrix from position, yaw (about Y, 0 faces +Z), pitch (positive = nose up),
 * roll (about the forward axis) and uniform scale. No allocation.
 */
export function setPose(
  mesh: THREE.InstancedMesh,
  index: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
  roll: number,
  scale: number,
): void {
  const px = -pitch;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cx = Math.cos(px);
  const sx = Math.sin(px);
  const cz = Math.cos(roll);
  const sz = Math.sin(roll);
  const e = mesh.instanceMatrix.array as Float32Array;
  const o = index * 16;
  e[o] = (cy * cz + sy * sx * sz) * scale;
  e[o + 1] = cx * sz * scale;
  e[o + 2] = (-sy * cz + cy * sx * sz) * scale;
  e[o + 3] = 0;
  e[o + 4] = (-cy * sz + sy * sx * cz) * scale;
  e[o + 5] = cx * cz * scale;
  e[o + 6] = (sy * sz + cy * sx * cz) * scale;
  e[o + 7] = 0;
  e[o + 8] = sy * cx * scale;
  e[o + 9] = -sx * scale;
  e[o + 10] = cy * cx * scale;
  e[o + 11] = 0;
  e[o + 12] = x;
  e[o + 13] = y;
  e[o + 14] = z;
  e[o + 15] = 1;
}

/** True when every value is a finite number (used by tests through the systems' debug hooks). */
export function finite(v: number): boolean {
  return Number.isFinite(v);
}
