// Screen anchors for the block editor's DOM buttons (+ / - on the selected block, one chip per suggestion).
// The DOM overlay registers its elements and the ground points they belong to; BlockEditor projects the points
// every frame and moves the elements. Fixed slots, so the frame loop allocates nothing.

export interface BlockAnchor {
  el: HTMLElement | null;
  x: number;
  z: number;
  /** Last written screen position; NaN forces a write. */
  sx: number;
  sy: number;
  shown: boolean;
}

/** Slot 0: the action icons of the selected block. Slots 1..4: suggestion chips. */
export const ANCHOR_SLOTS = 5;

export const blockAnchors: BlockAnchor[] = Array.from({ length: ANCHOR_SLOTS }, () => ({
  el: null,
  x: 0,
  z: 0,
  sx: Number.NaN,
  sy: Number.NaN,
  shown: false,
}));

/** Points slot `i` at element `el` over ground point (x, z); null detaches it. */
export function setAnchor(i: number, el: HTMLElement | null, x = 0, z = 0): void {
  const a = blockAnchors[i];
  if (!a) return;
  a.el = el;
  a.x = x;
  a.z = z;
  a.sx = Number.NaN;
  a.sy = Number.NaN;
  a.shown = false;
}
