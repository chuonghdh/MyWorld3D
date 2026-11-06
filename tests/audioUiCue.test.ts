import { afterEach, describe, expect, it } from 'vitest';
import { playUiCue, uiCueAllowed, uiCueDurationS, uiCueParams } from '../src/audio/uiCue';
import * as audio from '../src/audio';
import { audio as audioTuning } from '../src/config/tuning';
import { createRandom } from '../src/audio/synth';
import { FakeCtx, FakeParam } from './helpers/fakeAudio';

class LiveFakeCtx extends FakeCtx {
  destination = { kind: 'destination' };
  createDynamicsCompressor = () => {
    const n = this.createGain();
    (n as { kind: string }).kind = 'compressor';
    return Object.assign(n, {
      threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam(),
    });
  };
  close() {
    return Promise.resolve();
  }
  resume() {
    return Promise.resolve();
  }
}

let last: LiveFakeCtx | null = null;
function installWindow() {
  (globalThis as { window?: unknown }).window = {
    AudioContext: class extends LiveFakeCtx {
      constructor() {
        super();
        last = this as LiveFakeCtx;
      }
    },
  };
}

afterEach(() => {
  if ((globalThis as { window?: unknown }).window) audio.dispose();
  audio.setSoundEnabled(true);
  delete (globalThis as { window?: unknown }).window;
  last = null;
});

describe('uiCueParams', () => {
  const gaps = (ts: number[]) => ts.slice(1).map((t, i) => t - (ts[i] ?? 0));

  it('is a ratchet train of the configured length, soft envelopes, latch on close', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const o = uiCueParams('open', createRandom(seed));
      const c = uiCueParams('close', createRandom(seed));
      for (const p of [o, c]) {
        expect(p.ticks.length).toBe(audioTuning.uiCueTicks);
        expect(p.ticks[p.ticks.length - 1]!.t).toBeCloseTo(audioTuning.uiCueDurationS, 6);
        const d = uiCueDurationS(p);
        expect(d).toBeGreaterThan(0.22);
        expect(d).toBeLessThan(0.4);
        expect(p.ticks.every((t, i) => i === 0 || t.t > p.ticks[i - 1]!.t)).toBe(true);
        for (const t of p.ticks) {
          expect(t.attackS).toBeGreaterThanOrEqual(0.001);
          expect(t.attackS).toBeLessThanOrEqual(0.003);
          expect(t.decayS).toBeGreaterThanOrEqual(0.01);
          expect(t.decayS).toBeLessThanOrEqual(0.04);
          expect(t.partials.length).toBe(3);
          expect(Math.max(...t.partials.map((x) => x.hz))).toBeLessThan(3600);
          expect(Math.min(...t.partials.map((x) => x.hz))).toBeGreaterThan(250);
        }
        // Grind is a quiet low bed.
        expect(Math.max(p.rumble!.fromHz, p.rumble!.toHz)).toBeLessThan(300);
        expect(p.rumble!.gain).toBeLessThan(p.ticks[0]!.gain);
      }
      // Open speeds up and climbs, close slows down and drops.
      const og = gaps(o.ticks.map((t) => t.t));
      const cg = gaps(c.ticks.map((t) => t.t));
      expect(og[og.length - 1]!).toBeLessThan(og[0]!);
      expect(cg[cg.length - 1]!).toBeGreaterThan(cg[0]!);
      expect(o.ticks[o.ticks.length - 1]!.partials[0]!.hz).toBeGreaterThan(o.ticks[0]!.partials[0]!.hz);
      expect(c.ticks[c.ticks.length - 2]!.partials[0]!.hz).toBeLessThan(c.ticks[0]!.partials[0]!.hz);
      // Close ends on a lower latch knock with a longer decay.
      const latch = c.ticks[c.ticks.length - 1]!;
      expect(latch.partials[2]!.hz).toBeLessThan(c.ticks[0]!.partials[2]!.hz);
      expect(latch.decayS).toBeGreaterThan(0.022);
    }
  });

  it('tick is one soft short tick with no grind and small pitch jitter', () => {
    const train = uiCueParams('open', createRandom(4));
    const hz: number[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const p = uiCueParams('tick', createRandom(seed));
      expect(p.ticks.length).toBe(1);
      expect(p.rumble).toBeNull();
      const d = uiCueDurationS(p);
      expect(d).toBeGreaterThan(0.015);
      expect(d).toBeLessThan(0.03);
      expect(p.ticks[0]!.gain).toBeLessThan(train.ticks[0]!.gain * 1.2 * audioTuning.uiCueTickLevel);
      expect(p.ticks[0]!.gain).toBeLessThan(0.55);
      hz.push(p.ticks[0]!.partials[0]!.hz);
    }
    expect(Math.min(...hz)).toBeGreaterThan(2350 * 0.94);
    expect(Math.max(...hz)).toBeLessThan(2350 * 1.06);
    expect(new Set(hz).size).toBeGreaterThan(1);
  });

  it('tick schedules exactly one impulse', () => {
    const ctx = new FakeCtx();
    playUiCue(ctx.audio, ctx.createGain() as unknown as AudioNode, uiCueParams('tick', createRandom(1)), 0);
    expect(ctx.started('bufsrc')).toBe(1);
  });

  it('honours a custom shape', () => {
    const p = uiCueParams('open', createRandom(2), { ticks: 9, durationS: 0.3 });
    expect(p.ticks.length).toBe(9);
    expect(p.ticks[8]!.t).toBeCloseTo(0.3, 6);
  });

  it('varies between repeats', () => {
    const rand = createRandom(7);
    const a = uiCueParams('open', rand);
    const b = uiCueParams('open', rand);
    expect(a.ticks[1]!.t).not.toBe(b.ticks[1]!.t);
    expect(a.ticks[0]!.partials[0]!.hz).not.toBe(b.ticks[0]!.partials[0]!.hz);
  });

  it('rate limit drops repeats inside the gap', () => {
    expect(uiCueAllowed(1, -Infinity, 0.06)).toBe(true);
    expect(uiCueAllowed(1.03, 1, 0.06)).toBe(false);
    expect(uiCueAllowed(1.07, 1, 0.06)).toBe(true);
  });

  it('schedules one grind bed and one impulse per tick, never before the cue start', () => {
    const ctx = new FakeCtx();
    const dest = ctx.createGain();
    const p = uiCueParams('open', createRandom(3));
    playUiCue(ctx.audio, dest as unknown as AudioNode, p, 0.5);
    expect(ctx.started('bufsrc')).toBe(p.ticks.length + 1);
    expect(ctx.started('osc')).toBe(0);
    expect(ctx.starts.every((s) => s.when >= 0.5)).toBe(true);
  });
});

describe('uiCue facade', () => {
  it('is a no-op before init and never throws', () => {
    expect(() => audio.uiCue('open')).not.toThrow();
    expect(() => audio.uiCue('close')).not.toThrow();
  });

  it('plays after init, outside the master and limiter, at the configured level', () => {
    installWindow();
    expect(audio.init()).toBe(true);
    const ctx = last!;
    const before = ctx.started('bufsrc');
    audio.uiCue('open');
    expect(ctx.started('bufsrc')).toBeGreaterThan(before);
    const out = ctx.nodes.find((n) => n.kind === 'gain' && n.connections.has(ctx.destination as never));
    expect(out).toBeDefined();
    const v = audio.getGroupVolumes();
    expect(out!.gain.value).toBeCloseTo(audioTuning.uiCueLevel * v.master * v.groups.effects, 6);
  });

  it('is silent with the Sound switch off', () => {
    installWindow();
    audio.init();
    const ctx = last!;
    audio.setSoundEnabled(false);
    const before = ctx.starts.length;
    audio.uiCue('open');
    audio.uiCue('close');
    expect(ctx.starts.length).toBe(before);
  });

  it('drops a second cue inside the minimum gap', () => {
    installWindow();
    audio.init();
    const ctx = last!;
    ctx.currentTime = 10;
    const before = ctx.started('bufsrc');
    audio.uiCue('open');
    ctx.currentTime = 10 + audioTuning.uiCueMinGapS / 2;
    audio.uiCue('close');
    expect(ctx.started('bufsrc')).toBe(before + audioTuning.uiCueTicks + 1);
    ctx.currentTime = 10 + audioTuning.uiCueMinGapS * 1.5;
    audio.uiCue('close');
    expect(ctx.started('bufsrc')).toBe(before + 2 * (audioTuning.uiCueTicks + 1));
  });
});
