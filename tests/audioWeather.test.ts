import { describe, expect, it } from 'vitest';
import { AudioBus } from '../src/audio/bus';
import {
  THUNDER_HEIGHT, THUNDER_MAX_PLACE_DISTANCE, crackAmount, createThunderSounds, thunderCharacter,
  thunderPosition,
} from '../src/audio/weather';
import { createRandom } from '../src/audio/synth';
import { FakeCtx, makeFrame, listenerAt } from './helpers/fakeAudio';

function setup() {
  const fc = new FakeCtx();
  const bus = new AudioBus(fc.audio, fc.audio.createGain());
  return { fc, bus };
}

describe('thunder placement', () => {
  it('uses cos for x, sin for z, clamps distance to 450 m and sits 60 m up', () => {
    const p = thunderPosition({ x: 10, z: -5 }, 0, 200);
    expect(p).toEqual({ x: 210, y: THUNDER_HEIGHT, z: -5 });
    const q = thunderPosition({ x: 0, z: 0 }, Math.PI / 2, 5000);
    expect(q.x).toBeCloseTo(0);
    expect(q.z).toBeCloseTo(THUNDER_MAX_PLACE_DISTANCE);
  });

  it('crack exists only for near strikes', () => {
    expect(crackAmount(100)).toBeGreaterThan(0.8);
    expect(crackAmount(3000)).toBe(0);
    expect(thunderCharacter(100, 1).cutoff).toBeGreaterThan(thunderCharacter(4000, 1).cutoff);
  });
});

describe('thunder sounds', () => {
  it('creates one positional emitter in the strike direction and distance, then frees it', () => {
    const { fc, bus } = setup();
    const sys = createThunderSounds(fc.audio, bus, createRandom(1));
    fc.currentTime = 5;
    const angle = Math.PI / 3;
    sys.update(makeFrame({ listener: listenerAt(20, 30), thunder: [{ angle, distance: 300, strength: 0.8 }] }));
    expect(bus.emitterCount).toBe(1);
    expect(sys.active).toBe(1);
    const panner = fc.nodes.find((n) => n.kind === 'panner')!;
    expect(panner.positionX.value).toBeCloseTo(20 + Math.cos(angle) * 300);
    expect(panner.positionZ.value).toBeCloseTo(30 + Math.sin(angle) * 300);
    expect(panner.positionY.value).toBe(60);
    for (const s of fc.starts) expect(s.when).toBeGreaterThanOrEqual(s.clock);
    expect([...panner.connections][0]).toBe(bus.category('thunder') as unknown as typeof panner);

    fc.currentTime = 5 + 30;
    sys.update(makeFrame());
    expect(bus.emitterCount).toBe(0);
    expect(sys.active).toBe(0);
  });

  it('distant claps are placed at 450 m and have no crack; near claps do', () => {
    const near = setup();
    const sn = createThunderSounds(near.fc.audio, near.bus, createRandom(1));
    sn.update(makeFrame({ thunder: [{ angle: 0, distance: 80, strength: 1 }] }));
    const far = setup();
    const sf = createThunderSounds(far.fc.audio, far.bus, createRandom(1));
    sf.update(makeFrame({ thunder: [{ angle: 0, distance: 3000, strength: 1 }] }));
    expect(near.fc.starts.length).toBe(far.fc.starts.length + 1);
    expect(far.fc.nodes.find((n) => n.kind === 'panner')!.positionX.value).toBeCloseTo(450);
  });

  it('ignores non-finite thunder input', () => {
    const { fc, bus } = setup();
    const sys = createThunderSounds(fc.audio, bus, createRandom(1));
    sys.update(makeFrame({ thunder: [{ angle: NaN, distance: 10, strength: 1 }] }));
    expect(bus.emitterCount).toBe(0);
    sys.update(makeFrame({ thunder: [{ angle: 0, distance: 500, strength: 0.7 }] }));
    expect(bus.emitterCount).toBe(1);
    sys.dispose();
    expect(bus.emitterCount).toBe(0);
  });
});
