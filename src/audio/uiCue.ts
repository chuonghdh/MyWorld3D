// Interface cues: a soft clockwork ratchet when a panel or section opens (winding) or closes (unwinding).
// Procedural, no files: each tick is a short noise impulse through resonant bandpasses (two small metal gear
// partials and a low brass/wood knock), over a faint filtered-noise gear grind. The facade (index.ts uiCue)
// routes it straight to the speakers, outside master -> limiter -> record tap, so it never reaches a film.

import { makeNoiseBuffer, playNoiseBurst, randRange } from './synth';
import { audio as audioTuning } from '../config/tuning';

/** open/close: ratchet train for a panel or section; tick: one soft tick (switching house or block). */
export type UiCueKind = 'open' | 'close' | 'tick';

export interface UiCuePartial {
  hz: number;
  q: number;
  gain: number;
}

export interface UiCueTick {
  /** Offset from the cue start (s). */
  t: number;
  attackS: number;
  decayS: number;
  gain: number;
  partials: UiCuePartial[];
}

export interface UiCueParams {
  ticks: UiCueTick[];
  /** Gear grind under the train; null for a single tick. */
  rumble: { fromHz: number; toHz: number; q: number; attackS: number; decayS: number; gain: number } | null;
}

export interface UiCueShape {
  /** Ratchet ticks per cue. */
  ticks: number;
  /** Time from the first tick to the last tick (s). */
  durationS: number;
}

// Sound design constants (not knobs): tick count and length live in config (audio.uiCueTicks, uiCueDurationS).
/** Gear partials (Hz, Q, gain): two small metal resonances and a low brass/wood knock. */
const PARTIALS: readonly UiCuePartial[] = [
  { hz: 2350, q: 14, gain: 2.2 },
  { hz: 3000, q: 18, gain: 1.1 },
  { hz: 460, q: 5, gain: 1.6 },
];
const TICK_ATTACK_S = 0.0015;
const TICK_DECAY_S = 0.016;
const TICK_GAIN = 0.55;
/** Each gap is this ratio of the previous: below 1 speeds up (open, winding), above 1 slows down (close). */
const OPEN_GAP_RATIO = 0.86;
const CLOSE_GAP_RATIO = 1 / 0.86;
/** Pitch step per tick: open climbs, close drops. */
const OPEN_PITCH_STEP = 0.025;
const CLOSE_PITCH_STEP = -0.025;
/** Close ends on a softer, lower latch click: knock and decay scale, metal partials damped. */
const LATCH = { knockHz: 330, knockGain: 2.2, metalGain: 0.45, decayS: 0.03, gain: 0.8 };
/** Per-tick jitter: gaps +-10 %, partial pitch +-3 %, level +-18 %, decay +-20 %. */
const JITTER_GAP = 0.1;
const JITTER_HZ = 0.03;
const JITTER_GAIN = 0.18;
const JITTER_DECAY = 0.2;
/** Faint gear grind under the ticks: brown noise through a low bandpass that drifts with the pitch steps. */
const RUMBLE = { lowHz: 150, highHz: 230, q: 0.9, attackS: 0.04, tailS: 0.06, gain: 0.22 };

/** Single tick: decay (s, gives a 20-30 ms tick with the attack and ring) and pitch jitter (+-4 %). */
const SINGLE_DECAY_S = 0.02;
const SINGLE_JITTER_HZ = 0.04;

function defaultShape(): UiCueShape {
  return { ticks: audioTuning.uiCueTicks, durationS: audioTuning.uiCueDurationS };
}

/** Tick times, envelopes and partials of one cue, with mechanical jitter so repeats differ. Pure. */
export function uiCueParams(kind: UiCueKind, rand: () => number = Math.random, shape: UiCueShape = defaultShape()): UiCueParams {
  if (kind === 'tick') return singleTickParams(rand);
  const open = kind === 'open';
  const n = Math.max(2, Math.round(shape.ticks));
  const ratio = open ? OPEN_GAP_RATIO : CLOSE_GAP_RATIO;
  const step = open ? OPEN_PITCH_STEP : CLOSE_PITCH_STEP;
  const j = (spread: number) => randRange(rand, 1 - spread, 1 + spread);

  // Geometric gaps, jittered, then scaled so the last tick lands at durationS.
  const gaps: number[] = [];
  for (let i = 0; i < n - 1; i++) gaps.push(ratio ** i * j(JITTER_GAP));
  const sum = gaps.reduce((a, b) => a + b, 0);
  const scale = Math.max(0, shape.durationS) / sum;

  const ticks: UiCueTick[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) t += (gaps[i - 1] ?? 0) * scale;
    const pitch = 1 + step * i;
    const latch = !open && i === n - 1;
    const partials = PARTIALS.map((p, k) => {
      const knock = k === PARTIALS.length - 1;
      const hz = latch && knock ? LATCH.knockHz : p.hz * pitch;
      const gain = !latch ? p.gain : knock ? LATCH.knockGain : p.gain * LATCH.metalGain;
      return { hz: hz * j(JITTER_HZ), q: p.q, gain: gain * j(JITTER_GAIN) };
    });
    ticks.push({
      t,
      attackS: TICK_ATTACK_S,
      decayS: (latch ? LATCH.decayS : TICK_DECAY_S) * j(JITTER_DECAY),
      gain: TICK_GAIN * (latch ? LATCH.gain : 1) * j(JITTER_GAIN),
      partials,
    });
  }

  return {
    ticks,
    rumble: {
      fromHz: open ? RUMBLE.lowHz : RUMBLE.highHz,
      toHz: open ? RUMBLE.highHz : RUMBLE.lowHz,
      q: RUMBLE.q,
      attackS: RUMBLE.attackS,
      decayS: t + RUMBLE.tailS,
      gain: RUMBLE.gain * j(JITTER_GAIN),
    },
  };
}

/** One soft ratchet tick, `audio.uiCueTickLevel` of a train tick, no grind. Pure. */
function singleTickParams(rand: () => number): UiCueParams {
  const j = (spread: number) => randRange(rand, 1 - spread, 1 + spread);
  const pitch = j(SINGLE_JITTER_HZ);
  return {
    ticks: [
      {
        t: 0,
        attackS: TICK_ATTACK_S,
        decayS: SINGLE_DECAY_S * j(JITTER_DECAY / 2),
        gain: TICK_GAIN * audioTuning.uiCueTickLevel * j(JITTER_GAIN / 2),
        partials: PARTIALS.map((p) => ({ hz: p.hz * pitch * j(JITTER_HZ / 2), q: p.q, gain: p.gain * j(JITTER_GAIN) })),
      },
    ],
    rumble: null,
  };
}

/** Total length of a cue in seconds (until the last envelope reaches zero). */
export function uiCueDurationS(p: UiCueParams): number {
  const last = p.ticks[p.ticks.length - 1];
  const tickEnd = last ? last.t + last.attackS + last.decayS : 0;
  return Math.max(tickEnd, p.rumble ? p.rumble.attackS + p.rumble.decayS : 0);
}

/** True when a cue at `now` is far enough from the previous one (`last`, -Infinity for none). */
export function uiCueAllowed(now: number, last: number, minGapS: number): boolean {
  return !(now - last < minGapS);
}

/** Margin after a tick envelope ends before its nodes stop, so the resonators ring out (s). */
const RING_S = 0.03;

function playTick(ctx: BaseAudioContext, dest: AudioNode, tick: UiCueTick, when: number): void {
  const t = when + tick.t;
  const end = t + tick.attackS + tick.decayS;
  const src = ctx.createBufferSource();
  src.buffer = makeNoiseBuffer(ctx, 1, 'white');
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(tick.gain, t + tick.attackS);
  env.gain.linearRampToValueAtTime(0, end);
  src.connect(env);
  const nodes: AudioNode[] = [src, env];
  for (const p of tick.partials) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = p.hz;
    bp.Q.value = p.q;
    const g = ctx.createGain();
    g.gain.value = p.gain;
    env.connect(bp);
    bp.connect(g);
    g.connect(dest);
    nodes.push(bp, g);
  }
  src.start(t, Math.random() * 0.5);
  src.stop(end + RING_S);
  src.onended = () => {
    for (const n of nodes) n.disconnect();
  };
}

/** Schedules one cue on `dest`. Every node disconnects itself when it ends. */
export function playUiCue(ctx: BaseAudioContext, dest: AudioNode, p: UiCueParams, when = ctx.currentTime): void {
  if (p.rumble) playNoiseBurst(ctx, dest, {
    kind: 'brown',
    when,
    attack: p.rumble.attackS,
    decay: p.rumble.decayS,
    gain: p.rumble.gain,
    filter: { type: 'bandpass', frequency: p.rumble.fromHz, frequencyEnd: p.rumble.toHz, q: p.rumble.q },
  });
  for (const tick of p.ticks) playTick(ctx, dest, tick, when);
}
