import { describe, expect, it } from 'vitest';
import { createRecordTap } from '../src/audio/recordTap';
import { getRecordStream } from '../src/audio';
import { FakeCtx } from './helpers/fakeAudio';

function setup() {
  const ctx = new FakeCtx();
  const limiter = ctx.createDynamicsCompressor();
  const speakers = ctx.createGain();
  limiter.connect(speakers);
  return { ctx, limiter, speakers };
}

describe('record tap', () => {
  it('taps the limiter output and keeps the speaker connection', () => {
    const { ctx, limiter, speakers } = setup();
    const tap = createRecordTap(ctx.audio, limiter as unknown as AudioNode);
    expect(tap).not.toBeNull();
    const dest = ctx.nodes.find((n) => n.kind === 'mediastream');
    expect(dest).toBeDefined();
    expect(limiter.connections.has(dest!)).toBe(true);
    expect(limiter.connections.has(speakers)).toBe(true);
    expect(tap!.stream).toBe(dest!.stream);
  });

  it('dispose removes only the tap edge and disconnects the destination', () => {
    const { ctx, limiter, speakers } = setup();
    const tap = createRecordTap(ctx.audio, limiter as unknown as AudioNode)!;
    const dest = ctx.nodes.find((n) => n.kind === 'mediastream')!;
    tap.dispose();
    expect(limiter.connections.has(dest)).toBe(false);
    expect(limiter.connections.has(speakers)).toBe(true);
    expect(dest.disconnected).toBe(true);
  });

  it('returns null when the browser has no MediaStream destination', () => {
    const { ctx, limiter } = setup();
    (ctx as unknown as { createMediaStreamDestination?: unknown }).createMediaStreamDestination = undefined;
    expect(createRecordTap(ctx.audio, limiter as unknown as AudioNode)).toBeNull();
  });

  it('getRecordStream is null before init', () => {
    expect(getRecordStream()).toBeNull();
  });
});
