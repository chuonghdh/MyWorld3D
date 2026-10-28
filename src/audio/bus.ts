// Positional audio bus. Every source owns an Emitter (its own node chain and PannerNode at the object's
// position) feeding a category bus; categories feed user groups, groups feed the zoom attenuation and master.
//
//   source -> Emitter.input(gain) -> distance lowpass -> PannerNode -> category bus
//          -> group gain -> zoom gain -> master -> destination

import { distanceLowpassHz, zoomAttenuation, clamp01 } from './math';
import type { ListenerState } from './listener';

export { VoiceBudget } from './voiceBudget';
export type { VoiceCandidate, VoiceBudgetOptions } from './voiceBudget';

export const CATEGORIES = [
  'engine',
  'horn',
  'indicator',
  'voice',
  'footstep',
  'bird',
  'wing',
  'dog',
  'cat',
  'aircraft',
  'leaves',
  'wind',
  'rain',
  'thunder',
  'ambience',
  'music',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const GROUPS = ['effects', 'nature', 'music'] as const;
export type Group = (typeof GROUPS)[number];

export const CATEGORY_GROUP: Record<Category, Group> = {
  engine: 'effects',
  horn: 'effects',
  indicator: 'effects',
  voice: 'effects',
  footstep: 'effects',
  dog: 'effects',
  cat: 'effects',
  aircraft: 'effects',
  bird: 'nature',
  wing: 'nature',
  leaves: 'nature',
  wind: 'nature',
  rain: 'nature',
  thunder: 'nature',
  ambience: 'nature',
  music: 'music',
};

/** Plain numbers 0..1 only, safe to JSON-persist. */
export interface VolumeSettings {
  master: number;
  groups: Record<Group, number>;
  categories: Record<Category, number>;
}

export type PartialVolumes = Partial<{
  master: number;
  groups: Partial<Record<Group, number>>;
  categories: Partial<Record<Category, number>>;
}>;

export function defaultVolumes(): VolumeSettings {
  const categories = {} as Record<Category, number>;
  for (const c of CATEGORIES) categories[c] = 1;
  return { master: 0.8, groups: { effects: 1, nature: 1, music: 1 }, categories };
}

export interface EmitterOptions {
  category: Category;
  x: number;
  y: number;
  z: number;
  /** Distance at which gain starts to fall (m). Default 4. */
  refDistance?: number;
  /** Distance after which the gain stops falling (m). Default 250. */
  maxDistance?: number;
  /** Inverse-model rolloff factor. Default 1. */
  rolloff?: number;
}

export interface Emitter {
  /** Connect sources here. */
  readonly input: AudioNode;
  setPosition(x: number, y: number, z: number): void;
  setGain(g: number): void;
  dispose(): void;
}

const SMOOTH_S = 0.03;

function setPos(p: PannerNode, x: number, y: number, z: number): void {
  if (p.positionX) {
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
  } else {
    p.setPosition(x, y, z);
  }
}

export class AudioBus {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  private readonly zoom: GainNode;
  private readonly groupNodes = {} as Record<Group, GainNode>;
  private readonly categoryNodes = {} as Record<Category, GainNode>;
  private readonly emitters = new Set<EmitterImpl>();
  private readonly volumes: VolumeSettings = defaultVolumes();
  private listener: ListenerState = {
    x: 0,
    y: 2,
    z: 0,
    forward: { x: 0, y: 0, z: -1 },
    up: { x: 0, y: 1, z: 0 },
    height: 0,
  };
  private muted = false;
  /** City sound (the effects and nature groups) switched off; music is a separate switch. */
  private soundMuted = false;

  constructor(ctx: AudioContext, master: GainNode) {
    this.ctx = ctx;
    this.master = master;
    this.zoom = ctx.createGain();
    this.zoom.connect(master);
    for (const g of GROUPS) {
      const n = ctx.createGain();
      n.connect(this.zoom);
      this.groupNodes[g] = n;
    }
    for (const c of CATEGORIES) {
      const n = ctx.createGain();
      n.connect(this.groupNodes[CATEGORY_GROUP[c]]);
      this.categoryNodes[c] = n;
    }
    this.applyAll();
  }

  /** The category's gain node, for sources that are not positional (weather beds, music). */
  category(cat: Category): GainNode {
    return this.categoryNodes[cat];
  }

  getListener(): ListenerState {
    return this.listener;
  }

  getVolumes(): VolumeSettings {
    return {
      master: this.volumes.master,
      groups: { ...this.volumes.groups },
      categories: { ...this.volumes.categories },
    };
  }

  /** Applies a (possibly partial) settings object, e.g. loaded from storage. Non-finite values are ignored. */
  setVolumes(v: PartialVolumes): void {
    if (v.master !== undefined) this.setMasterVolume(v.master);
    if (v.groups) for (const g of GROUPS) if (v.groups[g] !== undefined) this.setGroupVolume(g, v.groups[g] as number);
    if (v.categories) for (const c of CATEGORIES) if (v.categories[c] !== undefined) this.setCategoryVolume(c, v.categories[c] as number);
  }

  setMasterVolume(v: number): void {
    if (Number.isFinite(v)) this.volumes.master = clamp01(v);
    this.applyMaster();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyMaster();
  }

  /** The Sound switch: silences the effects and nature groups, never music. */
  setSoundMuted(m: boolean): void {
    this.soundMuted = m;
    for (const g of GROUPS) this.smooth(this.groupNodes[g].gain, this.groupLevel(g));
  }

  private groupLevel(group: Group): number {
    return group !== 'music' && this.soundMuted ? 0 : this.volumes.groups[group];
  }

  setCategoryVolume(cat: Category, v: number): void {
    if (Number.isFinite(v)) this.volumes.categories[cat] = clamp01(v);
    this.smooth(this.categoryNodes[cat].gain, this.volumes.categories[cat]);
  }

  setGroupVolume(group: Group, v: number): void {
    if (Number.isFinite(v)) this.volumes.groups[group] = clamp01(v);
    this.smooth(this.groupNodes[group].gain, this.groupLevel(group));
  }

  /** Sets listener position and orientation, the zoom attenuation, and refreshes emitter lowpass filters. */
  setListener(l: ListenerState): void {
    this.listener = l;
    const L = this.ctx.listener;
    if (L.positionX) {
      L.positionX.value = l.x;
      L.positionY.value = l.y;
      L.positionZ.value = l.z;
    } else {
      L.setPosition(l.x, l.y, l.z);
    }
    if (L.forwardX) {
      L.forwardX.value = l.forward.x;
      L.forwardY.value = l.forward.y;
      L.forwardZ.value = l.forward.z;
      L.upX.value = l.up.x;
      L.upY.value = l.up.y;
      L.upZ.value = l.up.z;
    } else {
      L.setOrientation(l.forward.x, l.forward.y, l.forward.z, l.up.x, l.up.y, l.up.z);
    }
    this.smooth(this.zoom.gain, zoomAttenuation(l.height), 0.1);
    for (const e of this.emitters) e.refreshDistance();
  }

  createEmitter(opts: EmitterOptions): Emitter {
    const e = new EmitterImpl(this, opts);
    this.emitters.add(e);
    return e;
  }

  get emitterCount(): number {
    return this.emitters.size;
  }

  /** Disposes every emitter and disconnects the bus graph. */
  dispose(): void {
    for (const e of [...this.emitters]) e.dispose();
    this.emitters.clear();
    for (const c of CATEGORIES) this.categoryNodes[c].disconnect();
    for (const g of GROUPS) this.groupNodes[g].disconnect();
    this.zoom.disconnect();
  }

  /** @internal */
  _release(e: EmitterImpl): void {
    this.emitters.delete(e);
  }

  /** @internal */
  _smooth(p: AudioParam, v: number, tc = SMOOTH_S): void {
    this.smooth(p, v, tc);
  }

  private applyAll(): void {
    this.applyMaster();
    for (const g of GROUPS) this.smooth(this.groupNodes[g].gain, this.groupLevel(g));
    for (const c of CATEGORIES) this.smooth(this.categoryNodes[c].gain, this.volumes.categories[c]);
  }

  private applyMaster(): void {
    this.smooth(this.master.gain, this.muted ? 0 : this.volumes.master, 0.05);
  }

  private smooth(p: AudioParam, v: number, tc = SMOOTH_S): void {
    const t = this.ctx.currentTime;
    if (typeof p.setTargetAtTime === 'function') p.setTargetAtTime(v, t, tc);
    else p.value = v;
  }
}

class EmitterImpl implements Emitter {
  readonly input: GainNode;
  private readonly lp: BiquadFilterNode;
  private readonly panner: PannerNode;
  private x: number;
  private y: number;
  private z: number;
  private lastHz = -1;
  private disposed = false;

  constructor(private readonly bus: AudioBus, opts: EmitterOptions) {
    const ctx = bus.ctx;
    this.x = opts.x;
    this.y = opts.y;
    this.z = opts.z;
    this.input = ctx.createGain();
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = 0.5;
    this.panner = ctx.createPanner();
    this.panner.panningModel = 'equalpower';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = opts.refDistance ?? 4;
    this.panner.maxDistance = opts.maxDistance ?? 250;
    this.panner.rolloffFactor = opts.rolloff ?? 1;
    this.input.connect(this.lp);
    this.lp.connect(this.panner);
    this.panner.connect(bus.category(opts.category));
    setPos(this.panner, this.x, this.y, this.z);
    this.refreshDistance(true);
  }

  setPosition(x: number, y: number, z: number): void {
    if (this.disposed) return;
    this.x = x;
    this.y = y;
    this.z = z;
    setPos(this.panner, x, y, z);
    this.refreshDistance();
  }

  setGain(g: number): void {
    if (this.disposed) return;
    this.bus._smooth(this.input.gain, Math.max(0, g));
  }

  /** Recomputes the distance lowpass; skips the AudioParam write when the cutoff barely changed. */
  refreshDistance(force = false): void {
    if (this.disposed) return;
    const l = this.bus.getListener();
    const hz = distanceLowpassHz(Math.hypot(this.x - l.x, this.y - l.y, this.z - l.z));
    if (!force && Math.abs(hz - this.lastHz) < this.lastHz * 0.03) return;
    this.lastHz = hz;
    this.bus._smooth(this.lp.frequency, hz, 0.05);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.input.disconnect();
    this.lp.disconnect();
    this.panner.disconnect();
    this.bus._release(this);
  }
}
