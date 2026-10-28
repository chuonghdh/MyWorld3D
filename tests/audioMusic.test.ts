import { describe, expect, it } from 'vitest';
import { AudioBus } from '../src/audio/bus';
import {
  FADE_SECONDS, MOODS, MoodScheduler, createMusicSystem, fadeCurve, fadeStep, makeImpulse, midiToHz, moodForTime,
  moodWeights, nextChord,
} from '../src/audio/music';
import { createRandom } from '../src/audio/synth';
import { FakeCtx, makeFrame } from './helpers/fakeAudio';

describe('mood by time of day', () => {
  it('picks day, golden hour and night', () => {
    expect(moodForTime(12)).toBe('day');
    expect(moodForTime(10)).toBe('day');
    expect(moodForTime(18)).toBe('golden');
    expect(moodForTime(6.8)).toBe('golden');
    expect(moodForTime(23)).toBe('night');
    expect(moodForTime(2)).toBe('night');
    expect(moodForTime(-1)).toBe('night');
    expect(moodForTime(36)).toBe('day'); // wraps to 12
  });

  it('weights sum to 1 and change smoothly', () => {
    let prev = moodWeights(0);
    for (let h = 0; h <= 24; h += 0.05) {
      const w = moodWeights(h);
      expect(w.day + w.golden + w.night).toBeCloseTo(1);
      for (const m of MOODS) expect(Math.abs(w[m] - prev[m])).toBeLessThan(0.1);
      prev = w;
    }
    const mid = moodWeights(16.25);
    expect(mid.day).toBeGreaterThan(0.1);
    expect(mid.golden).toBeGreaterThan(0.1);
    expect(moodWeights(Number.NaN).day).toBe(1);
  });
});

describe('fade', () => {
  it('takes 2 s to swing fully, never overshoots and the curve is flat at both ends', () => {
    let f = 0;
    for (let i = 0; i < 60; i++) f = fadeStep(f, 1, 1 / 60);
    expect(f).toBeCloseTo(1 / FADE_SECONDS, 1);
    for (let i = 0; i < 400; i++) f = fadeStep(f, 1, 1 / 60);
    expect(f).toBe(1);
    for (let i = 0; i < 400; i++) f = fadeStep(f, 0, 1 / 60);
    expect(f).toBe(0);
    expect(fadeStep(0.5, 0.5, 1)).toBe(0.5);
    expect(fadeCurve(0)).toBe(0);
    expect(fadeCurve(1)).toBe(1);
    expect(fadeCurve(0.01)).toBeLessThan(0.001);
  });
});

describe('MoodScheduler', () => {
  it('never schedules in the past and stays inside the look-ahead window', () => {
    for (const mood of MOODS) {
      const s = new MoodScheduler(mood, createRandom(11));
      let now = 100;
      let count = 0;
      for (let i = 0; i < 60 * 120; i++) {
        now += 1 / 60;
        for (const e of s.advance(now, 1.2)) {
          count++;
          expect(e.time).toBeGreaterThanOrEqual(now);
          expect(e.time).toBeLessThan(now + 1.2 + 0.5);
          expect(Number.isFinite(e.freq) && e.freq > 20 && e.freq < 4000).toBe(true);
        }
      }
      expect(count).toBeGreaterThan(30);
    }
  });

  it('recovers after a long stall without a burst of back-dated notes', () => {
    const s = new MoodScheduler('day', createRandom(2));
    s.advance(10);
    const ev = s.advance(500);
    for (const e of ev) expect(e.time).toBeGreaterThanOrEqual(500);
    expect(ev.length).toBeLessThan(20);
  });

  it('changes chords by a Markov chain (not one repeated loop) and the night is sparser than the day', () => {
    const chords = new Set<number>();
    const s = new MoodScheduler('day', createRandom(5));
    let now = 0;
    for (let i = 0; i < 60 * 200; i++) {
      now += 1 / 60;
      s.advance(now);
      chords.add(s.chordIndex);
    }
    expect(chords.size).toBeGreaterThanOrEqual(4);
    const notes = (mood: 'day' | 'night') => {
      const sc = new MoodScheduler(mood, createRandom(9));
      let n = 0;
      for (let t = 0; t < 300; t += 0.5) n += sc.advance(t, 0.5).filter((e) => e.voice !== 'pad' && e.voice !== 'bass').length;
      return n;
    };
    expect(notes('night')).toBeLessThan(notes('day') / 2);
    for (let i = 0; i < 100; i++) {
      const c = nextChord('golden', i % 6, (i * 0.37) % 1);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(6);
    }
  });

  it('midiToHz and impulse sanity', () => {
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(57)).toBeCloseTo(220);
    const fc = new FakeCtx();
    const buf = makeImpulse(fc.audio, 1, 3, createRandom(1));
    expect(buf.numberOfChannels).toBe(2);
    const d = buf.getChannelData(0);
    expect(Math.abs(d[d.length - 1])).toBeLessThan(0.01);
  });
});

describe('music system', () => {
  function setup() {
    const fc = new FakeCtx();
    const bus = new AudioBus(fc.audio, fc.audio.createGain());
    const sys = createMusicSystem(fc.audio, bus.category('music'), createRandom(4));
    return { fc, bus, sys };
  }
  const tick = (fc: FakeCtx, sys: ReturnType<typeof setup>['sys'], seconds: number, over: Parameters<typeof makeFrame>[0]) => {
    for (let i = 0; i < seconds * 60; i++) {
      fc.currentTime += 1 / 60;
      sys.update(makeFrame({ dt: 1 / 60, ...over }));
    }
  };
  const oscCount = (fc: FakeCtx) => fc.nodes.filter((n) => n.kind === 'osc').length;

  it('is silent and builds nothing while off', () => {
    const { fc, sys } = setup();
    tick(fc, sys, 3, { musicEnabled: false });
    expect(sys.graphBuilt).toBe(false);
    expect(oscCount(fc)).toBe(0);
  });

  it('fades in over 2 s, plays notes ahead of the clock only, then fades out and stops scheduling', () => {
    const { fc, sys } = setup();
    tick(fc, sys, 1, { musicEnabled: true, timeOfDay: 12 });
    expect(sys.fade).toBeCloseTo(0.5, 1);
    tick(fc, sys, 1.2, { musicEnabled: true, timeOfDay: 12 });
    expect(sys.fade).toBe(1);
    tick(fc, sys, 20, { musicEnabled: true, timeOfDay: 12 });
    expect(oscCount(fc)).toBeGreaterThan(10);
    for (const s of fc.starts) expect(s.when).toBeGreaterThanOrEqual(s.clock - 1e-9);

    tick(fc, sys, 2.5, { musicEnabled: false, timeOfDay: 12 });
    expect(sys.fade).toBe(0);
    const after = oscCount(fc);
    tick(fc, sys, 5, { musicEnabled: false, timeOfDay: 12 });
    expect(oscCount(fc)).toBe(after);
    sys.dispose();
  });

  it('only runs the moods that are audible and crossfades through golden hour', () => {
    const { fc, sys } = setup();
    tick(fc, sys, 5, { musicEnabled: true, timeOfDay: 12 });
    const day = oscCount(fc);
    expect(day).toBeGreaterThan(0);
    tick(fc, sys, 10, { musicEnabled: true, timeOfDay: 16.25 });
    expect(oscCount(fc)).toBeGreaterThan(day);
    for (const s of fc.starts) expect(s.when).toBeGreaterThanOrEqual(s.clock - 1e-9);
  });
});
