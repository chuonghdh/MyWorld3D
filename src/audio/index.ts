// Audio facade for MyWorld3D. All sound is procedural (no files), object-oriented and positional:
// every source is a SoundSystem (see frame.ts, systems.ts) that owns bus emitters. See docs/AUDIO.md.
// Call init() from a user gesture (browsers block autoplay); every other call is a no-op before that.

import { AudioBus, type Category, type Group, type PartialVolumes, type VolumeSettings, defaultVolumes } from './bus';
import type { AudioFrame, SoundSystem, AudioVehicleClass } from './frame';
import { SOUND_SYSTEM_FACTORIES } from './systems';

export type VehicleClass = AudioVehicleClass;
export type { AudioFrame, SoundSystem, SoundSystemFactory } from './frame';
export type { Category, Group, VolumeSettings } from './bus';
export { listenerFromCamera, type ListenerState } from './listener';

type AudioWindow = {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
  /** The one live context of this page, kept outside the module so a hot reload cannot orphan it. */
  __mwAudioContext?: AudioContext | null;
};

let ctx: AudioContext | null = null;
let bus: AudioBus | null = null;
let systems: SoundSystem[] = [];
let soundEnabled = true;
/** Volumes requested before init() (or kept across it); applied to the bus on creation. */
const volumes: VolumeSettings = defaultVolumes();
const warned = new Set<string>();

function warnOnce(name: string, err: unknown): void {
  if (warned.has(name)) return;
  warned.add(name);
  console.warn(`[audio] sound system "${name}" failed and will keep being skipped on errors:`, err);
}

/**
 * Creates the AudioContext, master, bus and all sound systems. Call from a click or key handler.
 * Returns false if Web Audio is unavailable. Safe to call again.
 */
export function init(): boolean {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  }
  const w = window as unknown as AudioWindow;
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return false;

  // A previous module instance (hot reload) may have left a context running with nothing able to mute or stop
  // it: that is an un-mutable hiss. Close it before creating the new one.
  if (w.__mwAudioContext) {
    void w.__mwAudioContext.close().catch(() => undefined);
    w.__mwAudioContext = null;
  }
  const context = new Ctor();
  w.__mwAudioContext = context;
  const master = context.createGain();
  // A limiter between master and speakers: loud moments (thunder over a storm) compress instead of clipping.
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -9;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter);
  limiter.connect(context.destination);
  const b = new AudioBus(context, master);
  b.setVolumes(volumes);
  b.setSoundMuted(!soundEnabled);
  ctx = context;
  bus = b;

  systems = [];
  for (const make of SOUND_SYSTEM_FACTORIES) {
    try {
      systems.push(make(context, b));
    } catch (err) {
      warnOnce('factory', err);
    }
  }
  return true;
}

export function isReady(): boolean {
  return ctx !== null;
}

/** Above this camera height (m) the city is heard only as birds, rain, thunder, music and passing aircraft. */
export const AERIAL_HEIGHT_M = 45;

/** The frame with every ground source and the wind removed, so those systems fade out; rain and thunder stay. */
export function quietFrame(f: AudioFrame): AudioFrame {
  return {
    ...f, night: false, windSpeed: 0, gust: 0, vehicles: [], pedestrians: [], trees: [],
    church: null, lifeEvents: [], horns: [],
    // Airliners are 200-300 m up and heard from the overview too (quietly, by distance and the zoom factor).
    aircraft: f.aircraft,
  };
}

/** The frame for the bird system: no walkers (so no dogs) and only bird life events (no cats). */
function birdsOnlyFrame(f: AudioFrame): AudioFrame {
  const events = f.lifeEvents.filter((e) => e.type === 'bird-call' || e.type === 'pigeon-scatter');
  return { ...f, pedestrians: [], lifeEvents: events };
}

/**
 * Once per render frame: sets the listener from the camera and lets every sound system react.
 * A failing system is skipped (one console warning) and never silences the others.
 */
export function update(frame: AudioFrame): void {
  if (!ctx || !bus || ctx.state !== 'running') return;
  try {
    bus.setListener(frame.listener);
  } catch (err) {
    warnOnce('listener', err);
  }
  const aerial = frame.listener.height > AERIAL_HEIGHT_M;
  const quiet = aerial ? quietFrame(frame) : frame;
  const birdsOnly = aerial ? birdsOnlyFrame(frame) : frame;
  for (const s of systems) {
    // Sound off silences the city's sounds, but music has its own switch (frame.musicEnabled) and keeps running.
    if (!soundEnabled && s.name !== 'music') continue;
    try {
      // From high above only birds (songs and wing flaps) and music are heard; the street below stays silent.
      s.update(s.name === 'music' ? frame : s.name === 'animals' ? birdsOnly : quiet);
    } catch (err) {
      warnOnce(s.name, err);
    }
  }
}

/** The Sound switch (city sounds). Mirrors WorldSettings.soundEnabled; music is switched separately. */
export function setSoundEnabled(on: boolean): void {
  soundEnabled = on;
  bus?.setSoundMuted(!on);
}

export function setMasterVolume(v: number): void {
  if (Number.isFinite(v)) volumes.master = Math.min(1, Math.max(0, v));
  bus?.setMasterVolume(v);
}

export function setCategoryVolume(cat: Category, v: number): void {
  if (Number.isFinite(v)) volumes.categories[cat] = Math.min(1, Math.max(0, v));
  bus?.setCategoryVolume(cat, v);
}

export function setGroupVolume(group: Group, v: number): void {
  if (Number.isFinite(v)) volumes.groups[group] = Math.min(1, Math.max(0, v));
  bus?.setGroupVolume(group, v);
}

/** Applies a persisted (possibly partial) volume object. */
export function setVolumes(v: PartialVolumes): void {
  if (bus) bus.setVolumes(v);
  if (v.master !== undefined && Number.isFinite(v.master)) volumes.master = Math.min(1, Math.max(0, v.master));
  for (const [g, x] of Object.entries(v.groups ?? {})) if (Number.isFinite(x)) volumes.groups[g as Group] = Math.min(1, Math.max(0, x as number));
  for (const [c, x] of Object.entries(v.categories ?? {})) if (Number.isFinite(x)) volumes.categories[c as Category] = Math.min(1, Math.max(0, x as number));
}

/** Plain-number snapshot (master, three groups, every category) that can be JSON-persisted. */
export function getGroupVolumes(): VolumeSettings {
  return {
    master: volumes.master,
    groups: { ...volumes.groups },
    categories: { ...volumes.categories },
  };
}

/** Releases the audio context. Use when the scene unmounts. */
export function dispose(): void {
  for (const s of systems) {
    try {
      s.dispose();
    } catch (err) {
      warnOnce(s.name, err);
    }
  }
  systems = [];
  bus?.dispose();
  bus = null;
  if (ctx) void ctx.close();
  const w = window as unknown as AudioWindow;
  if (w.__mwAudioContext === ctx) w.__mwAudioContext = null;
  ctx = null;
}

// Hot module reload: this module instance is about to be replaced, so stop its sound for good.
if (import.meta.hot) {
  import.meta.hot.dispose(() => dispose());
}
