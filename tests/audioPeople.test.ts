import { describe, expect, it } from 'vitest';
import { AudioBus } from '../src/audio/bus';
import type { AudioFrame, AudioPedestrian } from '../src/audio/frame';
import type { ListenerState } from '../src/audio/listener';
import { PeopleSounds, POSE_CHAT, POSE_STAND, POSE_WALK, poseKind, speakerFor, stepRate } from '../src/audio/people';

class FakeParam {
  value = 0;
  setTargetAtTime(v: number) {
    this.value = v;
  }
  setValueAtTime(v: number) {
    this.value = v;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
  }
  exponentialRampToValueAtTime(v: number) {
    this.value = v;
  }
  cancelScheduledValues() {}
}

class FakeNode {
  connections = new Set<FakeNode>();
  disconnected = false;
  started = false;
  stopped = false;
  stopAt = Infinity;
  onended: (() => void) | null = null;
  gain = new FakeParam();
  frequency = new FakeParam();
  detune = new FakeParam();
  Q = new FakeParam();
  playbackRate = new FakeParam();
  positionX = new FakeParam();
  positionY = new FakeParam();
  positionZ = new FakeParam();
  type = '';
  buffer: unknown = null;
  loop = false;
  panningModel = '';
  distanceModel = '';
  refDistance = 0;
  maxDistance = 0;
  rolloffFactor = 0;
  constructor(readonly kind: string) {}
  connect(n: FakeNode) {
    this.connections.add(n);
    return n;
  }
  disconnect() {
    this.connections.clear();
    this.disconnected = true;
  }
  start() {
    this.started = true;
  }
  stop(t?: number) {
    this.stopped = true;
    if (t !== undefined) this.stopAt = t;
  }
}

function makeCtx() {
  const nodes: FakeNode[] = [];
  const mk = (k: string) => () => {
    const n = new FakeNode(k);
    nodes.push(n);
    return n;
  };
  const listener = {
    positionX: new FakeParam(), positionY: new FakeParam(), positionZ: new FakeParam(),
    forwardX: new FakeParam(), forwardY: new FakeParam(), forwardZ: new FakeParam(),
    upX: new FakeParam(), upY: new FakeParam(), upZ: new FakeParam(),
  };
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    listener,
    createGain: mk('gain'),
    createBiquadFilter: mk('biquad'),
    createPanner: mk('panner'),
    createOscillator: mk('osc'),
    createBufferSource: mk('src'),
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
    advance(dt: number) {
      ctx.currentTime += dt;
      for (const n of nodes) {
        if (n.stopAt <= ctx.currentTime && n.onended) {
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
    dt: 0.1, listener: LIS, timeOfDay: 12, season: 'summer', windSpeed: 1, gust: 0, rain: 0, night: false,
    vehicles: [], pedestrians: [], trees: [], church: null, lifeEvents: [], thunder: [], horns: [], musicEnabled: false, ...over,
  };
}

const ped = (id: number, x: number, z: number, o: Partial<Omit<AudioPedestrian, 'pose'>> & { pose?: unknown } = {}): AudioPedestrian =>
  ({ id, x, z, speed: 0, pose: POSE_STAND, umbrella: false, dog: null, ...o }) as AudioPedestrian;

function setup() {
  const { ctx, nodes } = makeCtx();
  const bus = new AudioBus(ctx, ctx.createGain());
  const sys = new PeopleSounds(ctx, bus);
  const run = (f: AudioFrame) => {
    ctx.advance(f.dt);
    sys.update(f);
  };
  return { ctx, nodes, bus, sys, run };
}

describe('people helpers', () => {
  it('knows the pedestrian pose constants and accepts numbers, numeric strings and names', () => {
    expect([POSE_WALK, POSE_STAND, POSE_CHAT]).toEqual([0, 1, 2]);
    expect(poseKind(2)).toBe('chat');
    expect(poseKind('2')).toBe('chat');
    expect(poseKind('chat')).toBe('chat');
    expect(poseKind(0)).toBe('walk');
    expect(poseKind('walk')).toBe('walk');
    expect(poseKind(1)).toBe('stand');
    expect(poseKind(3)).toBe('sit');
    expect(poseKind('')).toBe('other');
    expect(poseKind(undefined)).toBe('other');
  });

  it('gives stable speakers with pitch in the documented ranges and 3-5 Hz syllables', () => {
    for (let id = 1; id <= 200; id++) {
      const s = speakerFor(id);
      expect(speakerFor(id)).toEqual(s);
      const man = s.f0 >= 90 && s.f0 <= 130;
      const high = s.f0 >= 190 && s.f0 <= 250;
      expect(man || high).toBe(true);
      expect(s.rate).toBeGreaterThanOrEqual(3);
      expect(s.rate).toBeLessThanOrEqual(5);
      expect(s.vowels.length).toBe(3);
      for (const [f1, f2, f3] of s.vowels) {
        expect(f1).toBeGreaterThan(200);
        expect(f2).toBeGreaterThan(f1);
        expect(f3).toBeGreaterThan(f2);
      }
    }
    const men = Array.from({ length: 200 }, (_, i) => speakerFor(i + 1)).filter((s) => s.f0 < 140).length;
    expect(men).toBeGreaterThan(60);
    expect(men).toBeLessThan(140);
  });

  it('step rate rises with speed and stays human', () => {
    expect(stepRate(0.5)).toBeCloseTo(1.2);
    expect(stepRate(1.4)).toBeGreaterThan(1.8);
    expect(stepRate(1.4)).toBeLessThan(2.1);
    expect(stepRate(2.5)).toBeGreaterThan(stepRate(1.4));
    expect(stepRate(20)).toBeLessThanOrEqual(3.4);
    expect(stepRate(Number.NaN)).toBeCloseTo(1.2);
  });
});

describe('PeopleSounds talking', () => {
  it('creates chat voices only for the chat pose, the nearest four, within range', () => {
    const { sys, run } = setup();
    const ps = [
      ...Array.from({ length: 6 }, (_, i) => ped(i + 1, 3 + i * 3, 0, { pose: POSE_CHAT })),
      ped(20, 4, 0, { pose: POSE_STAND }),
      ped(21, 5, 0, { pose: POSE_WALK, speed: 0 }),
      ped(22, 80, 0, { pose: POSE_CHAT }),
    ];
    run(frame({ pedestrians: ps }));
    expect(sys.chatIds().sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    const s2 = setup();
    s2.run(frame({ pedestrians: [ped(1, 5, 0, { pose: 'chat' }), ped(2, 6, 0, { pose: 'stand' })] }));
    expect(s2.sys.chatIds()).toEqual([1]);
  });

  it('releases a voice when the pose changes and removes it after the fade', () => {
    const { sys, run, ctx, bus } = setup();
    run(frame({ pedestrians: [ped(1, 5, 0, { pose: POSE_CHAT })] }));
    expect(bus.emitterCount).toBe(1);
    run(frame({ pedestrians: [ped(1, 5, 0, { pose: POSE_STAND })] }));
    expect(sys.stats.chat).toBe(0);
    expect(sys.stats.dying).toBe(1);
    expect(bus.emitterCount).toBe(1);
    ctx.advance(0.6);
    run(frame({ pedestrians: [], dt: 0.01 }));
    expect(bus.emitterCount).toBe(0);
  });

  it('speaks in syllables at 3-5 Hz with pauses, moving the formant filters', () => {
    const { sys, run, nodes } = setup();
    run(frame({ pedestrians: [ped(7, 6, 0, { pose: POSE_CHAT })] }));
    const bps = nodes.filter((n) => n.kind === 'biquad' && n.type === 'bandpass');
    expect(bps.length).toBeGreaterThanOrEqual(3);
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) {
      run(frame({ pedestrians: [ped(7, 6, 0, { pose: POSE_CHAT })], dt: 0.05 }));
      for (const b of bps.slice(-3)) seen.add(Math.round(b.frequency.value));
    }
    const v = sys.chatVoice(7);
    expect(v).toBeDefined();
    // 5 s: 3-5 Hz minus the pauses between phrases -> roughly 8 to 25 syllables.
    expect(v?.syllables).toBeGreaterThan(8);
    expect(v?.syllables).toBeLessThan(26);
    expect(seen.size).toBeGreaterThan(6);
    const osc = nodes.find((n) => n.kind === 'osc') as FakeNode;
    const sp = speakerFor(7);
    expect(osc.frequency.value).toBeGreaterThan(sp.f0 * 0.7);
    expect(osc.frequency.value).toBeLessThan(sp.f0 * 1.3);
  });
});

describe('PeopleSounds footsteps', () => {
  it('voices the nearest five walkers that move, not standing ones', () => {
    const { sys, run } = setup();
    const ps = [
      ...Array.from({ length: 8 }, (_, i) => ped(i + 1, 4 + i * 2, 0, { pose: POSE_WALK, speed: 1.4 })),
      ped(30, 3, 0, { pose: POSE_WALK, speed: 0 }),
      ped(31, 3, 1, { pose: POSE_CHAT, speed: 0 }),
    ];
    run(frame({ pedestrians: ps }));
    expect(sys.stepIds().sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('steps faster when walking faster', () => {
    const count = (speed: number) => {
      const { sys, run } = setup();
      for (let i = 0; i < 100; i++) run(frame({ pedestrians: [ped(1, 5 + i * speed * 0.02, 0, { pose: POSE_WALK, speed })], dt: 0.02 }));
      return sys.stepVoice(1)?.steps ?? 0;
    };
    const slow = count(0.9);
    const normal = count(1.4);
    const fast = count(2.6);
    // 2 s of walking.
    expect(slow).toBeGreaterThanOrEqual(2);
    expect(normal).toBeGreaterThan(slow);
    expect(fast).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThanOrEqual(3);
    expect(normal).toBeLessThanOrEqual(5);
  });

  it('alternates the emitter to the left and right of the walking line', () => {
    const { run, nodes } = setup();
    const xs = new Set<number>();
    for (let i = 0; i < 150; i++) {
      run(frame({ pedestrians: [ped(1, 10, -5 + i * 0.028, { pose: POSE_WALK, speed: 1.4 })], dt: 0.02 }));
      const panner = nodes.find((n) => n.kind === 'panner') as FakeNode;
      xs.add(Math.round(panner.positionX.value * 100) / 100);
    }
    expect(xs.has(10.1) && xs.has(9.9)).toBe(true);
  });

  it('uses a wetter sound when it rains', () => {
    const filters = (rain: number, type: string) => {
      const { run, nodes } = setup();
      for (let i = 0; i < 100; i++) run(frame({ rain, pedestrians: [ped(1, 5, i * 0.03, { pose: POSE_WALK, speed: 1.4 })], dt: 0.02 }));
      return nodes.filter((n) => n.kind === 'biquad' && n.type === type).length;
    };
    expect(filters(0.6, 'highpass')).toBeGreaterThan(filters(0, 'highpass'));
    expect(filters(0.6, 'lowpass')).toBeGreaterThan(filters(0, 'lowpass'));
  });
});

describe('PeopleSounds umbrellas', () => {
  const umbs = () => [
    ped(1, 4, 0, { umbrella: true, pose: POSE_WALK, speed: 1 }),
    ped(2, 6, 0, { umbrella: false, pose: POSE_WALK, speed: 1 }),
    ped(3, 5, 3, { umbrella: true }),
  ];

  it('exists only in rain above 0.15, for umbrella carriers, with hysteresis', () => {
    const { sys, run } = setup();
    run(frame({ rain: 0, pedestrians: umbs() }));
    expect(sys.umbrellaIds()).toEqual([]);
    run(frame({ rain: 0.12, pedestrians: umbs() }));
    expect(sys.umbrellaIds()).toEqual([]);
    run(frame({ rain: 0.4, pedestrians: umbs() }));
    expect(sys.umbrellaIds().sort()).toEqual([1, 3]);
    run(frame({ rain: 0.12, pedestrians: umbs() }));
    expect(sys.umbrellaIds().length).toBe(2); // still on: it only goes off below 0.1
    run(frame({ rain: 0.05, pedestrians: umbs() }));
    expect(sys.umbrellaIds()).toEqual([]);
  });

  it('keeps at most four and the nearest', () => {
    const { sys, run } = setup();
    const ps = Array.from({ length: 7 }, (_, i) => ped(i + 1, 3 + i * 2, 0, { umbrella: true }));
    run(frame({ rain: 0.6, pedestrians: ps }));
    expect(sys.umbrellaIds().sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it('follows rain intensity with the patter density', () => {
    const { run, nodes } = setup();
    const ps = [ped(1, 4, 0, { umbrella: true })];
    run(frame({ rain: 0.3, pedestrians: ps }));
    const srcNode = nodes.find((n) => n.kind === 'src') as FakeNode;
    expect(srcNode.loop).toBe(true);
    const before = srcNode.playbackRate.value;
    run(frame({ rain: 0.9, pedestrians: ps }));
    expect(srcNode.playbackRate.value).toBeGreaterThan(before);
  });
});

describe('PeopleSounds lifecycle', () => {
  it('handles empty frames, releases everything on dispose and never leaks emitters', () => {
    const { sys, run, bus } = setup();
    run(frame());
    run(frame({ dt: 0 }));
    run(frame({ rain: 0.8, pedestrians: [ped(1, 4, 0, { pose: POSE_CHAT, umbrella: true }), ped(2, 5, 0, { pose: POSE_WALK, speed: 1.3 })] }));
    expect(bus.emitterCount).toBeGreaterThanOrEqual(3);
    sys.dispose();
    expect(bus.emitterCount).toBe(0);
    sys.dispose();
  });

  it('ignores non finite positions', () => {
    const { sys, run } = setup();
    run(frame({ pedestrians: [ped(1, Number.NaN, 0, { pose: POSE_CHAT })] }));
    expect(sys.stats.chat).toBe(0);
  });
});
