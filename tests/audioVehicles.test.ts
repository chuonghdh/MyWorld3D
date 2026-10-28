import { describe, expect, it } from 'vitest';
import { AudioBus } from '../src/audio/bus';
import type { AudioFrame, AudioHorn, AudioVehicle, AudioVehicleClass } from '../src/audio/frame';
import type { ListenerState } from '../src/audio/listener';
import {
  ENGINE_PROFILES,
  ENGINE_VOICES,
  VehicleSounds,
  approachSpeed,
  engineLevel,
  engineTarget,
  firingHz,
  hornSpec,
  tyreLevel,
} from '../src/audio/vehicles';

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
  wave: unknown = null;
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
  setPeriodicWave(w: unknown) {
    this.wave = w;
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
    createPeriodicWave: () => ({ periodic: true }),
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

const veh = (id: number, x: number, z: number, o: Partial<AudioVehicle> = {}): AudioVehicle => ({
  id, x, z, heading: 0, cls: 'car', speed: 0, accel: 0, braking: false, indicator: 0, ...o,
});

function setup() {
  const { ctx, nodes } = makeCtx();
  const bus = new AudioBus(ctx, ctx.createGain());
  const sys = new VehicleSounds(ctx, bus);
  const run = (f: AudioFrame) => {
    ctx.advance(f.dt);
    sys.update(f);
  };
  return { ctx, nodes, bus, sys, run };
}

describe('engine model', () => {
  const car = ENGINE_PROFILES.car;

  it('idles at the idle rpm and rises with speed within a gear', () => {
    expect(engineTarget(car, 0, 0, 1).rpm).toBe(car.idleRpm);
    const r2 = engineTarget(car, 2, 0, 1).rpm;
    const r4 = engineTarget(car, 4, 0, 1).rpm;
    const r6 = engineTarget(car, 6, 0, 1).rpm;
    expect(r4).toBeGreaterThan(r2);
    expect(r6).toBeGreaterThan(r4);
  });

  it('shifts up with hysteresis and drops rpm at the shift', () => {
    let g = 1;
    let prev = 0;
    let dropped = false;
    for (let s = 0; s <= 20; s += 0.25) {
      const t = engineTarget(car, s, 0, g);
      if (t.gear > g) {
        expect(t.rpm).toBeLessThan(prev);
        dropped = true;
      }
      g = t.gear;
      prev = t.rpm;
    }
    expect(dropped).toBe(true);
    expect(g).toBeGreaterThan(2);
    // Slowing a little does not downshift straight away (hysteresis).
    expect(engineTarget(car, 20 - 0.5, 0, g).gear).toBe(g);
  });

  it('raises rpm, load and level with acceleration', () => {
    const cruise = engineTarget(car, 8, 0, 2);
    const push = engineTarget(car, 8, 2.5, 2);
    expect(push.load).toBeGreaterThan(cruise.load);
    expect(push.rpm).toBeGreaterThan(cruise.rpm);
    expect(firingHz(car, push.rpm)).toBeGreaterThan(firingHz(car, cruise.rpm));
    expect(engineLevel(car, 8, push.load, 0)).toBeGreaterThan(engineLevel(car, 8, cruise.load, 0));
  });

  it('keeps an idling vehicle audible but soft, and engine-brakes when decelerating at speed', () => {
    const idle = engineLevel(car, 0, 0, 0);
    expect(idle).toBeGreaterThan(0.1 * car.baseLevel);
    expect(idle).toBeLessThan(engineLevel(car, 10, 0.3, 0));
    expect(engineTarget(car, 10, -2.5, 3).engineBrake).toBeGreaterThan(0.5);
    expect(engineTarget(car, 10, 0.5, 3).engineBrake).toBe(0);
    expect(engineTarget(car, 0.5, -2.5, 1).engineBrake).toBe(0);
  });

  it('has class characters: diesel firing is low and slow, bikes rev high', () => {
    const idle = (c: AudioVehicleClass) => engineTarget(ENGINE_PROFILES[c], 0, 0, 1).rpm;
    expect(idle('bus')).toBeLessThan(idle('car'));
    expect(idle('motorbike')).toBeGreaterThan(idle('car'));
    const f = (c: AudioVehicleClass) => firingHz(ENGINE_PROFILES[c], idle(c));
    expect(f('car')).toBeCloseTo((800 / 60) * 2, 5);
    expect(f('bus')).toBeCloseTo((600 / 60) * 3, 5);
    // Quick rev response on the bike, heavy flywheel on the bus.
    expect(ENGINE_PROFILES.motorbike.rpmTau).toBeLessThan(ENGINE_PROFILES.bus.rpmTau);
  });

  it('tyre noise is silent below 4 m/s, rises with speed and is louder in rain', () => {
    expect(tyreLevel(3.9, 0)).toBe(0);
    expect(tyreLevel(10, 0)).toBeGreaterThan(0);
    expect(tyreLevel(18, 0)).toBeGreaterThan(tyreLevel(10, 0));
    expect(tyreLevel(15, 0.8)).toBeGreaterThan(tyreLevel(15, 0));
  });

  it('approach speed is positive toward the listener and negative away', () => {
    const toward = veh(1, 0, 50, { heading: Math.PI, speed: 10 }); // facing -z, listener at origin
    const away = veh(2, 0, 50, { heading: 0, speed: 10 });
    expect(approachSpeed(toward, 0, 0)).toBeCloseTo(10, 5);
    expect(approachSpeed(away, 0, 0)).toBeCloseTo(-10, 5);
  });
});

describe('VehicleSounds engine voices', () => {
  it('voices the nearest vehicles, keeps them stable and releases far ones', () => {
    const { sys, run, bus, ctx } = setup();
    const vs = Array.from({ length: 12 }, (_, i) => veh(i + 1, 10 + i * 8, 0));
    run(frame({ vehicles: vs }));
    expect(sys.engineIds().sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(sys.stats.engines).toBe(ENGINE_VOICES);
    // Vehicle 12 at 98 m is inside the range but loses to nearer ones; vehicle 9 at 74 m too.
    run(frame({ vehicles: vs }));
    expect(sys.engineIds().length).toBe(8);

    // The nearest vehicles drive away beyond 120 m: they are released, the others fill in.
    const moved = vs.map((v, i) => (i < 3 ? { ...v, x: 300 } : v));
    run(frame({ vehicles: moved }));
    const ids = sys.engineIds();
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(2);
    expect(ids).toContain(9);
    expect(ids.length).toBe(8);
    // Released voices fade out first, then disappear.
    expect(sys.stats.dying).toBe(3);
    const before = bus.emitterCount;
    ctx.advance(0.3);
    run(frame({ vehicles: moved, dt: 0.01 }));
    expect(sys.stats.dying).toBe(3);
    ctx.advance(0.5);
    run(frame({ vehicles: moved, dt: 0.01 }));
    expect(sys.stats.dying).toBe(0);
    expect(bus.emitterCount).toBe(before - 3);
  });

  it('ignores vehicles beyond hearing range and handles empty frames', () => {
    const { sys, run, bus } = setup();
    run(frame());
    run(frame({ vehicles: [veh(1, 500, 0), veh(2, 0, -300)] }));
    expect(sys.stats.engines).toBe(0);
    expect(bus.emitterCount).toBe(0);
    run(frame({ dt: 0 }));
  });

  it('follows the vehicle position with its emitter every frame', () => {
    const { sys, run, nodes } = setup();
    run(frame({ vehicles: [veh(1, 20, -5)] }));
    const panner = nodes.find((n) => n.kind === 'panner') as FakeNode;
    expect(panner.positionX.value).toBe(20);
    run(frame({ vehicles: [veh(1, 24, -9)] }));
    expect(panner.positionX.value).toBe(24);
    expect(panner.positionZ.value).toBe(-9);
    expect(sys.stats.engines).toBe(1);
  });

  it('engine pitch rises with speed and with acceleration load', () => {
    const { sys, run } = setup();
    const settle = (v: AudioVehicle) => {
      for (let i = 0; i < 40; i++) run(frame({ vehicles: [v], dt: 0.1 }));
      return (sys.engineVoice(v.id) as { lastFireHz: number }).lastFireHz;
    };
    const idle = settle(veh(1, 0, 20, { heading: Math.PI / 2 })); // crossing: no doppler
    const slow = settle(veh(1, 0, 20, { heading: Math.PI / 2, speed: 3 }));
    const fast = settle(veh(1, 0, 20, { heading: Math.PI / 2, speed: 5 }));
    expect(slow).toBeGreaterThan(idle);
    expect(fast).toBeGreaterThan(slow);
    const loaded = settle(veh(1, 0, 20, { heading: Math.PI / 2, speed: 5, accel: 2.5 }));
    expect(loaded).toBeGreaterThan(fast);
  });

  it('writes the firing frequency to the oscillators (class specific)', () => {
    const { run, nodes } = setup();
    run(frame({ vehicles: [veh(1, 0, 20, { heading: Math.PI / 2, cls: 'bus' })] }));
    const oscs = nodes.filter((n) => n.kind === 'osc');
    // Pulse osc uses the PeriodicWave and runs at the firing rate (about 30 Hz at idle).
    expect(oscs.length).toBeGreaterThanOrEqual(4);
    expect(oscs[0].wave).not.toBeNull();
    expect(oscs[0].frequency.value).toBeGreaterThan(25);
    expect(oscs[0].frequency.value).toBeLessThan(40);
    expect(oscs[1].frequency.value).toBeCloseTo(oscs[0].frequency.value / 2, 0);
  });

  it('applies doppler: approaching vehicles sound higher than receding ones', () => {
    const { sys, run } = setup();
    const fire = (heading: number) => {
      for (let i = 0; i < 40; i++) run(frame({ vehicles: [veh(1, 0, 40, { heading, speed: 15 })] }));
      return (sys.engineVoice(1) as { lastFireHz: number }).lastFireHz;
    };
    const approaching = fire(Math.PI); // toward the listener at the origin
    const sys2 = setup();
    const receding = (() => {
      for (let i = 0; i < 40; i++) sys2.run(frame({ vehicles: [veh(1, 0, 40, { heading: 0, speed: 15 })] }));
      return (sys2.sys.engineVoice(1) as { lastFireHz: number }).lastFireHz;
    })();
    expect(approaching).toBeGreaterThan(receding * 1.05);
  });

  it('fades in from silence and out on release (no hard cuts)', () => {
    const { run, nodes, ctx } = setup();
    const f = frame({ vehicles: [veh(1, 10, 0)] });
    ctx.advance(f.dt);
    // Observe the gain value right after construction: record writes made through setValue/target.
    run(f);
    const input = nodes.find((n) => n.kind === 'gain' && [...n.connections].some((c) => c.kind === 'biquad')) as FakeNode;
    const out = nodes.find((n) => n.kind === 'gain' && n.connections.has(input)) as FakeNode;
    expect(out.gain.value).toBe(1);
    expect(input.disconnected).toBe(false);
    run(frame({ vehicles: [veh(1, 500, 0)] }));
    expect(out.gain.value).toBe(0);
    expect(input.disconnected).toBe(false); // still alive while fading
    ctx.advance(0.6);
    run(frame({ vehicles: [], dt: 0.01 }));
    expect(input.disconnected).toBe(true);
    expect(nodes.filter((n) => n.kind === 'osc').every((n) => n.stopped)).toBe(true);
  });

  it('bus and truck play an air-brake burst when they come to a halt', () => {
    const { run, nodes } = setup();
    run(frame({ vehicles: [veh(1, 0, 20, { cls: 'bus', speed: 3, accel: -2, braking: true })] }));
    const srcBefore = nodes.filter((n) => n.kind === 'src').length;
    run(frame({ vehicles: [veh(1, 0, 20, { cls: 'bus', speed: 0.5, accel: -1, braking: true })] }));
    expect(nodes.filter((n) => n.kind === 'src').length).toBeGreaterThanOrEqual(srcBefore + 2);
    // Cars do not hiss.
    const s2 = setup();
    s2.run(frame({ vehicles: [veh(1, 0, 20, { cls: 'car', speed: 3, accel: -2, braking: true })] }));
    const before = s2.nodes.filter((n) => n.kind === 'src').length;
    s2.run(frame({ vehicles: [veh(1, 0, 20, { cls: 'car', speed: 0.5, accel: -1, braking: true })] }));
    expect(s2.nodes.filter((n) => n.kind === 'src').length).toBe(before);
  });

  it('dispose releases every emitter', () => {
    const { sys, run, bus } = setup();
    run(frame({ vehicles: [veh(1, 5, 5, { indicator: 1 }), veh(2, 9, 9)], horns: [{ x: 5, z: 5, cls: 'car' }] }));
    expect(bus.emitterCount).toBeGreaterThan(2);
    run(frame({ vehicles: [], dt: 0.01 }));
    sys.dispose();
    expect(bus.emitterCount).toBe(0);
    sys.dispose();
  });
});

describe('VehicleSounds indicator tick', () => {
  it('exists only while the indicator is on and clicks at about 1.5 Hz pairs', () => {
    const { sys, run, ctx } = setup();
    run(frame({ vehicles: [veh(1, 10, 0, { indicator: 0 }), veh(2, 12, 0, { indicator: 1 })] }));
    expect(sys.indicatorIds()).toEqual([2]);
    for (let i = 0; i < 20; i++) run(frame({ vehicles: [veh(1, 10, 0), veh(2, 12, 0, { indicator: 1 })], dt: 0.1 }));
    // 2 s of ticking: three tick+tock pairs = about 6 relay clicks (two voices' worth of nodes would double it).
    const clicks = (sys as unknown as { ticks: Map<number, { clickCount: number }> }).ticks.get(2)?.clickCount ?? 0;
    expect(clicks).toBeGreaterThanOrEqual(5);
    expect(clicks).toBeLessThanOrEqual(8);
    run(frame({ vehicles: [veh(1, 10, 0), veh(2, 12, 0, { indicator: 0 })], dt: 0.1 }));
    expect(sys.indicatorIds()).toEqual([]);
    ctx.advance(0.2);
    run(frame({ vehicles: [veh(1, 10, 0), veh(2, 12, 0)], dt: 0.01 }));
    expect(sys.stats.dying).toBe(0);
  });

  it('serves at most six indicator voices, the nearest ones, and only within 60 m', () => {
    const { sys, run } = setup();
    const vs = Array.from({ length: 9 }, (_, i) => veh(i + 1, 5 + i * 6, 0, { indicator: -1 }));
    run(frame({ vehicles: [...vs, veh(99, 90, 0, { indicator: 1 })] }));
    expect(sys.indicatorIds().sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('alternates tick and tock pitch', () => {
    const { run, nodes } = setup();
    run(frame({ vehicles: [veh(1, 10, 0, { indicator: 1 })] }));
    for (let i = 0; i < 4; i++) run(frame({ vehicles: [veh(1, 10, 0, { indicator: 1 })], dt: 0.2 }));
    const pings = nodes.filter((n) => n.kind === 'osc').map((n) => n.frequency.value);
    expect(new Set(pings).size).toBeGreaterThanOrEqual(2);
  });
});

describe('VehicleSounds horns', () => {
  it('plays one-shot horns at the horn position and cleans them up', () => {
    const { sys, run, ctx, bus, nodes } = setup();
    const h: AudioHorn = { x: 30, z: -10, cls: 'car' };
    run(frame({ horns: [h] }));
    expect(sys.stats.horns).toBe(1);
    const panner = nodes.find((n) => n.kind === 'panner') as FakeNode;
    expect(panner.positionX.value).toBe(30);
    const before = bus.emitterCount;
    for (let i = 0; i < 12; i++) run(frame({ dt: 0.2 }));
    expect(sys.stats.horns).toBe(0);
    expect(bus.emitterCount).toBe(before - 1);
    expect(ctx.currentTime).toBeGreaterThan(2);
  });

  it('ignores horns beyond 220 m and caps concurrent horns', () => {
    const { sys, run } = setup();
    run(frame({ horns: [{ x: 400, z: 0, cls: 'bus' }] }));
    expect(sys.stats.horns).toBe(0);
    run(frame({ horns: Array.from({ length: 7 }, (_, i) => ({ x: 10 + i, z: 0, cls: 'car' as const })) }));
    expect(sys.stats.horns).toBe(4);
  });

  it('has class specific horns: two-tone car, deep long bus/truck, short high bike', () => {
    const r = () => 0.5;
    const car = hornSpec('car', r);
    const bus = hornSpec('bus', r);
    const truck = hornSpec('truck', r);
    const bike = hornSpec('motorbike', r);
    expect(car.freqs).toEqual([400, 500]);
    expect(bus.freqs).toEqual([220, 277]);
    expect(truck.freqs[0]).toBeLessThan(car.freqs[0]);
    expect(bike.freqs[0]).toBeGreaterThan(car.freqs[1]);
    const dur = (s: ReturnType<typeof hornSpec>) => s.pattern.reduce((a, [, d]) => a + d, 0);
    expect(dur(bus)).toBeGreaterThan(dur(car) * 1.8);
    expect(dur(bike)).toBeLessThan(dur(car));
  });
});
