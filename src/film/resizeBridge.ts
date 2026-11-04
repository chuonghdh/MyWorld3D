/**
 * Film output size bridge. While a film records at a fixed size, the GL drawing buffer (pixel ratio 1),
 * the camera aspect and the post-processing composer follow that size, and the on-screen canvas is
 * letterboxed to the film aspect so the preview is not distorted. R3F's own resize and pixel-ratio
 * calls are held while a film size is applied (window changes are remembered and applied on restore).
 * Idempotent: applying again re-sizes to the target but keeps the state saved at the first apply.
 * Restoring with nothing applied is a no-op. Plain TypeScript (no React): runs under vitest in node.
 */

export interface FilmFrame {
  width: number;
  height: number;
  aspect: number;
}

export interface FilmStyle {
  width: string;
  height: string;
  marginLeft: string;
  marginTop: string;
}

/** Structural subset of THREE.Vector2: three's getSize writes into the target through set(). */
export interface SizeTarget {
  x: number;
  y: number;
  set(x: number, y: number): unknown;
}

/** Structural subset of THREE.WebGLRenderer used by the bridge. */
export interface FilmGl {
  getPixelRatio(): number;
  setPixelRatio(ratio: number): void;
  getSize(target: SizeTarget): SizeTarget;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  domElement: { style: FilmStyle };
}

/** Structural subset of THREE.PerspectiveCamera used by the bridge. */
export interface FilmCamera {
  aspect: number;
  updateProjectionMatrix(): void;
}

/** Structural subset of THREE.EffectComposer used by the bridge. */
export interface FilmComposer {
  setPixelRatio(ratio: number): void;
  setSize(width: number, height: number): void;
}

export interface FilmRoot {
  gl: FilmGl;
  /** Null when the scene camera is not perspective (the aspect is then left alone). */
  camera: FilmCamera | null;
  composer: FilmComposer | null;
}

export interface FittedBox {
  width: number;
  height: number;
  left: number;
  top: number;
}

/** Smallest legal side: H.264 needs even sides, and a zero-size buffer is invalid. */
const MIN_SIDE = 2;

function evenSide(value: number): number {
  if (!Number.isFinite(value)) return MIN_SIDE;
  const whole = Math.floor(value);
  return Math.max(MIN_SIDE, whole - (whole % 2));
}

/** Output frame for a requested size: sides rounded down to even (at least 2), aspect from those sides. */
export function filmFrameFor(width: number, height: number): FilmFrame {
  const w = evenSide(width);
  const h = evenSide(height);
  return { width: w, height: h, aspect: w / h };
}

/** Largest box of the given aspect that fits inside the container, centred (letterbox or pillarbox). */
export function fitInside(box: { width: number; height: number }, aspect: number): FittedBox {
  const { width: bw, height: bh } = box;
  if (!(aspect > 0) || !(bw > 0) || !(bh > 0)) return { width: bw, height: bh, left: 0, top: 0 };
  let w = bw;
  let h = w / aspect;
  if (h > bh) {
    h = bh;
    w = h * aspect;
  }
  return { width: w, height: h, left: (bw - w) / 2, top: (bh - h) / 2 };
}

interface Saved {
  root: FilmRoot;
  frame: FilmFrame;
  /** Pixel ratio to restore: the latest value R3F asked for during the film. */
  pixelRatio: number;
  /** Window (CSS) size to restore: the latest size R3F asked for during the film. */
  css: { width: number; height: number };
  aspect: number | null;
  style: FilmStyle;
}

interface Guard {
  gl: FilmGl;
  setSize: FilmGl['setSize'];
  setPixelRatio: FilmGl['setPixelRatio'];
}

let root: FilmRoot | null = null;
/** Set only while a film size is applied. */
let saved: Saved | null = null;
/** Hook on the renderer that holds R3F's resize while a film size is applied. */
let guard: Guard | null = null;
/** True while the bridge itself calls the renderer (those calls must pass through the guard). */
let busy = false;

function ours<T>(fn: () => T): T {
  const prev = busy;
  busy = true;
  try {
    return fn();
  } finally {
    busy = prev;
  }
}

function fitCanvas(s: Saved): void {
  const box = fitInside(s.css, s.frame.aspect);
  const style = s.root.gl.domElement.style;
  style.width = `${box.width}px`;
  style.height = `${box.height}px`;
  style.marginLeft = `${box.left}px`;
  style.marginTop = `${box.top}px`;
}

function removeGuard(): void {
  if (!guard) return;
  guard.gl.setSize = guard.setSize;
  guard.gl.setPixelRatio = guard.setPixelRatio;
  guard = null;
}

function installGuard(gl: FilmGl): void {
  if (guard && guard.gl === gl) return;
  removeGuard();
  const original = { setSize: gl.setSize, setPixelRatio: gl.setPixelRatio };
  guard = { gl, setSize: original.setSize, setPixelRatio: original.setPixelRatio };
  gl.setSize = (width, height, updateStyle) => {
    if (busy || !saved || saved.root.gl !== gl) {
      original.setSize.call(gl, width, height, updateStyle);
      return;
    }
    // Window resized while filming: keep the film buffer, remember the window size, refit the preview.
    saved.css = { width, height };
    fitCanvas(saved);
  };
  gl.setPixelRatio = (ratio) => {
    if (busy || !saved || saved.root.gl !== gl) {
      original.setPixelRatio.call(gl, ratio);
      return;
    }
    saved.pixelRatio = ratio;
  };
}

/**
 * Sets the scene root the bridge drives (PostFX registers it). Passing null, or a different root, first
 * restores any applied film size on the previous root and removes its guard.
 */
export function registerFilmRoot(next: FilmRoot | null): void {
  if (root !== next) restoreFilmSize();
  if (guard && guard.gl !== next?.gl) removeGuard();
  root = next;
  if (next) installGuard(next.gl);
}

/**
 * Applies the film output size to the registered root. Returns false when no root is registered.
 * Repeat calls re-apply the target size without overwriting the saved previous state.
 */
export function applyFilmSize(width: number, height: number): boolean {
  if (!root) return false;
  const r = root;
  if (!saved || saved.root !== r) {
    const target: SizeTarget = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; return this; } };
    const size = r.gl.getSize(target);
    const style = r.gl.domElement.style;
    saved = {
      root: r,
      frame: filmFrameFor(width, height),
      pixelRatio: r.gl.getPixelRatio(),
      css: { width: size.x, height: size.y },
      aspect: r.camera ? r.camera.aspect : null,
      style: { width: style.width, height: style.height, marginLeft: style.marginLeft, marginTop: style.marginTop },
    };
  }
  const s = saved;
  s.frame = filmFrameFor(width, height);
  ours(() => {
    s.root.gl.setPixelRatio(1);
    s.root.gl.setSize(s.frame.width, s.frame.height, false);
  });
  if (s.root.camera) {
    s.root.camera.aspect = s.frame.aspect;
    s.root.camera.updateProjectionMatrix();
  }
  if (s.root.composer) {
    s.root.composer.setPixelRatio(1);
    s.root.composer.setSize(s.frame.width, s.frame.height);
  }
  fitCanvas(s);
  return true;
}

/** Restores the window size, pixel ratio, camera and composer saved by the first apply. No-op when idle. */
export function restoreFilmSize(): void {
  const s = saved;
  if (!s) return;
  saved = null;
  const r = s.root;
  ours(() => {
    r.gl.setPixelRatio(s.pixelRatio);
    r.gl.setSize(s.css.width, s.css.height, true);
  });
  r.gl.domElement.style.marginLeft = s.style.marginLeft;
  r.gl.domElement.style.marginTop = s.style.marginTop;
  if (r.camera && s.aspect !== null) {
    r.camera.aspect = s.aspect;
    r.camera.updateProjectionMatrix();
  }
  if (r.composer) {
    r.composer.setPixelRatio(s.pixelRatio);
    r.composer.setSize(s.css.width, s.css.height);
  }
}

/** True while a film size is applied. */
export function isFilmSizeApplied(): boolean {
  return saved !== null;
}

// HMR: a replaced module must not leave the scene at film size or a renderer hook behind.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    restoreFilmSize();
    removeGuard();
  });
}
