// Offline film audio (P4): replays the audio snapshots recorded by the auto film dry run through the same bus,
// mix chain, routing and sound systems as the live game, into a stereo OfflineAudioContext.
//
// Systems schedule on ctx.currentTime, which does not move during a normal offline render. So the render is
// paused at each snapshot time with ctx.suspend(), the frame is applied while the clock reads that instant, and the
// render resumes. Systems that draw random numbers run under a seeded Math.random for the duration of their own
// call, so two renders of the same snapshots give the same samples (and the same hash).
//
// Not rendered offline: nothing is skipped by design. A system that throws is dropped for the rest of the render and
// reported in `skipped`. The film bird never appears here: it is not part of AudioFrame, so it has no snapshot entry.

import { AudioBus, type VolumeSettings } from './bus';
import type { AudioFrame, SoundSystem, SoundSystemFactory } from './frame';
import { SOUND_SYSTEM_FACTORIES } from './systems';
import { routeFrame } from './route';
import { createMixChain } from './mixChain';
import { createRandom } from './synth';

/** Sample rate of the film mix. Fixed here, not a designer knob. */
export const RENDER_SAMPLE_RATE = 48000;
/** Web Audio render quantum: suspend times land on multiples of this many samples. */
const RENDER_QUANTUM = 128;
/** Seed of Math.random inside the sound systems during a render (any fixed value). */
const RENDER_SEED = 0x2f1d3a7;
/** Hash precision: samples are rounded to 1e-4 before hashing (same as autoPath.ts x10000). */
const HASH_SCALE = 1e4;

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** One dry-run audio sample: the frame the scene would have passed to audio.update at film time `t` (seconds). */
export interface AudioSnapshot {
  /** Film time in seconds. Must not decrease along the list. */
  t: number;
  frame: AudioFrame;
}

export interface FilmAudioOptions {
  /** Film length in seconds. Snapshots at or after this time are ignored. */
  durationS: number;
  /** The Sound switch. Music is not affected (its own switch is frame.musicEnabled). */
  soundEnabled: boolean;
  /** Group and category levels and master, as getGroupVolumes() returns them. */
  volumes: VolumeSettings;
  /** Seed for Math.random inside the systems. Default RENDER_SEED. */
  seed?: number;
  /**
   * Film peak target in dBFS: the render is scaled so its peak reaches this. Needed for the overview, where the
   * sounds are far from the listener (inverse distance law). Throws when the mix is silent. Omit for no scaling.
   */
  peakTargetDb?: number;
}

/** Test and dev seam: lets a caller supply the context and the system list. Defaults: browser and SOUND_SYSTEM_FACTORIES. */
export interface FilmAudioDeps {
  createContext?: (channels: number, length: number, sampleRate: number) => OfflineAudioContext;
  factories?: readonly SoundSystemFactory[];
}

export interface SkippedSystem {
  name: string;
  message: string;
}

export interface FilmAudioResult {
  /** Stereo render at RENDER_SAMPLE_RATE. */
  buffer: AudioBuffer;
  /** FNV-1a 32-bit over the samples rounded to 1e-4, channels interleaved. Equal input gives equal hash. */
  hash: number;
  /** Largest absolute sample value. */
  peak: number;
  /** Systems that could not be built or threw during the render (first error only). Empty when all ran. */
  skipped: SkippedSystem[];
}

/**
 * Renders the film audio. Throws on invalid input, when OfflineAudioContext is missing, or when a sample is not
 * finite (a NaN never hashes silently).
 */
export async function renderFilmAudio(
  snapshots: readonly AudioSnapshot[],
  opts: FilmAudioOptions,
  deps: FilmAudioDeps = {},
): Promise<FilmAudioResult> {
  validate(snapshots, opts);
  const sr = RENDER_SAMPLE_RATE;
  const length = Math.ceil(opts.durationS * sr);
  const create = deps.createContext ?? defaultCreateContext;
  const ctx = create(2, length, sr);
  const audioCtx = ctx as unknown as AudioContext; // the bus and systems only use the shared BaseAudioContext surface
  const rng = createRandom(opts.seed ?? RENDER_SEED);
  const skipped: SkippedSystem[] = [];

  const mix = createMixChain(ctx);
  const bus = new AudioBus(audioCtx, mix.master);
  bus.setVolumes(opts.volumes);
  bus.setSoundMuted(!opts.soundEnabled);

  const systems: SoundSystem[] = [];
  withRandom(rng, () => {
    for (const make of deps.factories ?? SOUND_SYSTEM_FACTORIES) {
      try {
        systems.push(make(audioCtx, bus));
      } catch (err) {
        skipped.push({ name: make.name || 'factory', message: errorText(err) });
      }
    }
  });

  const failed = new Set<string>();
  const applyFrame = (frame: AudioFrame): void => {
    bus.setListener(frame.listener);
    withRandom(rng, () => {
      for (const s of systems) {
        if (failed.has(s.name)) continue;
        // Film exemption: no 45 m aerial gate in the film render (live routing is unchanged).
        const routed = routeFrame(s.name, frame, opts.soundEnabled, { aerialGate: false });
        if (!routed) continue;
        try {
          s.update(routed);
        } catch (err) {
          failed.add(s.name);
          skipped.push({ name: s.name, message: errorText(err) });
        }
      }
    });
  };

  // dt of each snapshot: the gap to the next one; the last one repeats the previous gap.
  const groups: { at: number; items: { frame: AudioFrame; dt: number }[] }[] = [];
  snapshots.forEach((snap, i) => {
    const next = snapshots[i + 1];
    const prev = snapshots[i - 1];
    const dt = next ? next.t - snap.t : prev ? snap.t - prev.t : 0;
    // Round up to the render quantum, the first sample at or after the snapshot time.
    const at = Math.ceil((snap.t * sr) / RENDER_QUANTUM) * RENDER_QUANTUM;
    if (at >= length) return;
    const item = { frame: snap.frame, dt };
    const last = groups[groups.length - 1];
    if (last && last.at === at) last.items.push(item);
    else groups.push({ at, items: [item] });
  });

  const applyGroup = (g: { items: { frame: AudioFrame; dt: number }[] }): void => {
    for (const it of g.items) applyFrame({ ...it.frame, dt: it.dt });
  };

  for (const g of groups) {
    if (g.at === 0) applyGroup(g);
    else
      void ctx
        .suspend(g.at / sr)
        .then(async () => {
          try {
            applyGroup(g);
          } finally {
            await ctx.resume();
          }
        });
  }

  const buffer = await ctx.startRendering();
  const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
  if (opts.peakTargetDb !== undefined) scalePeak(channels, opts.peakTargetDb);
  const { hash, peak } = measureSamples(channels);

  for (const s of systems) {
    try {
      s.dispose();
    } catch {
      // A failing dispose cannot change the render, which is already done.
    }
  }
  bus.dispose();
  return { buffer, hash, peak, skipped };
}

/** Below this peak (about -120 dBFS) the mix counts as silent: scaling it would only amplify numerical noise. */
const MIN_SCALE_PEAK = 1e-6;

/**
 * Scales every channel by one gain so the peak sits at targetDb (dBFS). Returns the gain applied.
 * Throws when the mix is silent or the target is not finite.
 */
export function scalePeak(channels: Float32Array[], targetDb: number): number {
  if (!Number.isFinite(targetDb)) throw new Error('renderFilmAudio: peakTargetDb must be finite');
  const { peak } = measureSamples(channels);
  if (!(peak > MIN_SCALE_PEAK)) throw new Error('renderFilmAudio: film mix is silent, nothing to scale');
  const gain = 10 ** (targetDb / 20) / peak;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] = (ch[i] as number) * gain;
  return gain;
}

/**
 * FNV-1a 32-bit hash over samples rounded to 1e-4 (channels interleaved) and the peak absolute value.
 * Throws on a non-finite sample.
 */
export function measureSamples(channels: readonly ArrayLike<number>[]): { hash: number; peak: number } {
  const n = channels[0]?.length ?? 0;
  for (const ch of channels) if (ch.length !== n) throw new Error('measureSamples: channels differ in length');
  let h = FNV_OFFSET;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    for (const ch of channels) {
      const x = ch[i] as number;
      if (!Number.isFinite(x)) throw new Error(`measureSamples: non-finite sample at index ${i}`);
      const a = Math.abs(x);
      if (a > peak) peak = a;
      h = fnvInt(h, Math.round(x * HASH_SCALE));
    }
  }
  return { hash: h >>> 0, peak };
}

function fnvInt(h: number, v: number): number {
  const u = v >>> 0;
  let out = h;
  for (let shift = 0; shift < 32; shift += 8) {
    out ^= (u >>> shift) & 0xff;
    out = Math.imul(out, FNV_PRIME);
  }
  return out;
}

function validate(snapshots: readonly AudioSnapshot[], opts: FilmAudioOptions): void {
  if (!(Number.isFinite(opts.durationS) && opts.durationS > 0)) throw new Error('renderFilmAudio: durationS must be > 0');
  if (snapshots.length === 0) throw new Error('renderFilmAudio: no snapshots');
  let prev = -Infinity;
  for (const s of snapshots) {
    if (!Number.isFinite(s.t) || s.t < prev) throw new Error('renderFilmAudio: snapshot times must be finite and non-decreasing');
    prev = s.t;
  }
}

/** Runs fn with Math.random replaced by rng, then restores it, also when fn throws. */
function withRandom<T>(rng: () => number, fn: () => T): T {
  const saved = Math.random;
  Math.random = rng;
  try {
    return fn();
  } finally {
    Math.random = saved;
  }
}

function defaultCreateContext(channels: number, length: number, sampleRate: number): OfflineAudioContext {
  if (typeof OfflineAudioContext === 'undefined') throw new Error('renderFilmAudio: OfflineAudioContext is not available');
  return new OfflineAudioContext(channels, length, sampleRate);
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
