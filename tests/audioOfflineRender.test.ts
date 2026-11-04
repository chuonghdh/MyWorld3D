import { describe, expect, it } from 'vitest';
import { FakeCtx, FakeNode, FakeParam, listenerAt, makeFrame } from './helpers/fakeAudio';
import { RENDER_SAMPLE_RATE, measureSamples, renderFilmAudio, type AudioSnapshot } from '../src/audio/offlineRender';
import { defaultVolumes } from '../src/audio/bus';
import type { AudioFrame, SoundSystem, SoundSystemFactory } from '../src/audio/frame';
import { quietFrame } from '../src/audio';
import { routeFrame } from '../src/audio/route';
import { AUDIO_SNAPSHOT_HZ, cloneAudioFrame, createAudioSnapshotRecorder } from '../src/film/audioSnapshot';

/** FakeCtx with the offline surface: suspend() parks a resolver, startRendering() runs them in time order. */
class FakeOffline extends FakeCtx {
  private waiting: { t: number; resolve: () => void }[] = [];
  suspends: number[] = [];
  resumes = 0;
  constructor(readonly channels: number, readonly length: number, sampleRate: number, private readonly sumWind: () => number) {
    super();
    this.sampleRate = sampleRate;
    // The compressor needs its AudioParams; FakeCtx has none.
    this.createDynamicsCompressor = () => {
      const n = new FakeNode('compressor', this);
      Object.assign(n, { threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam() });
      this.nodes.push(n);
      return n;
    };
  }
  suspend(t: number): Promise<void> {
    this.suspends.push(t);
    return new Promise<void>((resolve) => this.waiting.push({ t, resolve }));
  }
  resume(): Promise<void> {
    this.resumes++;
    return Promise.resolve();
  }
  async startRendering(): Promise<AudioBuffer> {
    const order = [...this.waiting].sort((a, b) => a.t - b.t);
    for (const w of order) {
      this.currentTime = w.t;
      w.resolve();
      await new Promise((r) => setTimeout(r, 0)); // let the then() callback apply the frame and resume
    }
    // Synthetic signal: amplitude follows the wind the systems saw, capped well under 0.5.
    const amp = Math.min(0.4, 0.001 * this.sumWind());
    const data = Array.from({ length: this.channels }, (_, c) => {
      const d = new Float32Array(this.length);
      for (let i = 0; i < this.length; i++) d[i] = amp * Math.sin(0.01 * i + c);
      return d;
    });
    return { length: this.length, numberOfChannels: this.channels, sampleRate: this.sampleRate, getChannelData: (c: number) => data[c] } as unknown as AudioBuffer;
  }
}

type Seen = { name: string; t: number; frame: AudioFrame; rand: number };

function recorder(name: string, seen: Seen[]): SoundSystemFactory {
  return (ctx): SoundSystem => ({
    name,
    update(f) {
      seen.push({ name, t: ctx.currentTime, frame: f, rand: Math.random() });
    },
    dispose() {},
  });
}

function snaps(count: number, dt = 0.05, over: (i: number) => Partial<AudioFrame> = () => ({})): AudioSnapshot[] {
  return Array.from({ length: count }, (_, i) => ({ t: i * dt, frame: makeFrame({ windSpeed: 2, ...over(i) }) }));
}

function render(list: AudioSnapshot[], opts: Partial<{ soundEnabled: boolean; durationS: number; peakTargetDb: number }> = {}, factories: SoundSystemFactory[], seen?: Seen[]) {
  let made: FakeOffline | null = null;
  const sumWind = () => (seen ?? []).reduce((a, s) => a + s.frame.windSpeed, 0);
  return renderFilmAudio(
    list,
    { durationS: opts.durationS ?? 2, soundEnabled: opts.soundEnabled ?? true, volumes: defaultVolumes(), peakTargetDb: opts.peakTargetDb },
    {
      createContext: (c, l, sr) => {
        made = new FakeOffline(c, l, sr, sumWind);
        return made as unknown as OfflineAudioContext;
      },
      factories,
    },
  ).then((r) => ({ ...r, ctx: made as unknown as FakeOffline }));
}

const QUANTUM_S = 128 / RENDER_SAMPLE_RATE;

describe('film audio render: determinism and hash', () => {
  it('same snapshots give the same hash', async () => {
    const seenA: Seen[] = [];
    const seenB: Seen[] = [];
    const a = await render(snaps(20), {}, [recorder('vehicles', seenA)], seenA);
    const b = await render(snaps(20), {}, [recorder('vehicles', seenB)], seenB);
    expect(b.hash).toBe(a.hash);
    expect(seenB.map((s) => s.rand)).toEqual(seenA.map((s) => s.rand));
  });

  it('different snapshots give a different hash', async () => {
    const a = await render(snaps(20), {}, [recorder('vehicles', [])], []);
    const seen: Seen[] = [];
    const b = await render(snaps(20, 0.05, (i) => ({ windSpeed: 2 + i })), {}, [recorder('vehicles', seen)], seen);
    expect(b.hash).not.toBe(a.hash);
  });

  it('restores Math.random after the render, also when a system throws', async () => {
    const before = Math.random;
    await render(snaps(5), {}, [recorder('vehicles', [])], []);
    expect(Math.random).toBe(before);
  });

  it('peak stays below 0.5 and no sample is NaN on the synthetic snapshots', async () => {
    const seen: Seen[] = [];
    const r = await render(snaps(40, 0.05, (i) => ({ windSpeed: 3 + (i % 5) })), {}, [recorder('vehicles', seen)], seen);
    expect(Number.isFinite(r.peak)).toBe(true);
    expect(r.peak).toBeLessThan(0.5);
    expect(Number.isFinite(r.hash)).toBe(true);
  });

  it('measureSamples rounds to 1e-4 and throws on NaN', () => {
    const base = [new Float32Array([0.1, -0.2, 0.3])];
    const near = [new Float32Array([0.10002, -0.2, 0.3])];
    const far = [new Float32Array([0.1002, -0.2, 0.3])];
    expect(measureSamples(near).hash).toBe(measureSamples(base).hash);
    expect(measureSamples(far).hash).not.toBe(measureSamples(base).hash);
    expect(measureSamples(base).peak).toBeCloseTo(0.3);
    expect(() => measureSamples([new Float32Array([0, Number.NaN])])).toThrow(/non-finite/);
  });
});

describe('film audio render: scheduling', () => {
  it('applies each snapshot at its quantum-rounded time, first one at 0 without suspending', async () => {
    const seen: Seen[] = [];
    const r = await render(snaps(4), {}, [recorder('vehicles', seen)], seen);
    expect(seen).toHaveLength(4);
    expect(seen[0].t).toBe(0);
    const ctx = r.ctx;
    expect(ctx.suspends).toEqual([0.05, 0.1, 0.15].map((t) => Math.ceil(t / QUANTUM_S) * QUANTUM_S));
    expect(ctx.resumes).toBe(3);
    seen.forEach((s, i) => {
      const want = i * 0.05;
      expect(s.t).toBeGreaterThanOrEqual(want - 1e-9);
      expect(s.t).toBeLessThan(want + QUANTUM_S + 1e-9);
    });
  });

  it('gives each system dt equal to the gap to the next snapshot', async () => {
    const seen: Seen[] = [];
    await render(snaps(4, 0.05), {}, [recorder('vehicles', seen)], seen);
    expect(seen.map((s) => Math.round(s.frame.dt * 1000) / 1000)).toEqual([0.05, 0.05, 0.05, 0.05]);
  });

  it('ignores snapshots at or after the film end', async () => {
    const seen: Seen[] = [];
    await render([{ t: 0, frame: makeFrame() }, { t: 1, frame: makeFrame() }, { t: 5, frame: makeFrame() }], { durationS: 2 }, [recorder('vehicles', seen)], seen);
    expect(seen.map((s) => s.t)).toEqual([0, 1]);
  });

  it('rejects empty, decreasing or non-finite snapshot times', async () => {
    await expect(render([], {}, [])).rejects.toThrow(/no snapshots/);
    await expect(render([{ t: 1, frame: makeFrame() }, { t: 0.5, frame: makeFrame() }], {}, [])).rejects.toThrow(/non-decreasing/);
    await expect(render([{ t: Number.NaN, frame: makeFrame() }], {}, [])).rejects.toThrow(/non-decreasing/);
  });
});

describe('film audio render: routing and switches', () => {
  it('Sound off skips city systems but keeps music', async () => {
    const seenV: Seen[] = [];
    const seenM: Seen[] = [];
    await render(snaps(3), { soundEnabled: false }, [recorder('vehicles', seenV), recorder('music', seenM)]);
    expect(seenV).toHaveLength(0);
    expect(seenM).toHaveLength(3);
  });

  it('film render is exempt from the 45 m gate: above it ground systems keep their frame', async () => {
    const seenA: Seen[] = [];
    const seenV: Seen[] = [];
    const high = makeFrame({
      listener: listenerAt(0, 0, 60),
      windSpeed: 4,
      pedestrians: [{ id: 1, x: 0, z: 0, speed: 1, pose: 0, umbrella: false, dog: null }],
      lifeEvents: [
        { type: 'bird-call', x: 1, z: 1 },
        { type: 'cat-meow', x: 2, z: 2 },
      ],
    });
    await render([{ t: 0, frame: high }], {}, [recorder('animals', seenA), recorder('vehicles', seenV)]);
    expect(seenA[0].frame.lifeEvents.map((e) => e.type)).toEqual(['bird-call', 'cat-meow']);
    expect(seenA[0].frame.pedestrians).toHaveLength(1);
    expect(seenV[0].frame.pedestrians).toHaveLength(1);
    expect(seenV[0].frame.windSpeed).toBe(4);
  });

  it('live routing keeps the 45 m gate: above it only birds, walkers and wind are dropped', () => {
    const high = makeFrame({
      listener: listenerAt(0, 0, 60),
      windSpeed: 4,
      pedestrians: [{ id: 1, x: 0, z: 0, speed: 1, pose: 0, umbrella: false, dog: null }],
      lifeEvents: [
        { type: 'bird-call', x: 1, z: 1 },
        { type: 'cat-meow', x: 2, z: 2 },
      ],
    });
    const animals = routeFrame('animals', high, true);
    expect(animals?.lifeEvents.map((e) => e.type)).toEqual(['bird-call']);
    expect(animals?.pedestrians).toHaveLength(0);
    const vehicles = routeFrame('vehicles', high, true);
    expect(vehicles?.pedestrians).toHaveLength(0);
    expect(vehicles?.windSpeed).toBe(0);
    expect(vehicles?.lifeEvents).toHaveLength(0);
  });

  it('aerialGate false returns the frame untouched above 45 m; music and Sound switch unchanged', () => {
    const high = makeFrame({ listener: listenerAt(0, 0, 300) });
    expect(routeFrame('vehicles', high, true, { aerialGate: false })).toBe(high);
    expect(routeFrame('vehicles', high, false, { aerialGate: false })).toBeNull();
    expect(routeFrame('music', high, false, { aerialGate: false })).toBe(high);
  });

  it('routeFrame keeps a ground frame untouched and quietFrame drops walkers', () => {
    const ground = makeFrame({ listener: listenerAt(0, 0, 1.7) });
    expect(routeFrame('vehicles', ground, true)).toBe(ground);
    const q = quietFrame(makeFrame({ windSpeed: 5, pedestrians: [{ id: 1, x: 0, z: 0, speed: 0, pose: 1, umbrella: false, dog: null }] }));
    expect(q.windSpeed).toBe(0);
    expect(q.pedestrians).toHaveLength(0);
  });

  it('a system that throws is reported and does not stop the others', async () => {
    const seen: Seen[] = [];
    const bad: SoundSystemFactory = () => ({
      name: 'bad',
      update() {
        throw new Error('boom');
      },
      dispose() {},
    });
    const r = await render(snaps(3), {}, [bad, recorder('vehicles', seen)], seen);
    expect(r.skipped).toEqual([{ name: 'bad', message: 'boom' }]);
    expect(seen).toHaveLength(3);
  });

  it('applies the group and master levels to the mix', async () => {
    const r = await render(snaps(1), {}, []);
    // First node of the mix chain is the master gain; it carries volumes.master.
    expect(r.ctx.nodes[0].gain.value).toBeCloseTo(defaultVolumes().master);
  });
});

describe('film audio render: default context path', () => {
  it('without OfflineAudioContext the default path throws a clear error', async () => {
    if (typeof OfflineAudioContext !== 'undefined') return;
    await expect(
      renderFilmAudio(snaps(2), { durationS: 1, soundEnabled: true, volumes: defaultVolumes() }),
    ).rejects.toThrow(/OfflineAudioContext is not available/);
  });

  // Runs only in a browser-like runtime (vitest env is node). Real systems, real context, no fake.
  it.skipIf(typeof OfflineAudioContext === 'undefined')('real OfflineAudioContext: all systems run, no skips, same hash twice', async () => {
    const opts = { durationS: 2, soundEnabled: true, volumes: defaultVolumes() };
    const a = await renderFilmAudio(snaps(40), opts);
    const b = await renderFilmAudio(snaps(40), opts);
    expect(a.skipped).toEqual([]);
    expect(b.hash).toBe(a.hash);
    expect(a.peak).toBeLessThan(1);
  });

  it('fake context with the real SOUND_SYSTEM_FACTORIES: runs without a skip', async () => {
    const fake = (c: number, l: number, sr: number) => new FakeOffline(c, l, sr, () => 0) as unknown as OfflineAudioContext;
    const r = await renderFilmAudio(snaps(10), { durationS: 1, soundEnabled: true, volumes: defaultVolumes() }, { createContext: fake });
    expect(r.skipped).toEqual([]);
    expect(Number.isFinite(r.peak)).toBe(true);
  });
});

describe('film audio render: peak scaling (silent output must fail)', () => {
  it('scales the mix so the peak reaches the film target', async () => {
    const seen: Seen[] = [];
    const r = await render(snaps(20), { peakTargetDb: -3 }, [recorder('vehicles', seen)], seen);
    expect(r.peak).toBeCloseTo(10 ** (-3 / 20), 3);
    expect(r.skipped).toEqual([]);
  });

  it('a silent mix with a target throws instead of returning silence', async () => {
    await expect(render(snaps(5), { peakTargetDb: -3 }, [], [])).rejects.toThrow(/silent/);
  });

  it('without a target the silent mix is returned unchanged (live-style render)', async () => {
    const r = await render(snaps(5), {}, [], []);
    expect(r.peak).toBe(0);
  });

  it('a non-finite target throws', async () => {
    const seen: Seen[] = [];
    await expect(render(snaps(5), { peakTargetDb: Number.NaN }, [recorder('vehicles', seen)], seen)).rejects.toThrow(/finite/);
  });
});

describe('audio snapshot recorder (film dry run)', () => {
  it('samples at AUDIO_SNAPSHOT_HZ film time from 30 fps steps', () => {
    expect(AUDIO_SNAPSHOT_HZ).toBe(20);
    const rec = createAudioSnapshotRecorder();
    for (let k = 0; k < 90; k++) rec.offer(k / 30, makeFrame());
    expect(rec.snapshots).toHaveLength(60);
    expect(rec.snapshots[1].t).toBeCloseTo(2 / 30, 9);
  });

  it('gap longer than one slot gives one snapshot at the offered time', () => {
    const rec = createAudioSnapshotRecorder(20);
    rec.offer(0, makeFrame());
    rec.offer(0.5, makeFrame());
    expect(rec.snapshots.map((s) => s.t)).toEqual([0, 0.5]);
  });

  it('stores a deep copy: later mutation of the pooled frame does not change the snapshot', () => {
    const rec = createAudioSnapshotRecorder();
    const f = makeFrame({
      vehicles: [{ id: 1, x: 1, z: 2, heading: 0, cls: 'car', speed: 3, accel: 0, braking: false, indicator: 0 }],
      trees: [{ x: 4, z: 5, scale: 1 }],
    });
    rec.offer(0, f);
    f.vehicles[0].x = 99;
    f.trees[0].x = 99;
    expect(rec.snapshots[0].frame.vehicles[0].x).toBe(1);
    expect(rec.snapshots[0].frame.trees[0].x).toBe(4);
  });

  it('same offers give deeply equal snapshots (no clock, no random)', () => {
    const run = () => {
      const rec = createAudioSnapshotRecorder();
      for (let k = 0; k < 30; k++) rec.offer(k / 30, makeFrame({ windSpeed: k % 7 }));
      return rec.snapshots;
    };
    expect(run()).toEqual(run());
  });

  it('rejects decreasing or non-finite times and a bad rate', () => {
    const rec = createAudioSnapshotRecorder();
    rec.offer(1, makeFrame());
    expect(() => rec.offer(0.5, makeFrame())).toThrow(/non-decreasing/);
    expect(() => rec.offer(Number.NaN, makeFrame())).toThrow(/non-decreasing/);
    expect(() => createAudioSnapshotRecorder(0)).toThrow(/hz/);
  });

  it('cloneAudioFrame sets dt to 0 and keeps the listener and aircraft', () => {
    const c = cloneAudioFrame(makeFrame({ dt: 0.3, listener: listenerAt(1, 2, 3) }));
    expect(c.dt).toBe(0);
    expect(c.listener.height).toBe(3);
    expect(c.aircraft).toEqual([]);
  });

  it('recorded snapshots feed renderFilmAudio and give the same hash on two renders', async () => {
    const rec = createAudioSnapshotRecorder();
    for (let k = 0; k < 40; k++) rec.offer(k / 30, makeFrame({ windSpeed: 2 + (k % 3) }));
    const a = await render([...rec.snapshots], {}, [recorder('vehicles', [])], []);
    const b = await render([...rec.snapshots], {}, [recorder('vehicles', [])], []);
    expect(a.skipped).toEqual([]);
    expect(b.hash).toBe(a.hash);
  });
});
