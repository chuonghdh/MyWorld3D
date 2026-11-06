// HouseMesh state and buffers: triangle buffers, wind, surface and layer bookkeeping (split from mesh.ts).

import { SURFACE } from '../surface';
import { paneSeed, type WindCode } from './polish';
import { fixedFace, type LayerBox, type LayerLimits, type Solid } from './layers';
import { Target, Col, Frame, HOUSE_FRAME } from './meshBasics';

/** Growable Float32Array. */
class FBuf {
  a = new Float32Array(3072);
  len = 0;
  push1(x: number): void {
    if (this.len + 1 > this.a.length) {
      const b = new Float32Array(this.a.length * 2);
      b.set(this.a);
      this.a = b;
    }
    this.a[this.len++] = x;
  }
  push2(x: number, y: number): void {
    this.push1(x);
    this.push1(y);
  }
  push3(x: number, y: number, z: number): void {
    if (this.len + 3 > this.a.length) {
      const b = new Float32Array(this.a.length * 2);
      b.set(this.a);
      this.a = b;
    }
    this.a[this.len++] = x;
    this.a[this.len++] = y;
    this.a[this.len++] = z;
  }
  take(): Float32Array {
    return this.a.slice(0, this.len);
  }
}

export interface Buf {
  p: FBuf;
  n: FBuf;
  c: FBuf;
  /** Surface ids, one float per vertex (body only). */
  s: FBuf | null;
  /** Shadow-caster flags, one float per vertex (body only). */
  k: FBuf | null;
  /**
   * Second texture channel pair. Body: (wind id, anchor weight). Glass that glows (glassLit): (pane seed, 0).
   * Sign: atlas coordinates. Other meshes: none (zeros are written at build time).
   */
  uv: FBuf | null;
  /** Wind attribute (id, weight), sign only: its uv holds the atlas cell. */
  w: FBuf | null;
  t: Target;
}

function newBuf(t: Target): Buf {
  return {
    p: new FBuf(),
    n: new FBuf(),
    c: new FBuf(),
    s: t === 'body' ? new FBuf() : null,
    k: t === 'body' ? new FBuf() : null,
    uv: t === 'sign' || t === 'body' || t === 'glassLit' ? new FBuf() : null,
    w: t === 'sign' ? new FBuf() : null,
    t,
  };
}

export interface PendingBox extends LayerBox {
  t: Target;
  c: Col;
  top: Col;
  surface: number;
  caster: boolean;
  windCode: number;
  windWeight: WindWeight | null;
  src: string;
}

/** Anchor weight 0..1 of a vertex given in frame coordinates (u, y, n). */
export type WindWeight = (u: number, y: number, n: number) => number;

export abstract class HouseMeshCore {
  /** Implemented by HouseMeshShapes: writes the pending boxes into the buffers. */
  protected abstract flush(): void;

  frame: Frame = HOUSE_FRAME;
  /** Surface id written for every body vertex emitted from now on (see ../surface.ts). */
  surface: number = SURFACE.PLAIN;
  protected readonly bufs: Record<Target, Buf> = {
    body: newBuf('body'),
    glass: newBuf('glass'),
    glassLit: newBuf('glassLit'),
    sign: newBuf('sign'),
  };
  /** Boxes waiting for the layering pass (see layers.ts). */
  protected pending: PendingBox[] = [];
  /** Emitted polygons that boxes must keep clear of (panes, gable ends ...). */
  protected fixed: ReturnType<typeof fixedFace>[] = [];
  /** Closed volumes (the house core) that hide the faces of boxes standing on them. */
  protected solids: Solid[] = [];
  /** Where equally facing faces may be pushed to (set by the house: its lot plus allowed projections). */
  limits: LayerLimits | null = null;

  /** Wind behaviour id (WIND.*) written for body and sign vertices emitted from now on; 0 = none. */
  windCode: number = 0;
  /** Anchor weight of the current wind behaviour; null = weight 1 everywhere. */
  windWeight: WindWeight | null = null;
  /** Running index of glowing panes (seeds the evening light schedule). */
  protected paneCount = 0;
  /** Seed shared by every piece of one window (curtain quads, glass), or null for one seed per polygon. */
  protected fixedSeed: number | null = null;

  /** Runs fn with wind behaviour `code` and anchor weight `weight` (frame coordinates), then restores. */
  withWind(code: WindCode, weight: WindWeight | null, fn: () => void): void {
    const pc = this.windCode;
    const pw = this.windWeight;
    this.windCode = code;
    this.windWeight = weight;
    try {
      fn();
    } finally {
      this.windCode = pc;
      this.windWeight = pw;
    }
  }

  /** Runs fn so that all glowing glass in it shares one schedule seed (one window). */
  paneGroup(fn: () => void): void {
    const prev = this.fixedSeed;
    this.fixedSeed = prev ?? paneSeed(this.paneCount++);
    try {
      fn();
    } finally {
      this.fixedSeed = prev;
    }
  }

  /** Runs fn with the given body surface id, then restores the previous one. */
  withSurface(id: number, fn: () => void): void {
    const prev = this.surface;
    this.surface = id;
    try {
      fn();
    } finally {
      this.surface = prev;
    }
  }

  /** Caster flag written for the box being emitted. */
  protected caster = true;

  /** Frame of the box being emitted (box() defers emission, so this.frame may have moved on). */
  protected emitFrame: Frame = HOUSE_FRAME;

  /** Appends the per-vertex extras of one box vertex at house coordinates (x, y, z): surface, caster, wind. */
  protected extraAt(buf: Buf, x: number, y: number, z: number): void {
    if (buf.s) buf.s.push1(this.surface);
    if (buf.k) buf.k.push1(this.caster ? 1 : 0);
    let id = 0;
    let wt = 0;
    if (this.windCode !== 0 && (buf.t === 'body' || buf.t === 'sign')) {
      id = this.windCode;
      if (this.windWeight) {
        const f = this.emitFrame;
        const dx = x - f.ox;
        const dz = z - f.oz;
        wt = this.windWeight(dx * f.ux + dz * f.uz, y, dx * f.nx + dz * f.nz);
      } else wt = 1;
    }
    if (buf.t === 'body') buf.uv?.push2(id, wt);
    else if (buf.uv) buf.uv.push2(0, 0);
    if (buf.w) buf.w.push2(id, wt);
  }

  /** Triangle count so far. */
  get triangles(): number {
    this.flush();
    let t = 0;
    for (const b of Object.values(this.bufs)) t += b.p.len / 9;
    return t;
  }
}
