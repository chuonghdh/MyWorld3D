// Thunder and lightning. The scheduling, flash envelope, thunder queue and bolt geometry are plain
// logic (testable without a GPU); LightningBolt is the one mesh that shows the bolt.
import { skyEnvironment } from '../config/tuning';
import * as THREE from 'three';
import { SPEED_OF_SOUND, thunderDelay } from './weatherState';

export { SPEED_OF_SOUND, thunderDelay };

export const FLASH_MIN_S = skyEnvironment.weather.lightningFlashMinS;
export const FLASH_MAX_S = skyEnvironment.weather.lightningFlashMaxS;
/** Strikes farther than this are only heard and seen as a sky flash, no bolt mesh. */
export const BOLT_VISIBLE_DISTANCE = skyEnvironment.weather.boltVisibleM;

export interface Strike {
  /** Distance from the camera in metres (drives the thunder delay and the flash strength). */
  distance: number;
  /** Compass direction of the strike, radians (angle in the XZ plane). */
  angle: number;
  /** Flash length in seconds, within FLASH_MIN_S..FLASH_MAX_S. */
  duration: number;
  /** Peak flash strength 0..1 (falls with distance). */
  strength: number;
}

export interface Thunder {
  /** Compass direction of the strike (radians in the XZ plane), same as Strike.angle. */
  angle: number;
  distance: number;
  strength: number;
  /** Seconds left until the sound is due. */
  remaining: number;
}

/** Flash envelope over normalised time u in 0..1: a hard main pulse, a dip, a weaker re-strike, decay. */
export function flashEnvelope(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  const main = u < 0.04 ? u / 0.04 : Math.exp(-(u - 0.04) * 9);
  const second = u > 0.34 ? Math.exp(-(u - 0.34) * 14) * 0.75 * Math.min(1, (u - 0.34) / 0.03) : 0;
  return Math.min(1, Math.max(main, second));
}

export interface LightningOptions {
  /** Returns a number in 0..1. Defaults to Math.random (visual only, not tied to the city seed). */
  random?: () => number;
}

/**
 * Storm lightning. Call update(dt, stormAmount, intensity); it returns nothing but exposes `flash`
 * (0..1 now), `strike` while a bolt is showing, and a thunder queue drained by takeThunder().
 */
export class LightningController {
  flash = 0;
  /** The strike being shown, or null. */
  strike: Strike | null = null;
  /** Normalised time 0..1 through the current flash. */
  progress = 0;
  private timer = 3;
  private elapsed = 0;
  private pending: Thunder[] = [];
  private due: Thunder[] = [];
  private rnd: () => number;

  constructor(opts: LightningOptions = {}) {
    this.rnd = opts.random ?? Math.random;
    this.timer = 2 + this.rnd() * 3;
  }

  /** Starts a strike now (tests, or a debug key). Returns it. */
  trigger(distance?: number): Strike {
    const d = distance ?? 150 + this.rnd() * this.rnd() * 2600;
    const strength = Math.max(0.3, 1 - d / 3200);
    const strike: Strike = {
      distance: d,
      angle: this.rnd() * Math.PI * 2,
      duration: FLASH_MIN_S + this.rnd() * (FLASH_MAX_S - FLASH_MIN_S),
      strength,
    };
    this.strike = strike;
    this.elapsed = 0;
    this.pending.push({ angle: strike.angle, distance: d, strength, remaining: thunderDelay(d) });
    return strike;
  }

  /**
   * @param storm 0..1 how much storm there is (eased); strikes only start above 0.6
   * @param intensity 0..1 slider; more intensity means shorter gaps
   */
  update(dt: number, storm: number, intensity: number): void {
    if (this.strike) {
      this.elapsed += dt;
      this.progress = this.elapsed / this.strike.duration;
      if (this.progress >= 1) {
        this.strike = null;
        this.flash = 0;
        this.progress = 0;
        // Sometimes a quick second strike follows.
        this.timer = this.rnd() < 0.25 ? 0.3 + this.rnd() * 0.8 : this.gap(intensity);
      } else {
        this.flash = flashEnvelope(this.progress) * this.strike.strength;
      }
    } else {
      this.flash = 0;
      if (storm > 0.6) {
        this.timer -= dt;
        if (this.timer <= 0) this.trigger();
      } else {
        // Weather is not a storm (or is fading out): no new strikes, and the timer restarts.
        this.timer = Math.max(this.timer, 2);
      }
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const t = this.pending[i];
      t.remaining -= dt;
      if (t.remaining <= 0) {
        this.due.push(t);
        this.pending.splice(i, 1);
      }
    }
  }

  private gap(intensity: number): number {
    const lo = 6 - 3.5 * intensity;
    return lo + this.rnd() * (10 - 5 * intensity);
  }

  /** Thunder claps whose delay has elapsed since the last call. The returned array is reused. */
  takeThunder(out: Thunder[] = []): Thunder[] {
    out.length = 0;
    for (const t of this.due) out.push(t);
    this.due.length = 0;
    return out;
  }

  /** Thunder claps still travelling. */
  get pendingCount(): number {
    return this.pending.length;
  }

  /** Cancels everything (weather changed away from storm). Keeps already due thunder. */
  clearPending(): void {
    this.pending.length = 0;
  }
}

/**
 * Jagged bolt polyline from the sky to the ground as vertex positions (x,y,z triples), plus a few
 * branches. Deterministic for a given random function.
 */
export function generateBolt(rnd: () => number, top: number, segments = 16): Float32Array {
  const out: number[] = [];
  let x = 0;
  let z = 0;
  const pts: [number, number, number][] = [[0, top, 0]];
  for (let i = 1; i <= segments; i++) {
    const y = top * (1 - i / segments);
    x += (rnd() - 0.5) * top * 0.09;
    z += (rnd() - 0.5) * top * 0.03;
    pts.push([x, y, z]);
  }
  for (let i = 0; i < pts.length - 1; i++) out.push(...pts[i], ...pts[i + 1]);
  // two branches
  for (let b = 0; b < 2; b++) {
    const start = pts[3 + Math.floor(rnd() * (segments - 6))];
    let bx = start[0];
    let by = start[1];
    const dirx = rnd() < 0.5 ? -1 : 1;
    for (let i = 0; i < 4; i++) {
      const nx = bx + dirx * (0.02 + rnd() * 0.05) * top;
      const ny = by - (0.03 + rnd() * 0.05) * top;
      out.push(bx, by, start[2], nx, ny, start[2]);
      bx = nx;
      by = ny;
    }
  }
  return new Float32Array(out);
}

const MAX_SEGMENTS = 40;

/** The bolt mesh: camera-facing ribbons, additive, hidden (no draw call) unless a bolt is showing. */
export class LightningBolt {
  readonly mesh: THREE.Mesh;
  private geo = new THREE.BufferGeometry();
  private mat: THREE.MeshBasicMaterial;
  private pos = new Float32Array(MAX_SEGMENTS * 4 * 3);
  private rnd: () => number;

  constructor(random: () => number = Math.random) {
    this.rnd = random;
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const idx: number[] = [];
    for (let i = 0; i < MAX_SEGMENTS; i++) {
      const o = i * 4;
      idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
    this.geo.setIndex(idx);
    this.mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.85, 0.9, 1.0),
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 22;
    this.mesh.visible = false;
    this.mesh.name = 'weather-bolt';
  }

  /** Builds a new bolt for a strike seen from `cam`. Only strikes closer than BOLT_VISIBLE_DISTANCE show. */
  place(strike: Strike, cam: { x: number; z: number }): void {
    if (strike.distance > BOLT_VISIBLE_DISTANCE) {
      this.mesh.visible = false;
      return;
    }
    const top = 160 + strike.distance * 0.35;
    const lines = generateBolt(this.rnd, top);
    const dx = Math.cos(strike.angle);
    const dz = Math.sin(strike.angle);
    const bx = cam.x + dx * strike.distance;
    const bz = cam.z + dz * strike.distance;
    // ribbon width direction: horizontal, perpendicular to the view direction
    const rx = -dz;
    const rz = dx;
    const width = 0.9 + strike.distance * 0.006;
    const n = Math.min(MAX_SEGMENTS, lines.length / 6);
    for (let i = 0; i < n; i++) {
      const a = i * 6;
      const w = i < 16 ? width : width * 0.5;
      const o = i * 12;
      // lateral jitter coordinates (lines[x]) go along the ribbon's own horizontal axis (rx,rz)
      const ax = bx + rx * lines[a] + dx * lines[a + 2];
      const az = bz + rz * lines[a] + dz * lines[a + 2];
      const cx = bx + rx * lines[a + 3] + dx * lines[a + 5];
      const cz = bz + rz * lines[a + 3] + dz * lines[a + 5];
      this.pos.set([ax - rx * w, lines[a + 1], az - rz * w, ax + rx * w, lines[a + 1], az + rz * w,
        cx - rx * w, lines[a + 4], cz - rz * w, cx + rx * w, lines[a + 4], cz + rz * w], o);
    }
    for (let i = n; i < MAX_SEGMENTS; i++) this.pos.fill(0, i * 12, i * 12 + 12);
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.mesh.visible = true;
  }

  /** Brightness follows the flash; hides when it ends. */
  setFlash(flash: number): void {
    if (flash <= 0.01) {
      this.mesh.visible = false;
      return;
    }
    if (this.mesh.visible) this.mat.opacity = Math.min(1, flash * 1.4);
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
