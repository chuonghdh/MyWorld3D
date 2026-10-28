import { describe, expect, it } from 'vitest';
import { AudioBus } from '../src/audio/bus';
import {
  MAX_DROP_EMITTERS, activeEmitterCount, createRainSounds, createRainSystem, dropRadius, dropRatePerEmitter,
  pickSurface, surfaceWeights, totalDropRate,
} from '../src/audio/rain';
import { createRandom } from '../src/audio/synth';
import { FakeCtx, makeFrame, listenerAt } from './helpers/fakeAudio';

function setup() {
  const fc = new FakeCtx();
  const bus = new AudioBus(fc.audio, fc.audio.createGain());
  return { fc, bus };
}

function run(fc: FakeCtx, sys: { update(f: ReturnType<typeof makeFrame>): void }, rain: number, seconds: number, x = 0, z = 0) {
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) {
    fc.currentTime += dt;
    sys.update(makeFrame({ rain, dt, listener: listenerAt(x, z) }));
  }
}

describe('rain parameters', () => {
  it('scales emitters and rate with rain', () => {
    expect(activeEmitterCount(0)).toBe(0);
    expect(activeEmitterCount(0.05)).toBe(0);
    expect(activeEmitterCount(0.1)).toBeGreaterThanOrEqual(3);
    expect(activeEmitterCount(1)).toBe(MAX_DROP_EMITTERS);
    expect(dropRatePerEmitter(1)).toBeGreaterThan(dropRatePerEmitter(0.2) * 4);
    expect(totalDropRate(1)).toBeGreaterThan(totalDropRate(0.15) * 10);
  });

  it('places drops 3..60 m away, more of them near, puddles only after some rain', () => {
    expect(dropRadius(0)).toBe(3);
    expect(dropRadius(1)).toBe(60);
    expect(dropRadius(0.5)).toBeLessThan(30);
    expect(surfaceWeights(0.1).puddle).toBe(0);
    expect(surfaceWeights(0.6).puddle).toBeGreaterThan(0);
    const w = surfaceWeights(0.6);
    expect(w.tin + w.puddle).toBeCloseTo(1);
    expect(w.tin).toBeGreaterThan(0.75); // it is mostly the tin roof
    expect(surfaceWeights(0.1)).toEqual({ tin: 1, puddle: 0 });
    expect(pickSurface(0.6, 0)).toBe('tin');
    expect(pickSurface(0.6, 0.999)).toBe('puddle');
  });
});

describe('RainSounds', () => {
  it('creates no emitters and no sources when it is not raining', () => {
    const { fc, bus } = setup();
    const sys = createRainSystem(fc.audio, bus, createRandom(1));
    run(fc, sys, 0, 2);
    expect(bus.emitterCount).toBe(0);
    expect(fc.starts.length).toBe(0);
  });

  it('density of drop events grows with rain intensity', () => {
    const counts: number[] = [];
    for (const rain of [0.15, 0.5, 1]) {
      const { fc, bus } = setup();
      const sys = createRainSystem(fc.audio, bus, createRandom(7));
      run(fc, sys, rain, 6);
      counts.push(fc.started('bufsrc') + fc.started('osc'));
    }
    expect(counts[0]).toBeGreaterThan(5);
    expect(counts[1]).toBeGreaterThan(counts[0] * 2);
    expect(counts[2]).toBeGreaterThan(counts[1] * 1.5);
  });

  it('never exceeds 10 drop emitters, keeps them within 60 m of the listener and schedules ahead only', () => {
    const { fc, bus } = setup();
    const sys = createRainSystem(fc.audio, bus, createRandom(3));
    run(fc, sys, 1, 3, 100, -40);
    expect(sys.dropEmitters).toBe(MAX_DROP_EMITTERS);
    expect(sys.bedEmitters).toBeGreaterThan(0);
    expect(bus.emitterCount).toBe(MAX_DROP_EMITTERS + sys.bedEmitters);
    const panners = fc.nodes.filter((n) => n.kind === 'panner');
    let drops = 0;
    for (const p of panners) {
      const d = Math.hypot(p.positionX.value - 100, p.positionZ.value + 40);
      if (p.refDistance === 4) {
        drops++;
        expect(d).toBeLessThanOrEqual(60.01);
        expect(d).toBeGreaterThanOrEqual(2.99);
      }
    }
    expect(drops).toBe(MAX_DROP_EMITTERS);
    for (const s of fc.starts.filter((x) => !x.node.loop)) expect(s.when).toBeGreaterThanOrEqual(s.clock - 1e-9);
  });

  it('removes every emitter shortly after the rain stops, and on dispose', () => {
    const { fc, bus } = setup();
    const sys = createRainSystem(fc.audio, bus, createRandom(5));
    run(fc, sys, 0.8, 2);
    expect(bus.emitterCount).toBeGreaterThan(0);
    run(fc, sys, 0, 1);
    expect(bus.emitterCount).toBe(0);
    run(fc, sys, 0.8, 1);
    expect(bus.emitterCount).toBeGreaterThan(0);
    sys.dispose();
    expect(bus.emitterCount).toBe(0);
  });

  it('the registered factory also hosts thunder', () => {
    const { fc, bus } = setup();
    const sys = createRainSounds(fc.audio, bus);
    fc.currentTime = 1;
    sys.update(makeFrame({ thunder: [{ angle: 0, distance: 200, strength: 1 }] }));
    expect(bus.emitterCount).toBe(1);
    sys.dispose();
    expect(bus.emitterCount).toBe(0);
  });
});
