// Generative ambient music, synthesised with Web Audio (no samples). Not positional: everything feeds
// the bus 'music' category. Off by default; frame.musicEnabled fades it in/out over 2 s.
//
// Three moods follow the time of day and crossfade smoothly:
//   day    (~72 bpm) C major pentatonic, kalimba/marimba plucks over a warm pad
//   golden (~54 bpm) F major, maj7 / sus chords, soft pad and sparse piano-like tones
//   night  (~38 bpm) D Dorian, deep pad with slow filter motion, sparse bells, long echo/reverb
// Each mood owns a MoodScheduler: a Markov chord chain plus a random-walk melody, emitting MusicEvents
// a short look-ahead before they sound (never in the past). The graph is built lazily on first enable.

import type { SoundSystem, SoundSystemFactory, AudioFrame } from './frame';
import { createRandom } from './synth';
import { audio as audioTuning } from '../config/tuning';
import { MOODS, MOOD_ACTIVE_WEIGHT, moodWeights, fadeStep, fadeCurve, MoodScheduler } from './musicMood';
import type { Mood } from './musicMood';
import { playMusicEvent, makeImpulse } from './musicVoices';
export * from './musicMood';
export * from './musicVoices';

// ---- The sound system -------------------------------------------------------------------------------

const MOOD_SEND: Record<Mood, { reverb: number; delay: number }> = {
  day: { reverb: 0.25, delay: 0.18 },
  golden: { reverb: 0.4, delay: 0.25 },
  night: { reverb: 0.7, delay: 0.4 },
};
const MUSIC_LEVEL = audioTuning.musicLevel;
const DUCK_LEVEL = audioTuning.duckLevel;

export interface MusicSystem extends SoundSystem {
  /** Current linear fade value 0..1 (for tests / debugging). */
  readonly fade: number;
  readonly graphBuilt: boolean;
}

export function createMusicSystem(
  ctx: AudioContext,
  dest: AudioNode,
  rand: () => number = createRandom(),
): MusicSystem {
  let fade = 0;
  let duck = 1;
  let built = false;
  let master: GainNode;
  const moodGain = {} as Record<Mood, GainNode>;
  const extra: AudioNode[] = [];
  const sched = {
    day: new MoodScheduler('day', rand),
    golden: new MoodScheduler('golden', rand),
    night: new MoodScheduler('night', rand),
  };
  const active: Record<Mood, boolean> = { day: false, golden: false, night: false };

  function build(): void {
    built = true;
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(dest);
    const mix = ctx.createGain();
    mix.connect(master);

    // Space: convolution reverb (generated impulse) and a dark feedback echo.
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx, 2.4, 3.2, rand);
    const revReturn = ctx.createGain();
    revReturn.gain.value = 0.9;
    conv.connect(revReturn);
    revReturn.connect(mix);

    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.46;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const fbLp = ctx.createBiquadFilter();
    fbLp.type = 'lowpass';
    fbLp.frequency.value = 1800;
    const delayReturn = ctx.createGain();
    delayReturn.gain.value = 0.7;
    delay.connect(fbLp);
    fbLp.connect(fb);
    fb.connect(delay);
    fbLp.connect(delayReturn);
    delayReturn.connect(mix);
    extra.push(mix, conv, revReturn, delay, fb, fbLp, delayReturn);

    for (const m of MOODS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(mix);
      const rs = ctx.createGain();
      rs.gain.value = MOOD_SEND[m].reverb;
      g.connect(rs);
      rs.connect(conv);
      const ds = ctx.createGain();
      ds.gain.value = MOOD_SEND[m].delay;
      g.connect(ds);
      ds.connect(delay);
      moodGain[m] = g;
      extra.push(g, rs, ds);
    }
  }

  return {
    name: 'music',
    get fade() {
      return fade;
    },
    get graphBuilt() {
      return built;
    },
    update(frame: AudioFrame) {
      const dt = Number.isFinite(frame.dt) ? Math.min(0.5, Math.max(0, frame.dt)) : 0.016;
      fade = fadeStep(fade, frame.musicEnabled ? 1 : 0, dt);
      if (!built) {
        if (fade <= 0) return;
        build();
      }
      const now = ctx.currentTime;
      // Thunder ducks the music a little for a few seconds.
      duck = frame.thunder.length ? DUCK_LEVEL : Math.min(1, duck + dt / 3);
      master.gain.setTargetAtTime(fadeCurve(fade) * MUSIC_LEVEL * duck, now, 0.05);
      if (fade <= 0) {
        for (const m of MOODS) active[m] = false;
        return; // fully faded out: schedule nothing, CPU idle
      }

      const w = moodWeights(frame.timeOfDay);
      for (const m of MOODS) {
        moodGain[m].gain.setTargetAtTime(w[m], now, 1.2);
        const on = w[m] > MOOD_ACTIVE_WEIGHT;
        if (on && !active[m]) sched[m].resume(now);
        active[m] = on;
        if (!on) continue;
        for (const e of sched[m].advance(now)) playMusicEvent(ctx, moodGain[m], e);
      }
    },
    dispose() {
      if (!built) return;
      try {
        master.gain.value = 0;
      } catch {
        /* ignore */
      }
      master.disconnect();
      for (const n of extra) n.disconnect();
    },
  };
}

export const createMusic: SoundSystemFactory = (ctx, bus): SoundSystem => createMusicSystem(ctx, bus.category('music'));
