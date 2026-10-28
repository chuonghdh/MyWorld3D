import { describe, expect, it } from 'vitest';
import { AudioBus, CATEGORIES, VoiceBudget } from '../src/audio/bus';
import type { ListenerState } from '../src/audio/listener';

class FakeParam {
  value = 1;
  setTargetAtTime(v: number) {
    this.value = v;
  }
}

class FakeNode {
  connections = new Set<FakeNode>();
  disconnected = false;
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  positionX = new FakeParam();
  positionY = new FakeParam();
  positionZ = new FakeParam();
  type = '';
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
    listener,
    createGain: mk('gain'),
    createBiquadFilter: mk('biquad'),
    createPanner: mk('panner'),
  };
  return { ctx: ctx as unknown as AudioContext, nodes, listener };
}

const L = (x: number, z: number, height = 1.7): ListenerState => ({
  x, y: 2, z, forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 }, height,
});

describe('AudioBus', () => {
  it('applies category, group and master volumes as plain numbers', () => {
    const { ctx } = makeCtx();
    const master = ctx.createGain();
    const bus = new AudioBus(ctx, master);
    bus.setCategoryVolume('horn', 0.4);
    bus.setGroupVolume('nature', 0.25);
    bus.setMasterVolume(0.6);
    expect(bus.category('horn').gain.value).toBeCloseTo(0.4);
    expect(master.gain.value).toBeCloseTo(0.6);
    bus.setMuted(true);
    expect(master.gain.value).toBe(0);
    bus.setMuted(false);
    expect(master.gain.value).toBeCloseTo(0.6);
    const v = bus.getVolumes();
    expect(v.categories.horn).toBeCloseTo(0.4);
    expect(v.groups.nature).toBeCloseTo(0.25);
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
    expect(Object.keys(v.categories).sort()).toEqual([...CATEGORIES].sort());
    bus.setCategoryVolume('horn', 5);
    expect(bus.getVolumes().categories.horn).toBe(1);
    bus.setCategoryVolume('horn', Number.NaN);
    expect(bus.getVolumes().categories.horn).toBe(1);
  });

  it('the Sound switch silences effects and nature but never music', () => {
    const { ctx } = makeCtx();
    const bus = new AudioBus(ctx, ctx.createGain());
    const groups = (bus as unknown as { groupNodes: Record<string, { gain: { value: number } }> }).groupNodes;
    bus.setGroupVolume('music', 0.7);
    bus.setGroupVolume('effects', 0.5);
    bus.setSoundMuted(true);
    expect(groups.effects.gain.value).toBe(0);
    expect(groups.nature.gain.value).toBe(0);
    expect(groups.music.gain.value).toBeCloseTo(0.7);
    bus.setGroupVolume('nature', 0.9); // changing a level while muted must not unmute
    expect(groups.nature.gain.value).toBe(0);
    bus.setSoundMuted(false);
    expect(groups.effects.gain.value).toBeCloseTo(0.5);
    expect(groups.nature.gain.value).toBeCloseTo(0.9);
  });

  it('builds the emitter chain input -> lowpass -> panner -> category and disposes it', () => {
    const { ctx } = makeCtx();
    const bus = new AudioBus(ctx, ctx.createGain());
    const e = bus.createEmitter({ category: 'engine', x: 10, y: 0, z: 0, refDistance: 5, rolloff: 2 });
    const input = e.input as unknown as FakeNode;
    const lp = [...input.connections][0];
    expect(lp.kind).toBe('biquad');
    const panner = [...lp.connections][0];
    expect(panner.kind).toBe('panner');
    expect(panner.panningModel).toBe('equalpower');
    expect(panner.distanceModel).toBe('inverse');
    expect(panner.refDistance).toBe(5);
    expect(panner.rolloffFactor).toBe(2);
    expect([...panner.connections][0]).toBe(bus.category('engine') as unknown as FakeNode);
    expect(panner.positionX.value).toBe(10);
    expect(bus.emitterCount).toBe(1);

    e.setPosition(-4, 1, 2);
    expect(panner.positionX.value).toBe(-4);
    e.setGain(0.5);
    expect(input.gain.value).toBeCloseTo(0.5);

    e.dispose();
    expect(input.disconnected && lp.disconnected && panner.disconnected).toBe(true);
    expect(bus.emitterCount).toBe(0);
    e.dispose();
  });

  it('lowers the emitter cutoff with distance from the listener', () => {
    const { ctx } = makeCtx();
    const bus = new AudioBus(ctx, ctx.createGain());
    bus.setListener(L(0, 0));
    const near = bus.createEmitter({ category: 'dog', x: 2, y: 2, z: 0 });
    const far = bus.createEmitter({ category: 'dog', x: 250, y: 2, z: 0 });
    const cut = (e: { input: AudioNode }) => [...(e.input as unknown as FakeNode).connections][0].frequency.value;
    expect(cut(near)).toBeGreaterThan(cut(far) * 4);
    bus.setListener(L(250, 0));
    expect(cut(far)).toBeGreaterThan(cut(near));
  });

  it('sets listener position, orientation and zoom attenuation', () => {
    const { ctx, listener, nodes } = makeCtx();
    const master = ctx.createGain();
    const bus = new AudioBus(ctx, master);
    bus.setListener(L(5, 6, 150));
    expect(listener.positionX.value).toBe(5);
    expect(listener.positionZ.value).toBe(6);
    expect(listener.forwardZ.value).toBe(-1);
    const zoom = nodes.find((n) => n.connections.has(master as unknown as FakeNode)) as FakeNode;
    expect(zoom.gain.value).toBeCloseTo(0.5);
    bus.setListener(L(0, 0, 100000));
    expect(zoom.gain.value).toBeCloseTo(0.12);
  });

  it('dispose disconnects every bus node and emitter', () => {
    const { ctx, nodes } = makeCtx();
    const bus = new AudioBus(ctx, ctx.createGain());
    bus.createEmitter({ category: 'bird', x: 0, y: 0, z: 0 });
    bus.createEmitter({ category: 'cat', x: 0, y: 0, z: 0 });
    bus.dispose();
    const busNodes = nodes.slice(1); // the first node is the master the test created
    expect(busNodes.length).toBeGreaterThan(CATEGORIES.length);
    expect(busNodes.every((n) => n.disconnected)).toBe(true);
    expect(bus.emitterCount).toBe(0);
  });
});

describe('VoiceBudget', () => {
  const cand = (id: number, d: number) => ({ key: id, distance: d, item: id });

  function make(max: number, hysteresis = 0.2) {
    const log: string[] = [];
    const vb = new VoiceBudget<number>({
      max,
      hysteresis,
      onAcquire: (k) => log.push(`+${k}`),
      onRelease: (k) => log.push(`-${k}`),
    });
    return { vb, log };
  }

  it('keeps the N nearest', () => {
    const { vb } = make(2);
    vb.update([cand(1, 30), cand(2, 10), cand(3, 20), cand(4, 40)]);
    expect([...vb.keys()].sort()).toEqual([2, 3]);
  });

  it('does not thrash between sources of similar distance', () => {
    const { vb, log } = make(1);
    vb.update([cand(1, 10), cand(2, 11)]);
    for (let i = 0; i < 20; i++) vb.update([cand(1, 10 + (i % 2) * 0.6), cand(2, 11 - (i % 2) * 0.6)]);
    expect(log).toEqual(['+1']);
  });

  it('swaps when a newcomer is clearly nearer', () => {
    const { vb, log } = make(1);
    vb.update([cand(1, 10), cand(2, 30)]);
    vb.update([cand(1, 10), cand(2, 5)]);
    expect(log).toEqual(['+1', '-1', '+2']);
  });

  it('releases vanished sources and fills the free slot', () => {
    const { vb, log } = make(2);
    vb.update([cand(1, 5), cand(2, 6), cand(3, 7)]);
    vb.update([cand(2, 6), cand(3, 7)]);
    expect(log).toEqual(['+1', '+2', '-1', '+3']);
  });

  it('honours maxDistance and clear', () => {
    const log: string[] = [];
    const vb = new VoiceBudget<number>({
      max: 3,
      maxDistance: 50,
      onAcquire: (k) => log.push(`+${k}`),
      onRelease: (k) => log.push(`-${k}`),
    });
    vb.update([cand(1, 10), cand(2, 80)]);
    expect(vb.has(2)).toBe(false);
    vb.clear();
    expect(log).toEqual(['+1', '-1']);
    expect(vb.size).toBe(0);
  });
});
