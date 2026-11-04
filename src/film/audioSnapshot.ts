// Audio snapshot recorder for the auto film dry run (pass 1). Pure: no wall-clock time, no Math.random.
// The scene calls offer(filmT, audioBridge.fill(input)) once per fixed step, in film-time order. The recorder keeps
// a deep copy at AUDIO_SNAPSHOT_HZ film time, because AudioBridge.fill returns pooled objects that are mutated on
// every call. The copy is taken synchronously inside offer(), so it must be called right after fill().
import type { AudioFrame } from '../audio/frame';
import type { AudioSnapshot } from '../audio/offlineRender';
import { isAutoFilmClockRunning } from './filmClock';
import { currentFilmTime } from './autoRun';

/** Snapshot rate in film seconds (risk 12 in docs/feature_video_camera.md). Fixed, not a designer knob. */
export const AUDIO_SNAPSHOT_HZ = 20;
/** Tolerance on the slot index, so a 1/30 s step that lands on a 1/20 s slot is not lost to rounding. */
const SLOT_EPS = 1e-9;

export interface AudioSnapshotRecorder {
  /**
   * Offers the frame that the scene built at film time `t` (seconds, non-decreasing). Returns true when a snapshot
   * was stored. A frame between two sample slots is dropped; a gap longer than one slot yields one snapshot.
   * Throws when `t` is not finite or goes backwards.
   */
  offer(t: number, frame: AudioFrame): boolean;
  /** Stored snapshots in film-time order. Feed to renderFilmAudio as is. */
  readonly snapshots: readonly AudioSnapshot[];
}

/** Creates a recorder that samples at `hz` film seconds per sample (default AUDIO_SNAPSHOT_HZ). */
export function createAudioSnapshotRecorder(hz: number = AUDIO_SNAPSHOT_HZ): AudioSnapshotRecorder {
  if (!(Number.isFinite(hz) && hz > 0)) throw new Error('createAudioSnapshotRecorder: hz must be > 0');
  const out: AudioSnapshot[] = [];
  let nextSlot = 0;
  let last = -Infinity;
  return {
    snapshots: out,
    offer(t, frame) {
      if (!Number.isFinite(t) || t < last) throw new Error('audioSnapshot: t must be finite and non-decreasing');
      last = t;
      const slot = t * hz + SLOT_EPS;
      if (slot < nextSlot) return false;
      out.push({ t, frame: cloneAudioFrame(frame) });
      nextSlot = Math.floor(slot) + 1;
      return true;
    },
  };
}

/**
 * Deep copy of every field the sound systems read. `dt` is set to 0: renderFilmAudio computes dt from the gap
 * between snapshots and ignores the stored value.
 */
export function cloneAudioFrame(f: AudioFrame): AudioFrame {
  return {
    dt: 0,
    listener: {
      x: f.listener.x,
      y: f.listener.y,
      z: f.listener.z,
      forward: { ...f.listener.forward },
      up: { ...f.listener.up },
      height: f.listener.height,
    },
    timeOfDay: f.timeOfDay,
    season: f.season,
    windSpeed: f.windSpeed,
    gust: f.gust,
    rain: f.rain,
    night: f.night,
    vehicles: f.vehicles.map((v) => ({ ...v })),
    pedestrians: f.pedestrians.map((p) => ({ ...p, dog: p.dog ? { ...p.dog } : null })),
    trees: f.trees.map((t) => ({ ...t })),
    church: f.church ? { x: f.church.x, z: f.church.z } : null,
    lifeEvents: f.lifeEvents.map((e) => ({ ...e })),
    thunder: f.thunder.map((th) => ({ ...th })),
    horns: f.horns.map((h) => ({ ...h })),
    aircraft: (f.aircraft ?? []).map((a) => ({ ...a })),
    musicEnabled: f.musicEnabled,
  };
}

// Live tap for the running auto film (film time from autoRun). useTownFrame calls tapAudioFrame once per fixed step, right after fill(), while the
// auto clock runs and filming is on. Idle: no recorder, no clone, no allocation. Consumers read audioTapSnapshots().
let tap: AudioSnapshotRecorder | null = null;

/** Offers the frame built this step to the auto film recorder. Does nothing unless the auto clock is running. */
export function tapAudioFrame(filming: boolean, frame: AudioFrame): void {
  if (!filming || !isAutoFilmClockRunning()) return;
  if (!tap) tap = createAudioSnapshotRecorder();
  tap.offer(currentFilmTime(), frame);
}

/** Snapshots taken for the current auto film, in film-time order. Empty when no film has tapped audio. */
export function audioTapSnapshots(): readonly AudioSnapshot[] {
  return tap ? tap.snapshots : [];
}

/** Drops the tap at film end. Call after the snapshots have been consumed. */
export function resetAudioTap(): void {
  tap = null;
}
