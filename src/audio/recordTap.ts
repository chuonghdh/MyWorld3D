// Record tap: a MediaStreamAudioDestinationNode fed from the limiter output, so a recording gets exactly the
// mix that is played (master, group and category sliders, Sound and Music switches, limiter). It is created
// lazily on the first getRecordStream() call, so with nothing recording the playback graph is untouched.

export interface RecordTap {
  /** Live audio stream of the mix; its track ends when the tap is disposed. */
  readonly stream: MediaStream;
  dispose(): void;
}

/**
 * Connects `source` (the limiter) to a new MediaStreamAudioDestinationNode. The existing connection to the
 * speakers stays as it is. Returns null when the browser has no MediaStream destination support.
 */
export function createRecordTap(ctx: AudioContext, source: AudioNode): RecordTap | null {
  if (typeof ctx.createMediaStreamDestination !== 'function') return null;
  const dest = ctx.createMediaStreamDestination();
  source.connect(dest);
  return {
    stream: dest.stream,
    dispose() {
      try {
        source.disconnect(dest);
      } catch {
        // Already disconnected (context closed or source disposed): nothing to undo.
      }
      dest.disconnect();
    },
  };
}
