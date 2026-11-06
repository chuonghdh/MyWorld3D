// Mutable runtime state shared between the R3F scene, the UI and the feature modules (sky, aircraft).
// Kept outside React state because gusts and leaf devils change every frame. Lives in core so that no feature
// module has to import from scene/.
import type { GustEvent } from './types';

/** Camera presets a UI can request through runtime.cameraPresetRequests. */
export type CameraPresetId = 'overview' | 'street';

export const runtime = {
  /** Gusts that are still active, pruned by the scene each frame. */
  gusts: [] as GustEvent[],
  /** Pending Gust button presses; the scene turns each one into a gust. */
  gustRequests: 0,
  /** Leaf devils requested by the Leaf devil button; consumed by the leaf system. */
  leafDevilRequests: 0,
  /** Legacy Whole map presses; CameraRig treats each as an 'overview' request. */
  wholeMapRequests: 0,
  /** Pending Photo presses; ScreenshotRequest saves a PNG right after the next composer frame. */
  screenshotRequests: 0,
  /** Camera preset requests (queue); CameraRig consumes them. Whole map = 'overview'. */
  cameraPresetRequests: [] as CameraPresetId[],
  /** Screen points (client px) where the walking figure was dropped on the map; CameraRig starts a walk there. */
  streetDrops: [] as { x: number; y: number }[],
  /** Camera height above ground (y), metres. Written by CameraRig each frame; read by the height label (no React state). */
  cameraHeight: 0,
  /** Set by CameraRig: true while the street walk camera is active (for UI highlight). */
  streetMode: false,
  /** Simulation seconds: the scene clock, frozen while paused. */
  simTime: 0,
  /** Hours of auto time not yet written to the store. */
  pendingHours: 0,
  /** Block id picked first in Move blocks mode; the second click swaps with it. */
  pendingBlockId: null as string | null,
};

/** Returns a stable number in [0, 1) derived from a string id. */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
