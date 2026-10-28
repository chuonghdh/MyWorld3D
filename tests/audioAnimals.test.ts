import { describe, expect, it } from 'vitest';
import { AudioBus } from '../src/audio/bus';
import type { AudioFrame, AudioLifeEvent, AudioPedestrian } from '../src/audio/frame';
import type { ListenerState } from '../src/audio/listener';
import {
  birdActivity,
  birdRainFactor,
  birdSeasonFactor,
  birdTimeFactor,
  composeSong,
  createAnimalSoundsWith,
  dogSize,
  dogVoice,
  owlChance,
  pickSpecies,
} from '../src/audio/animals';

class FakeParam {
  value = 1;
  setValueAtTime(v: number) { this.value = v; }
  linearRampToValueAtTime(v: number) { this.value = v; }
  exponentialRampToValueAtTime(v: number) { this.value = v; }
  setTargetAtTime(v: number) { this.value = v; }
  cancelScheduledValues() {}
}

class FakeNode {
  connections = new Set<FakeNode>();
  disconnected = false;
  started = false;
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  detune = new FakeParam();
  playbackRate = new FakeParam();
  positionX = new FakeParam();
  positionY = new FakeParam();
  positionZ = new FakeParam();
  type = '';
  loop = false;
  buffer: unknown = null;
  stopAt = Infinity;
  onended: (() => void) | null = null;
  constructor(readonly kind: string) {}
  connect(n: FakeNode) { this.connections.add(n); return n; }
  disconnect() { this.connections.clear(); this.disconnected = true; }
  start() { this.started = true; }
  stop(t?: number) { if (t !== undefined) this.stopAt = t; }
}

function makeCtx() {
  const nodes: FakeNode[] = [];
  const mk = (k: string) => () => { const n = new FakeNode(k); nodes.push(n); return n; };
  const P = () => new FakeParam();
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    listener: { positionX: P(), positionY: P(), positionZ: P(), forwardX: P(), forwardY: P(), forwardZ: P(), upX: P(), upY: P(), upZ: P() },
    createGain: mk('gain'),
    createBiquadFilter: mk('biquad'),
    createPanner: mk('panner'),
    createWaveShaper: mk('shaper'),
    createOscillator: mk('osc'),
    createBufferSource: mk('src'),
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
    advance(dt: number) {
      ctx.currentTime += dt;
      for (const n of nodes) {
        if (n.stopAt + 0.001 <= ctx.currentTime && n.onended) {
          const f = n.onended;
          n.onended = null;
          f();
        }
      }
    },
  };
  return { ctx: ctx as unknown as AudioContext & { advance(dt: number): void }, nodes };
}

const LIS: ListenerState = { x: 0, y: 2, z: 0, forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 }, height: 1.7 };

function frame(over: Partial<AudioFrame> = {}): AudioFrame {
  return {
    dt: 0.1, listener: LIS, timeOfDay: 7, season: 'spring', windSpeed: 2, gust: 0, rain: 0, night: false,
    vehicles: [], pedestrians: [], trees: [], church: null, lifeEvents: [], thunder: [], horns: [], musicEnabled: false, ...over,
  };
}

function setup(rand: () => number = () => 0.3) {
  const { ctx, nodes } = makeCtx();
  const bus = new AudioBus(ctx, ctx.createGain());
  const sys = createAnimalSoundsWith(ctx, bus, { rand });
  const panners = () => nodes.filter((n) => n.kind === 'panner' && !n.disconnected);
  const run = (f: AudioFrame) => { ctx.advance(f.dt); sys.update(f); };
  return { ctx, bus, sys, nodes, panners, run };
}

const ev = (type: AudioLifeEvent['type'], x = 30, z = -20): AudioLifeEvent => ({ type, x, z });
const dogPed = (id: number, x: number, z: number): AudioPedestrian => ({ id, x, z, speed: 1, pose: 'walk', umbrella: false, dog: { x, z, speed: 1 } });

describe('animal pure factors', () => {
  it('has a dawn chorus, sparse midday, evening bump and silent night', () => {
    expect(birdTimeFactor(7)).toBeGreaterThan(0.9);
    expect(birdTimeFactor(12)).toBeLessThan(0.35);
    expect(birdTimeFactor(18.5)).toBeGreaterThan(birdTimeFactor(12));
    expect(birdTimeFactor(2)).toBe(0);
    expect(birdTimeFactor(23)).toBe(0);
  });

  it('is quieter in winter and silent in heavy rain', () => {
    expect(birdSeasonFactor('winter')).toBeLessThan(birdSeasonFactor('summer'));
    expect(birdSeasonFactor('spring')).toBeGreaterThanOrEqual(birdSeasonFactor('summer'));
    expect(birdRainFactor(0.6)).toBe(0);
    expect(birdActivity(7, 'spring', 0.6)).toBe(0);
    expect(birdActivity(7, 'spring', 0.2)).toBeLessThan(birdActivity(7, 'spring', 0));
    expect(owlChance(true, 'summer', 0)).toBeGreaterThan(0);
    expect(owlChance(false, 'summer', 0)).toBe(0);
    expect(owlChance(true, 'summer', 0.6)).toBe(0);
  });

  it('composes songs inside the species frequency ranges', () => {
    const r = () => 0.5;
    const hz = (s: ReturnType<typeof composeSong>) => s.notes.flatMap((n) => [n.f0, n.f1]);
    expect(Math.min(...hz(composeSong('blackbird', r)))).toBeGreaterThan(1300);
    expect(Math.max(...hz(composeSong('blackbird', r)))).toBeLessThan(3400);
    expect(Math.min(...hz(composeSong('sparrow', r)))).toBeGreaterThan(2500);
    const pg = composeSong('pigeon', r);
    expect(Math.max(...hz(pg))).toBeLessThan(650);
    expect(pg.notes.length).toBeGreaterThanOrEqual(4);
    expect(composeSong('owl', r).lowpassHz).toBeDefined();
    expect(pickSpecies(() => 0, 12)).toBeTruthy();
  });

  it('makes big dogs lower than small dogs, stably per id', () => {
    const ids = Array.from({ length: 60 }, (_, i) => i);
    const small = ids.reduce((a, b) => (dogSize(a) < dogSize(b) ? a : b));
    const big = ids.reduce((a, b) => (dogSize(a) > dogSize(b) ? a : b));
    expect(dogVoice(small).pitch).toBeGreaterThan(dogVoice(big).pitch * 2);
    expect(dogVoice(7)).toEqual(dogVoice(7));
  });
});

describe('createAnimalSounds', () => {
  it('survives an empty frame and dispose', () => {
    const s = setup();
    expect(() => s.run(frame())).not.toThrow();
    s.sys.dispose();
    expect(s.bus.emitterCount).toBe(0);
  });

  it('turns a bird-call event into a positional song at the event position', () => {
    const s = setup(() => 0.3);
    s.run(frame({ lifeEvents: [ev('bird-call', 33, -21)] }));
    const p = s.panners();
    expect(p).toHaveLength(1);
    expect(p[0].positionX.value).toBe(33);
    expect(p[0].positionZ.value).toBe(-21);
    expect(s.nodes.filter((n) => n.kind === 'osc').length).toBeGreaterThan(2);
  });

  it('disposes the song emitter when it has finished', () => {
    const s = setup(() => 0.3);
    s.run(frame({ lifeEvents: [ev('bird-call', 33, -21)] }));
    for (let i = 0; i < 150; i++) s.run(frame({ timeOfDay: 7 }));
    expect(s.panners().some((n) => n.positionX.value === 33 && n.positionZ.value === -21)).toBe(false);
  });

  it('stays silent for bird calls in heavy rain; at night it hoots like an owl', () => {
    const s = setup(() => 0.3);
    s.run(frame({ rain: 0.8, lifeEvents: [ev('bird-call')] }));
    expect(s.bus.emitterCount).toBe(0);
    s.run(frame({ rain: 0.8, night: true, timeOfDay: 23, lifeEvents: [ev('bird-call')] }));
    expect(s.bus.emitterCount).toBe(0);
    s.run(frame({ night: true, timeOfDay: 23, lifeEvents: [ev('bird-call')] }));
    expect(s.bus.emitterCount).toBe(1);
  });

  it('rejects bird calls when the roll exceeds the activity (sparse midday winter)', () => {
    const s = setup(() => 0.95);
    s.run(frame({ timeOfDay: 13, season: 'winter', lifeEvents: [ev('bird-call')] }));
    expect(s.bus.emitterCount).toBe(0);
  });

  it('caps simultaneous event songs', () => {
    const s = setup(() => 0.3);
    s.run(frame({ lifeEvents: Array.from({ length: 10 }, (_, i) => ev('bird-call', i, i)) }));
    expect(s.bus.emitterCount).toBe(4);
  });

  it('ambient trickle stays 20-90 m from the listener with at most 3 voices, and is silent in heavy rain', () => {
    const s = setup(() => 0.5);
    let peak = 0;
    for (let i = 0; i < 400; i++) {
      s.run(frame({ dt: 0.5, timeOfDay: 6.5 }));
      peak = Math.max(peak, s.bus.emitterCount);
      for (const p of s.panners()) {
        const d = Math.hypot(p.positionX.value, p.positionZ.value);
        expect(d).toBeGreaterThanOrEqual(19.9);
        expect(d).toBeLessThanOrEqual(90.1);
      }
    }
    expect(peak).toBeGreaterThanOrEqual(1);
    expect(peak).toBeLessThanOrEqual(3);
    const q = setup(() => 0.5);
    for (let i = 0; i < 200; i++) q.run(frame({ dt: 0.5, timeOfDay: 12, rain: 0.9 }));
    expect(q.bus.emitterCount).toBe(0);
  });

  it('pigeon-scatter makes a 3-6 bird flutter at the event position and cleans up', () => {
    const s = setup(() => 0.5);
    s.run(frame({ lifeEvents: [ev('pigeon-scatter', 5, 6)] }));
    const p = s.panners();
    expect(p).toHaveLength(1);
    expect(p[0].positionX.value).toBe(5);
    const srcs = s.nodes.filter((n) => n.kind === 'src');
    expect(srcs.length).toBeGreaterThanOrEqual(3);
    expect(srcs.length).toBeLessThanOrEqual(6);
    for (let i = 0; i < 40; i++) s.run(frame({ timeOfDay: 12, rain: 0.9 }));
    expect(s.bus.emitterCount).toBe(0);
  });

  it('cat-meow creates a positional meow', () => {
    const s = setup(() => 0.5);
    s.run(frame({ lifeEvents: [ev('cat-meow', -8, 9)] }));
    const p = s.panners();
    expect(p).toHaveLength(1);
    expect(p[0].positionX.value).toBe(-8);
    expect(p[0].positionZ.value).toBe(9);
  });

  it('dogs bark rarely, only within range, at most 3 at once', () => {
    const near = [1, 2, 3, 4, 5].map((i) => dogPed(i, 10 + i, 10));
    const f = (peds: AudioPedestrian[]) => frame({ dt: 1, timeOfDay: 12, rain: 0.9, pedestrians: peds });
    const s = setup(() => 0.5);
    s.run(f(near));
    expect(s.bus.emitterCount).toBe(0);
    let seen = 0;
    for (let i = 0; i < 800; i++) {
      s.run(f(near));
      seen = Math.max(seen, s.bus.emitterCount);
      expect(s.bus.emitterCount).toBeLessThanOrEqual(3);
    }
    expect(seen).toBe(3);
    const far = setup(() => 0.5);
    for (let i = 0; i < 100; i++) far.run(f([dogPed(1, 300, 0)]));
    expect(far.bus.emitterCount).toBe(0);
  });

  it('a barking dog emitter follows the dog', () => {
    const s = setup(() => 0.0005);
    const f = (x: number, z: number, dt = 1) => frame({ dt, timeOfDay: 12, rain: 0.9, pedestrians: [dogPed(1, x, z)] });
    s.run(f(10, 10));
    s.run(f(10, 10));
    expect(s.bus.emitterCount).toBe(1);
    s.run(f(12, 11, 0.01));
    const p = s.panners();
    expect(p[0].positionX.value).toBe(12);
    expect(p[0].positionZ.value).toBe(11);
  });
});
