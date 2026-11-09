// Weather sounds. Thunder is a positional one-shot source: the weather system hands frame.thunder items
// {angle, distance, strength} (delay distance/340 s already applied) and each clap gets its own emitter in
// the sky at listener + direction * min(distance, 450), 60 m up. Rain and wind are owned by rain.ts and
// nature.ts; the legacy setWeatherSound / playThunder shims in index.ts keep working through
// createWeatherAudio (rain bed and swell dropped, thunder routed into the same positional system).

import type { AudioBus, Emitter } from './bus';
import type { AudioFrame, AudioThunder, SoundSystem } from './frame';
import { makeNoiseBuffer, createRandom } from './synth';
import { audio as audioTuning } from '../config/tuning';

/** Farthest placement of a thunder emitter (m): beyond this the clap only gets darker and quieter. */
export const THUNDER_MAX_PLACE_DISTANCE = audioTuning.thunderMaxPlaceDistanceM;
/** Height of the thunder emitter above the ground (m): thunder comes from the sky. */
export const THUNDER_HEIGHT = audioTuning.thunderHeightM;
export const THUNDER_LOUDNESS = audioTuning.thunderLoudness;
export const THUNDER_LENGTH_SCALE = audioTuning.thunderLengthScale;

/** Loudness and low-pass cutoff of a thunder clap for a distance in metres. Pure, tested. */
export function thunderCharacter(distance: number, strength: number): { gain: number; cutoff: number; length: number } {
  const d = Math.max(0, distance);
  const near = 1 / (1 + d / 450);
  return {
    // Twice the original level (the master has a limiter, so the peaks of a storm cannot clip).
    gain: Math.min(1, Math.max(0.05, strength) * (0.25 + 0.75 * near)) * THUNDER_LOUDNESS,
    cutoff: 250 + 2400 * near,
    // About 30 % longer than the first version.
    length: (2.5 + Math.min(5, d / 500)) * THUNDER_LENGTH_SCALE,
  };
}

/** World position of a thunder emitter for a strike at compass `angle` (dx = cos, dz = sin) and `distance`. */
export function thunderPosition(
  listener: { x: number; z: number },
  angle: number,
  distance: number,
): { x: number; y: number; z: number } {
  const d = Math.min(Math.max(0, distance), THUNDER_MAX_PLACE_DISTANCE);
  return { x: listener.x + Math.cos(angle) * d, y: THUNDER_HEIGHT, z: listener.z + Math.sin(angle) * d };
}

/**
 * Crack level for a strike distance: a sharp broadband snap that only exists for near strikes
 * (gone beyond about 1.2 km because air absorbs the highs). 0..1.
 */
export function crackAmount(distance: number): number {
  return Math.min(1, Math.max(0, 1 - Math.max(0, distance) / 1200));
}

interface ActiveClap {
  emitter: Emitter;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  endsAt: number;
}

/**
 * Positional thunder. Each clap: brown-noise rumble through a lowpass sweeping down to ~90 Hz with
 * a rolling multi-swell envelope, a sub thump, and (near strikes only) a short bright crack in front.
 */
export function createThunderSounds(ctx: AudioContext, bus: AudioBus, rand: () => number = createRandom()): SoundSystem & {
  readonly active: number;
  play(t: AudioThunder, listener: { x: number; z: number }): void;
} {
  const clouds = new Set<ActiveClap>();

  function finish(c: ActiveClap): void {
    clouds.delete(c);
    for (const s of c.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
      s.disconnect();
    }
    for (const n of c.nodes) n.disconnect();
    c.emitter.dispose();
  }

  function play(t: AudioThunder, listener: { x: number; z: number }): void {
    if (!Number.isFinite(t.angle) || !Number.isFinite(t.distance) || !Number.isFinite(t.strength)) return;
    const c = thunderCharacter(t.distance, t.strength);
    const pos = thunderPosition(listener, t.angle, t.distance);
    const emitter = bus.createEmitter({
      category: 'thunder',
      x: pos.x,
      y: pos.y,
      z: pos.z,
      refDistance: 90,
      maxDistance: 700,
      rolloff: 0.2,
    });
    const now = ctx.currentTime + 0.02;
    const end = now + c.length;
    const clap: ActiveClap = { emitter, sources: [], nodes: [], endsAt: end };

    // Rumble.
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(ctx, 4, 'brown');
    src.loop = true;
    src.playbackRate.value = 0.55 + rand() * 0.25;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(c.cutoff, now);
    lp.frequency.exponentialRampToValueAtTime(90, end);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(c.gain * 0.9, now + 0.04 + Math.min(0.6, t.distance / 4000));
    let at = now + 0.3;
    let amp = c.gain * 0.7;
    for (let i = 0; i < 4 && at < end - 0.2; i++) {
      g.gain.linearRampToValueAtTime(amp * (0.5 + rand() * 0.5), at);
      at += 0.4 + rand() * 0.8;
      amp *= 0.65;
    }
    g.gain.linearRampToValueAtTime(0, end);
    src.connect(lp);
    lp.connect(g);
    g.connect(emitter.input);
    src.start(now, rand() * 3);
    src.stop(end + 0.05);
    clap.sources.push(src);
    clap.nodes.push(lp, g);

    // Sub thump: a falling sine, felt more than heard.
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(60 + rand() * 15, now);
    sub.frequency.exponentialRampToValueAtTime(32, now + 1.2);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0, now);
    sg.gain.linearRampToValueAtTime(c.gain * 0.35, now + 0.06);
    sg.gain.linearRampToValueAtTime(0, now + 1.4);
    sub.connect(sg);
    sg.connect(emitter.input);
    sub.start(now);
    sub.stop(now + 1.45);
    clap.sources.push(sub);
    clap.nodes.push(sg);

    // Crack: near strikes only.
    const crack = crackAmount(t.distance);
    if (crack > 0.05) {
      const cs = ctx.createBufferSource();
      cs.buffer = makeNoiseBuffer(ctx, 1, 'white');
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 1400 + 1800 * crack;
      hp.Q.value = 0.5;
      const cg = ctx.createGain();
      const peak = c.gain * 0.8 * crack;
      cg.gain.setValueAtTime(0, now);
      cg.gain.linearRampToValueAtTime(peak, now + 0.003);
      cg.gain.linearRampToValueAtTime(peak * 0.25, now + 0.06);
      cg.gain.linearRampToValueAtTime(0, now + 0.35);
      cs.connect(hp);
      hp.connect(cg);
      cg.connect(emitter.input);
      cs.start(now, rand() * 0.5);
      cs.stop(now + 0.4);
      clap.sources.push(cs);
      clap.nodes.push(hp, cg);
    }

    clouds.add(clap);
  }

  return {
    name: 'thunder',
    get active() {
      return clouds.size;
    },
    play,
    update(frame: AudioFrame) {
      const t = ctx.currentTime;
      for (const c of [...clouds]) if (t > c.endsAt + 0.2) finish(c);
      for (const th of frame.thunder) play(th, frame.listener);
    },
    dispose() {
      for (const c of [...clouds]) finish(c);
    },
  };
}
