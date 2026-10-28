import { describe, expect, it } from 'vitest';
import { AudioBus, CATEGORIES, CATEGORY_GROUP } from '../src/audio/bus';
import type { AudioAircraft } from '../src/audio/frame';
import { quietFrame } from '../src/audio';
import {
  AIRCRAFT_MAX_VOICES,
  FADE_IN_S,
  FADE_OUT_S,
  createAircraftSounds,
  jetDoppler,
} from '../src/audio/aircraft';
import { SOUND_ROWS } from '../src/ui/SoundMixer';
import { FakeCtx, listenerAt, makeFrame } from './helpers/fakeAudio';

const plane = (id: number, x: number, vx = 60, z = 0): AudioAircraft => ({ id, x, y: 250, z, vx, vy: 0, vz: 0 });

function setup() {
  const ctx = new FakeCtx();
  const master = ctx.createGain();
  const bus = new AudioBus(ctx.audio, master as unknown as GainNode);
  const sys = createAircraftSounds(ctx.audio, bus);
  return { ctx, bus, sys };
}

describe('aircraft sound', () => {
  it('registers an aircraft category in the effects group with a mixer slider', () => {
    expect(CATEGORIES).toContain('aircraft');
    expect(CATEGORY_GROUP.aircraft).toBe('effects');
    const row = SOUND_ROWS.find((r) => r.category === 'aircraft');
    expect(row?.group).toBe('Effects');
    expect(row?.label).toBe('Aircraft');
  });

  it('computes a Doppler shift from the radial speed', () => {
    const l = { x: 0, y: 2, z: 0 };
    // Approaching along the line of sight: higher; receding: lower; crossing overhead: unity.
    expect(jetDoppler(l, { x: 500, y: 2, z: 0, vx: -80, vy: 0, vz: 0 })).toBeGreaterThan(1.1);
    expect(jetDoppler(l, { x: 500, y: 2, z: 0, vx: 80, vy: 0, vz: 0 })).toBeLessThan(0.9);
    expect(jetDoppler(l, { x: 0, y: 250, z: 0, vx: 80, vy: 0, vz: 0 })).toBeCloseTo(1, 5);
    for (const vx of [-5000, 5000]) {
      const r = jetDoppler(l, { x: 500, y: 2, z: 0, vx, vy: 0, vz: 0 });
      expect(r).toBeGreaterThanOrEqual(0.85);
      expect(r).toBeLessThanOrEqual(1.15);
    }
  });

  it('creates one emitter per aircraft, with a long distance model, and releases it after the fade', () => {
    const { ctx, bus, sys } = setup();
    expect(bus.emitterCount).toBe(0);
    sys.update(makeFrame({ aircraft: [plane(1, 600)] }));
    expect(bus.emitterCount).toBe(1);
    const panner = ctx.nodes.find((n) => n.kind === 'panner');
    expect(panner?.refDistance).toBeGreaterThanOrEqual(200);
    expect(panner?.maxDistance).toBeGreaterThanOrEqual(1000);
    // The plane leaves: the voice fades out, then everything is disposed.
    for (let t = 0; t < FADE_OUT_S + 1; t += 0.25) sys.update(makeFrame({ dt: 0.25, aircraft: [] }));
    expect(bus.emitterCount).toBe(0);
    sys.dispose();
  });

  it('fades in without a jump and never exceeds two voices', () => {
    const { ctx, bus, sys } = setup();
    sys.update(makeFrame({ dt: 0.5, aircraft: [plane(1, 500)] }));
    const outs = ctx.nodes.filter((n) => n.kind === 'gain' && n.connections.size >= 1);
    expect(outs.length).toBeGreaterThan(0);
    sys.update(makeFrame({ dt: 0.5, aircraft: [plane(1, 500), plane(2, 800), plane(3, 300, 60, 100), plane(4, 900)] }));
    expect(bus.emitterCount).toBeLessThanOrEqual(AIRCRAFT_MAX_VOICES);
    expect(AIRCRAFT_MAX_VOICES).toBe(2);
    expect(FADE_IN_S).toBeGreaterThan(1);
    sys.dispose();
    expect(bus.emitterCount).toBe(0);
  });

  it('does nothing while time is frozen (dt = 0) and starts no sources', () => {
    const { ctx, bus, sys } = setup();
    sys.update(makeFrame({ dt: 0, aircraft: [plane(1, 500)] }));
    expect(bus.emitterCount).toBe(0);
    expect(ctx.starts.length).toBe(0);
    // Without an aircraft list at all (older frames) it is also silent.
    sys.update(makeFrame({ dt: 0.1 }));
    expect(bus.emitterCount).toBe(0);
  });

  it('moves the emitter with the plane', () => {
    const { ctx, sys } = setup();
    sys.update(makeFrame({ dt: 0.1, aircraft: [plane(7, 400)] }));
    const panner = ctx.nodes.find((n) => n.kind === 'panner');
    expect(panner?.positionX.value).toBe(400);
    sys.update(makeFrame({ dt: 0.1, aircraft: [plane(7, 460)] }));
    expect(panner?.positionX.value).toBe(460);
    expect(panner?.positionY.value).toBe(250);
    sys.dispose();
  });

  it('is still heard from the aerial overview (quietFrame keeps the aircraft)', () => {
    const list = [plane(1, 300)];
    const frame = makeFrame({ listener: listenerAt(0, 0, 400), aircraft: list });
    const q = quietFrame(frame);
    expect(q.aircraft).toBe(list);
    expect(q.vehicles.length).toBe(0);
  });
});
