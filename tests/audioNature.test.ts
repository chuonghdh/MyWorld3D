import { describe, expect, it } from 'vitest';
import { AudioBus } from '../src/audio/bus';
import type { AudioFrame } from '../src/audio/frame';
import type { ListenerState } from '../src/audio/listener';
import {
  BELL_PARTIALS,
  BELL_SPACING_S,
  cricketDensity,
  createNatureSoundsWith,
  hourToStrikes,
  planWhistle,
  rustleBurstLevel,
  rustleCenterHz,
  rustleLevel,
  shouldStrike,
  whistleRate,
} from '../src/audio/nature';

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
  start() {}
  stop(t?: number) { if (t !== undefined) this.stopAt = t; else this.stopAt = 0; }
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
    dt: 0.1, listener: LIS, timeOfDay: 12.5, season: 'summer', windSpeed: 2, gust: 0, rain: 0, night: false,
    vehicles: [], pedestrians: [], trees: [], church: null, lifeEvents: [], thunder: [], horns: [], musicEnabled: false, ...over,
  };
}

function setup(rand: () => number = () => 0.1) {
  const { ctx, nodes } = makeCtx();
  const bus = new AudioBus(ctx, ctx.createGain());
  const sys = createNatureSoundsWith(ctx, bus, { rand });
  const panners = () => nodes.filter((n) => n.kind === 'panner' && !n.disconnected);
  const run = (f: AudioFrame) => { ctx.advance(f.dt); sys.update(f); };
  /** Input gain of every live emitter (input -> lowpass -> panner). */
  const emitterGains = () =>
    panners().map((p) => {
      const lp = nodes.find((n) => n.connections.has(p)) as FakeNode;
      const input = nodes.find((n) => n.connections.has(lp)) as FakeNode;
      return input.gain.value;
    });
  return { ctx, bus, sys, nodes, panners, run, emitterGains };
}

const ring = (n: number, r = 30) => Array.from({ length: n }, (_, i) => ({ x: Math.cos(i) * (r + i), z: Math.sin(i) * (r + i), scale: 1 }));

describe('nature pure functions', () => {
  it('rustle follows the wind and the season', () => {
    expect(rustleLevel(10, 0, 'summer', 1)).toBeGreaterThan(rustleLevel(3, 0, 'summer', 1) * 2);
    expect(rustleLevel(6, 1, 'summer', 1)).toBeGreaterThan(rustleLevel(6, 0, 'summer', 1));
    expect(rustleLevel(10, 0, 'winter', 1)).toBeLessThan(rustleLevel(10, 0, 'summer', 1) * 0.2);
    expect(rustleLevel(10, 0, 'autumn', 1)).toBeLessThan(rustleLevel(10, 0, 'summer', 1));
    expect(rustleLevel(10, 0, 'summer', 1.5)).toBeGreaterThan(rustleLevel(10, 0, 'summer', 0.6));
    expect(rustleCenterHz(12, 0, 'summer')).toBeGreaterThan(rustleCenterHz(2, 0, 'summer'));
    expect(rustleCenterHz(8, 0, 'autumn')).toBeGreaterThan(rustleCenterHz(8, 0, 'summer'));
    expect(rustleLevel(Number.NaN, 0, 'summer', Number.NaN)).not.toBeNaN();
  });

  it('whistle probability grows with wind and is zero in a breeze', () => {
    expect(whistleRate(4, 0)).toBe(0);
    expect(whistleRate(8, 0)).toBeLessThan(whistleRate(11, 0));
    expect(whistleRate(11, 0)).toBeLessThan(whistleRate(15, 0));
    expect(whistleRate(9, 1)).toBeGreaterThan(whistleRate(9, 0));
  });

  it('plans whistles inside 400-1500 Hz lasting 1.5-4 s', () => {
    for (const r of [0, 0.5, 0.999]) {
      const p = planWhistle(() => r);
      for (const f of [p.f0, p.fMid, p.f1]) {
        expect(f).toBeGreaterThanOrEqual(400);
        expect(f).toBeLessThanOrEqual(1500);
      }
      expect(p.dur).toBeGreaterThanOrEqual(1.5);
      expect(p.dur).toBeLessThanOrEqual(4);
    }
  });


  it('counts bell strikes for every hour', () => {
    const expected = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    for (let h = 0; h < 24; h++) {
      expect(hourToStrikes(h)).toBe(expected[h]);
      expect(hourToStrikes(h + 0.99)).toBe(expected[h]);
    }
  });

  it('only strikes for a small continuous forward step across an hour boundary', () => {
    expect(shouldStrike(null, 12.0, 0.1)).toBe(false);
    expect(shouldStrike(11.98, 12.02, 0.1)).toBe(true);
    expect(shouldStrike(23.98, 0.02, 0.1)).toBe(true);
    expect(shouldStrike(11.5, 11.55, 0.1)).toBe(false); // same hour
    expect(shouldStrike(10, 12.5, 0.1)).toBe(false); // slider jump
    expect(shouldStrike(11.9, 12.1, 0.1)).toBe(false); // step too large
    expect(shouldStrike(12.02, 11.98, 0.1)).toBe(false); // backwards
    expect(shouldStrike(11.98, 12.02, 0.001)).toBe(false); // implausibly fast clock
    expect(shouldStrike(11.98, 12.02, 0)).toBe(false);
  });
});

describe('createNatureSounds: leaf rustle', () => {
  it('handles empty input and disposes cleanly', () => {
    const s = setup();
    expect(() => s.run(frame())).not.toThrow();
    s.sys.dispose();
    expect(s.bus.emitterCount).toBe(0);
  });

  it('is silent in still air: no constant background rustle', () => {
    const s = setup();
    for (let i = 0; i < 400; i++) s.run(frame({ dt: 0.5, windSpeed: 0.8, trees: ring(8) }));
    expect(s.bus.emitterCount).toBe(0);
    expect(rustleBurstLevel(1, 0, 'summer', 1)).toBe(0);
  });

  it('rustles in short bursts about every 10 s, not continuously', () => {
    const s = setup(() => 0.5);
    let busy = 0;
    let bursts = 0;
    let wasBusy = false;
    const total = 240;
    for (let i = 0; i < total; i++) {
      s.run(frame({ dt: 0.5, windSpeed: 9, trees: ring(8) }));
      const now = s.bus.emitterCount > 0;
      if (now) busy++;
      if (now && !wasBusy) bursts++;
      wasBusy = now;
    }
    // 120 s of wind: roughly 10-12 bursts, each a few seconds, so the trees are quiet most of the time.
    expect(bursts).toBeGreaterThanOrEqual(8);
    expect(bursts).toBeLessThanOrEqual(15);
    expect(busy / total).toBeLessThan(0.5);
  });

  it('a burst uses at most 3 of the 5 nearest trees and ignores far ones', () => {
    const s = setup(() => 0.5);
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      s.run(frame({ dt: 0.5, windSpeed: 9, trees: [...ring(10), { x: 500, z: 0, scale: 1 }] }));
      peak = Math.max(peak, s.bus.emitterCount);
      for (const p of s.panners()) expect(Math.hypot(p.positionX.value, p.positionZ.value)).toBeLessThan(100);
    }
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(3);
    s.sys.dispose();
    expect(s.bus.emitterCount).toBe(0);
  });

  it('burst loudness follows the wind, the season and gusts', () => {
    expect(rustleBurstLevel(12, 0, 'summer', 1)).toBeGreaterThan(rustleBurstLevel(4, 0, 'summer', 1) * 2);
    expect(rustleBurstLevel(6, 1, 'summer', 1)).toBeGreaterThan(rustleBurstLevel(6, 0, 'summer', 1));
    expect(rustleBurstLevel(12, 0, 'winter', 1)).toBeLessThan(rustleBurstLevel(12, 0, 'summer', 1) * 0.2);
    expect(rustleBurstLevel(Number.NaN, 0, 'summer', Number.NaN)).toBe(0);
  });
});

describe('createNatureSounds: wind whistle', () => {
  it('whistles 15-70 m away only in strong wind, at most 2 at once', () => {
    const s = setup(() => 0.1);
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      s.run(frame({ dt: 0.5, windSpeed: 16 }));
      peak = Math.max(peak, s.bus.emitterCount);
      for (const p of s.panners()) {
        const d = Math.hypot(p.positionX.value, p.positionZ.value);
        expect(d).toBeGreaterThanOrEqual(14.9);
        expect(d).toBeLessThanOrEqual(70.1);
      }
    }
    expect(peak).toBe(2);
    const calm = setup(() => 0.0);
    for (let i = 0; i < 60; i++) calm.run(frame({ dt: 0.5, windSpeed: 5 }));
    expect(calm.bus.emitterCount).toBe(0);
  });
});

describe('createNatureSounds: crickets', () => {
  it('stay silent in the day, even in summer', () => {
    const s = setup();
    for (let i = 0; i < 5; i++) s.run(frame({ timeOfDay: 12, season: 'summer' }));
    expect(s.bus.emitterCount).toBe(0);
  });

  it('sing on a summer night (22:00-05:00)', () => {
    const s = setup();
    for (let i = 0; i < 5; i++) s.run(frame({ night: true, timeOfDay: 23, season: 'summer' }));
    expect(s.bus.emitterCount).toBeGreaterThan(0);
  });

  it('stay silent from the aerial view (camera above 45 m), even on a summer night', () => {
    const s = setup();
    const high = { ...LIS, height: 60 };
    for (let i = 0; i < 5; i++) s.run(frame({ listener: high, timeOfDay: 23, season: 'summer' }));
    expect(s.bus.emitterCount).toBe(0);
  });
});

describe('cricketDensity', () => {
  it('is zero outside 22:00-05:00 and full in summer inside it', () => {
    for (let h = 0; h < 24; h += 0.5) {
      const inWindow = h >= 22 || h < 5;
      const d = cricketDensity(h, 'summer', 0);
      if (inWindow) expect(d).toBe(1);
      else expect(d).toBe(0);
    }
  });

  it('keeps the window edges: 21:59 silent, 22:00 on, 04:59 on, 05:00 off', () => {
    expect(cricketDensity(21.99, 'summer', 0)).toBe(0);
    expect(cricketDensity(22, 'summer', 0)).toBe(1);
    expect(cricketDensity(4.99, 'summer', 0)).toBe(1);
    expect(cricketDensity(5, 'summer', 0)).toBe(0);
  });

  it('keeps the season and rain rules', () => {
    expect(cricketDensity(23, 'autumn', 0)).toBe(0.5);
    expect(cricketDensity(23, 'winter', 0)).toBe(0);
    expect(cricketDensity(23, 'summer', 0.4)).toBeCloseTo(0.4);
    expect(cricketDensity(23, 'summer', 1)).toBe(0);
  });

  it('wraps the hour so 24 is midnight', () => {
    expect(cricketDensity(24, 'summer', 0)).toBe(1);
    expect(cricketDensity(-1, 'summer', 0)).toBe(1);
  });
});

/** Church-bell tests run in winter so crickets (summer only) stay silent and the oscillator count is bells only. */
const winterFrame = (o: Partial<AudioFrame> = {}): AudioFrame => frame({ season: 'winter', ...o });

describe('createNatureSounds: church bell', () => {
  const church = { x: 100, z: -50 };
  const osc = (nodes: FakeNode[]) => nodes.filter((n) => n.kind === 'osc').length;

  /** Runs a continuous clock across hour h, then lets the bell finish; returns the number of strikes heard. */
  function ringHour(h: number, opts: { church?: { x: number; z: number } | null } = {}) {
    const s = setup();
    const c = opts.church === undefined ? church : opts.church;
    s.run(winterFrame({ timeOfDay: h - 0.04, church: c, dt: 0.2 }));
    s.run(winterFrame({ timeOfDay: h + 0.01, church: c, dt: 0.2 }));
    const afterTrigger = s;
    for (let i = 0; i < 20; i++) s.run(winterFrame({ timeOfDay: h + 0.02, church: c, dt: BELL_SPACING_S }));
    return { s, strikes: osc(afterTrigger.nodes) / BELL_PARTIALS.length };
  }

  it('strikes the right number of times for every hour, at the church position', () => {
    for (let h = 0; h < 24; h++) {
      const { strikes } = ringHour(h);
      expect(strikes).toBe(hourToStrikes(h));
    }
    const s = setup();
    s.run(winterFrame({ timeOfDay: 2.96, church, dt: 0.2 }));
    s.run(winterFrame({ timeOfDay: 3.01, church, dt: 0.2 }));
    const p = s.panners();
    expect(p).toHaveLength(1);
    expect(p[0].positionX.value).toBe(100);
    expect(p[0].positionZ.value).toBe(-50);
  });

  it('does not fire at start, on a slider jump, on a backwards step, without a church, or when too far', () => {
    const first = setup();
    first.run(winterFrame({ timeOfDay: 12.0, church }));
    expect(first.bus.emitterCount).toBe(0);
    const jump = setup();
    jump.run(winterFrame({ timeOfDay: 10, church }));
    jump.run(winterFrame({ timeOfDay: 12.2, church }));
    expect(jump.bus.emitterCount).toBe(0);
    const back = setup();
    back.run(winterFrame({ timeOfDay: 12.02, church }));
    back.run(winterFrame({ timeOfDay: 11.98, church, dt: 0.2 }));
    expect(back.bus.emitterCount).toBe(0);
    expect(osc(ringHour(9, { church: null }).s.nodes)).toBe(0);
    expect(osc(ringHour(9, { church: { x: 900, z: 0 } }).s.nodes)).toBe(0);
  });

  it('does not re-trigger while the clock stays in the same hour or while still ringing', () => {
    const s = setup();
    s.run(winterFrame({ timeOfDay: 2.96, church, dt: 0.2 }));
    s.run(winterFrame({ timeOfDay: 3.01, church, dt: 0.2 }));
    for (let i = 0; i < 30; i++) s.run(winterFrame({ timeOfDay: 3.02 + i * 0.01, church, dt: BELL_SPACING_S }));
    expect(osc(s.nodes) / BELL_PARTIALS.length).toBe(3);
    // crossing into 4 while the clock keeps moving rings 4 more (a new, separate ring)
    s.run(winterFrame({ timeOfDay: 3.98, church, dt: 0.2 }));
    s.run(winterFrame({ timeOfDay: 4.02, church, dt: 0.2 }));
    for (let i = 0; i < 12; i++) s.run(winterFrame({ timeOfDay: 4.03, church, dt: BELL_SPACING_S }));
    expect(osc(s.nodes) / BELL_PARTIALS.length).toBe(7);
    expect(s.bus.emitterCount).toBe(0);
  });

  it('spaces strikes by about 3.2 s and cleans up its emitter', () => {
    const s = setup();
    s.run(winterFrame({ timeOfDay: 4.96, church, dt: 0.2 }));
    s.run(winterFrame({ timeOfDay: 5.01, church, dt: 0.2 }));
    expect(osc(s.nodes) / BELL_PARTIALS.length).toBe(1);
    s.run(winterFrame({ timeOfDay: 5.02, church, dt: 1 }));
    expect(osc(s.nodes) / BELL_PARTIALS.length).toBe(1);
    s.run(winterFrame({ timeOfDay: 5.02, church, dt: 2.3 }));
    expect(osc(s.nodes) / BELL_PARTIALS.length).toBe(2);
    for (let i = 0; i < 12; i++) s.run(winterFrame({ timeOfDay: 5.02, church, dt: BELL_SPACING_S }));
    expect(s.bus.emitterCount).toBe(0);
  });
});
