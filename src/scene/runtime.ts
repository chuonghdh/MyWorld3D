// Mutable runtime state shared between the R3F scene and the UI actions.
// Kept outside React state because gusts and leaf devils change every frame.
import type { GustEvent } from '../environment';

export const runtime = {
  /** Gusts that are still active, pruned by the scene each frame. */
  gusts: [] as GustEvent[],
  /** Pending Gust button presses; the scene turns each one into a gust. */
  gustRequests: 0,
  /** Leaf devils requested by the Leaf devil button; consumed by the leaf system. */
  leafDevilRequests: 0,
  /** Pending Whole map presses; the scene moves the camera to frame the town. */
  wholeMapRequests: 0,
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
