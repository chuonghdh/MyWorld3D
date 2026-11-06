// Hand-written fake AudioContext for audio unit tests. Records every node, every scheduled start time
// and the context clock at the time of the call, so tests can assert "never scheduled in the past".

import type { AudioFrame } from '../../src/audio/frame';
import type { ListenerState } from '../../src/audio/listener';

export class FakeParam {
  value = 1;
  setValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number) {
    this.value = v;
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

export class FakeNode {
  connections = new Set<FakeNode>();
  disconnected = false;
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  detune = new FakeParam();
  delayTime = new FakeParam();
  playbackRate = new FakeParam();
  positionX = new FakeParam();
  positionY = new FakeParam();
  positionZ = new FakeParam();
  type = '';
  loop = false;
  buffer: unknown = null;
  normalize = true;
  panningModel = '';
  distanceModel = '';
  refDistance = 0;
  maxDistance = 0;
  rolloffFactor = 0;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  onended: (() => void) | null = null;
  /** Set on a MediaStreamAudioDestinationNode only. */
  stream: { id: string } | null = null;
  constructor(readonly kind: string, private readonly ctx: FakeCtx) {}
  connect(n: FakeNode) {
    this.connections.add(n);
    return n;
  }
  /** Without an argument drops every connection (as the Web Audio call does); with one, only that edge. */
  disconnect(n?: FakeNode) {
    if (n) this.connections.delete(n);
    else this.connections.clear();
    this.disconnected = true;
  }
  start(when = 0) {
    this.startedAt = when;
    this.ctx.starts.push({ kind: this.kind, when, clock: this.ctx.currentTime, node: this });
  }
  stop(when = 0) {
    this.stoppedAt = when;
  }
}

export class FakeCtx {
  currentTime = 0;
  sampleRate = 8000;
  state = 'running';
  nodes: FakeNode[] = [];
  starts: { kind: string; when: number; clock: number; node: FakeNode }[] = [];
  listener = {
    positionX: new FakeParam(), positionY: new FakeParam(), positionZ: new FakeParam(),
    forwardX: new FakeParam(), forwardY: new FakeParam(), forwardZ: new FakeParam(),
    upX: new FakeParam(), upY: new FakeParam(), upZ: new FakeParam(),
  };
  private make(kind: string) {
    return () => {
      const n = new FakeNode(kind, this);
      this.nodes.push(n);
      return n;
    };
  }
  createGain = this.make('gain');
  createBiquadFilter = this.make('biquad');
  createPanner = this.make('panner');
  createOscillator = this.make('osc');
  createBufferSource = this.make('bufsrc');
  createConvolver = this.make('convolver');
  createDelay = this.make('delay');
  createDynamicsCompressor = this.make('compressor');
  createMediaStreamDestination = () => {
    const n = new FakeNode('mediastream', this);
    n.stream = { id: `fake-stream-${this.nodes.length}` };
    this.nodes.push(n);
    return n;
  };
  createBuffer(channels: number, length: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, numberOfChannels: channels, getChannelData: (c: number) => data[c] };
  }
  /** Started one-shot sources (not loops). */
  started(kind: string): number {
    return this.starts.filter((s) => s.kind === kind && !s.node.loop).length;
  }
  get audio(): AudioContext {
    return this as unknown as AudioContext;
  }
}

export const listenerAt = (x: number, z: number, height = 1.7): ListenerState => ({
  x, y: 2, z, forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 }, height,
});

export function makeFrame(over: Partial<AudioFrame> = {}): AudioFrame {
  return {
    dt: 1 / 60,
    listener: listenerAt(0, 0),
    timeOfDay: 12,
    season: 'summer',
    windSpeed: 2,
    gust: 0,
    rain: 0,
    night: false,
    vehicles: [],
    pedestrians: [],
    trees: [],
    church: null,
    lifeEvents: [],
    thunder: [],
    horns: [],
    musicEnabled: false,
    ...over,
  };
}
