// Master -> limiter -> destination. Shared by the live context (index.ts init) and the offline film render
// (offlineRender.ts), so both mixes have the same final stage.

export interface MixChain {
  /** Sources and the bus feed this node. */
  master: GainNode;
  /** Tap point for the record stream (after the limiter). */
  limiter: DynamicsCompressorNode;
}

export function createMixChain(ctx: BaseAudioContext): MixChain {
  const master = ctx.createGain();
  // A limiter between master and speakers: loud moments (thunder over a storm) compress instead of clipping.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -9;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter);
  limiter.connect(ctx.destination);
  return { master, limiter };
}
