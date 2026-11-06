// House type thumbnails for the House panel carousel. The UI calls request() when the panel opens and reads
// thumbs[preset] (a PNG data URL), showing a placeholder until it is present. HouseThumbRenderer (inside the Canvas)
// renders the presets one per frame. Pure helpers here: the camera framing and the one-per-frame queue.
import { create } from 'zustand';
import type { HousePreset } from '../core/types';

export interface HouseThumbsState {
  /** PNG data URL per house preset, filled one preset per frame after request(). */
  thumbs: Partial<Record<HousePreset, string>>;
  /** True once the UI asked for thumbnails; the renderer works only then. */
  requested: boolean;
  request(): void;
}

export const useHouseThumbs = create<HouseThumbsState>((set, get) => ({
  thumbs: {},
  requested: false,
  request() {
    if (!get().requested) set({ requested: true });
  },
}));


/** Stores one finished thumbnail (renderer side). */
export function storeHouseThumb(preset: HousePreset, dataUrl: string): void {
  useHouseThumbs.setState((s) => ({ thumbs: { ...s.thumbs, [preset]: dataUrl } }));
}

/** The next preset to render, or null when all are done or nothing was requested. One call per frame. */
export function nextThumbPreset(presets: readonly HousePreset[], s: Pick<HouseThumbsState, 'thumbs' | 'requested'>): HousePreset | null {
  if (!s.requested) return null;
  for (const p of presets) if (s.thumbs[p] === undefined) return p;
  return null;
}

export type Vec3 = [number, number, number];

export interface ThumbView {
  /** Thumbnail camera vertical fov, degrees (square image). */
  fovDeg: number;
  /** Angle around the house from its front (+Z), degrees, towards +X. */
  azimuthDeg: number;
  /** Angle above the horizon, degrees. */
  elevationDeg: number;
  /** 1 = bounds touch the frame; larger leaves a margin. */
  margin: number;
}

export interface ThumbFrame {
  position: Vec3;
  target: Vec3;
  near: number;
  far: number;
}

/**
 * Frames an axis-aligned box for a square perspective view: the camera looks at the box centre from the given
 * angles, at the smallest distance where every corner fits inside the frame shrunk by `margin`.
 */
export function frameThumbCamera(min: Vec3, max: Vec3, view: ThumbView): ThumbFrame {
  const c: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const az = (view.azimuthDeg * Math.PI) / 180;
  const el = (view.elevationDeg * Math.PI) / 180;
  // Unit vector from the target to the camera.
  const back: Vec3 = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  // Camera basis: right = up(0,1,0) x back normalised, up = back x right.
  const rl = Math.hypot(back[2], back[0]) || 1;
  const right: Vec3 = [back[2] / rl, 0, -back[0] / rl];
  const up: Vec3 = [
    back[1] * right[2] - back[2] * right[1],
    back[2] * right[0] - back[0] * right[2],
    back[0] * right[1] - back[1] * right[0],
  ];
  const tanHalf = Math.tan(((view.fovDeg * Math.PI) / 180) / 2) / Math.max(1, view.margin);
  let dist = 0;
  let depth = 0;
  for (let i = 0; i < 8; i++) {
    const o: Vec3 = [
      (i & 1 ? max[0] : min[0]) - c[0],
      (i & 2 ? max[1] : min[1]) - c[1],
      (i & 4 ? max[2] : min[2]) - c[2],
    ];
    const x = o[0] * right[0] + o[1] * right[1] + o[2] * right[2];
    const y = o[0] * up[0] + o[1] * up[1] + o[2] * up[2];
    const z = o[0] * back[0] + o[1] * back[1] + o[2] * back[2];
    // Corner at camera depth (dist - z) must satisfy |x|, |y| <= tanHalf * (dist - z).
    dist = Math.max(dist, z + Math.abs(x) / tanHalf, z + Math.abs(y) / tanHalf);
    depth = Math.max(depth, Math.abs(z));
  }
  const radius = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
  return {
    position: [c[0] + back[0] * dist, c[1] + back[1] * dist, c[2] + back[2] * dist],
    target: c,
    near: Math.max(0.05, dist - depth - radius * 0.1),
    far: dist + depth + radius,
  };
}

/** Rows read from WebGL are bottom-up and premultiplied by the clear alpha at the edges: flip and unpremultiply. */
export function flipAndUnpremultiply(src: Uint8Array, width: number, height: number, out: Uint8ClampedArray): void {
  const row = width * 4;
  for (let y = 0; y < height; y++) {
    const s = (height - 1 - y) * row;
    const d = y * row;
    for (let i = 0; i < row; i += 4) {
      const a = src[s + i + 3]!;
      const k = a > 0 && a < 255 ? 255 / a : 1;
      out[d + i] = src[s + i]! * k;
      out[d + i + 1] = src[s + i + 1]! * k;
      out[d + i + 2] = src[s + i + 2]! * k;
      out[d + i + 3] = a;
    }
  }
}
