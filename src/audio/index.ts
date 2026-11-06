// Audio facade for MyWorld3D. All sound is procedural (no files), object-oriented and positional:
// every source is a SoundSystem (see frame.ts, systems.ts) that owns bus emitters. See docs/AUDIO.md.
// Call init() from a user gesture (browsers block autoplay); every other call is a no-op before that.

import { AudioBus, type Category, type Group, type PartialVolumes, type VolumeSettings, defaultVolumes } from './bus';
import type { AudioFrame, SoundSystem, AudioVehicleClass } from './frame';
import { SOUND_SYSTEM_FACTORIES } from './systems';
import { createRecordTap, type RecordTap } from './recordTap';
import { createMixChain } from './mixChain';
import { routeFrame } from './route';
import { playUiCue, uiCueAllowed, uiCueParams, type UiCueKind } from './uiCue';
import { audio as audioTuning } from '../config/tuning';

export { quietFrame } from './route';
export type { UiCueKind } from './uiCue';

export type VehicleClass = AudioVehicleClass;
export type { AudioFrame, SoundSystem, SoundSystemFactory } from './frame';
export type { Category, Group, VolumeSettings } from './bus';
export { listenerFromCamera, AERIAL_HEIGHT_M, type ListenerState } from './listener';

type AudioWindow = {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
  /** The one live context of this page, kept outside the module so a hot reload cannot orphan it. */
  __mwAudioContext?: AudioContext | null;
};

let ctx: AudioContext | null = null;
let bus: AudioBus | null = null;
let systems: SoundSystem[] = [];
let limiterNode: DynamicsCompressorNode | null = null;
let tap: RecordTap | null = null;
let soundEnabled = true;
/** Interface cue output: straight to the speakers, outside master, limiter and record tap (never filmed). */
let uiOut: GainNode | null = null;
let lastUiCueT = -Infinity;
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
  const mix = createMixChain(context);
  const b = new AudioBus(context, mix.master);
  b.setVolumes(volumes);
  b.setSoundMuted(!soundEnabled);
  ctx = context;
  bus = b;
  limiterNode = mix.limiter;
  uiOut = context.createGain();
  uiOut.connect(context.destination);

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

/**
 * Soft interface cue: 'open'/'close' ratchet for a panel or section, 'tick' for a house/block switch. No-op before init(), with the Sound switch
 * off, while the context is not running, or within `audio.uiCueMinGapS` of the previous cue. Never throws.
 * Level: `audio.uiCueLevel` x master slider x effects slider. Not in the record stream or the offline film.
 */
export function uiCue(kind: UiCueKind): void {
  try {
    if (!ctx || !uiOut || !soundEnabled || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (!uiCueAllowed(now, lastUiCueT, audioTuning.uiCueMinGapS)) return;
    const level = audioTuning.uiCueLevel * volumes.master * volumes.groups.effects;
    if (!(level > 0)) return;
    lastUiCueT = now;
    uiOut.gain.setValueAtTime(level, now);
    playUiCue(ctx, uiOut, uiCueParams(kind), now);
  } catch (err) {
    warnOnce('uiCue', err);
  }
}

export function isReady(): boolean {
  return ctx !== null;
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
  for (const s of systems) {
    // Routing (Sound switch, aerial view, music switch) lives in route.ts so the offline film render matches.
    const f = routeFrame(s.name, frame, soundEnabled);
    if (!f) continue;
    try {
      s.update(f);
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

/**
 * The mix as a live MediaStream (the limiter output, so volumes, Sound and Music switches apply). Created on the
 * first call; null before init() or after dispose(), or when the browser has no MediaStream destination.
 */
export function getRecordStream(): MediaStream | null {
  if (!ctx || !limiterNode) return null;
  if (!tap) tap = createRecordTap(ctx, limiterNode);
  return tap ? tap.stream : null;
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
  tap?.dispose();
  tap = null;
  limiterNode = null;
  uiOut?.disconnect();
  uiOut = null;
  lastUiCueT = -Infinity;
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
