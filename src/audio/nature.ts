// Nature sounds: occasional leaf rustles on the nearest street trees (one short burst about every 10 s,
// loudness by wind: never a constant background hiss), occasional wind whistles, crickets on warm
// nights and the church bell on the hour. Each sound is a separate positional source with its own node
// chain and Emitter (no shared mixed loop). See docs/AUDIO.md.
//
// Synthesised from acoustics knowledge, not yet judged by ear (see the tuning constants below).
//
// Church bell trigger rule (see shouldStrike): the bell rings only when the clock hour advances by exactly
// one in a single frame, that frame's forward step is at most BELL_MAX_STEP_H clock hours, the implied clock
// speed is at most BELL_MAX_RATE_H_PER_S clock hours per real second, and a previous frame exists. Dragging
// the time slider jumps the clock by more than the step limit, so it stays silent; so does the first frame
// and any backwards step.

import type { AudioBus, Emitter } from './bus';
import type { AudioFrame, SoundSystem, SoundSystemFactory } from './frame';
import type { Season } from '../core/types';
import { clamp01 } from './math';
import { createRandom, makeNoiseBuffer, playNoiseBurst, randRange } from './synth';

// ---------------------------------------------------------------------------------------------
// Tunable constants
// ---------------------------------------------------------------------------------------------
/** A rustle is one short burst, not a loop: about every 8-12 s, on 3 of the 5 nearest trees, only in a breeze. */
export const RUSTLE_INTERVAL_MIN_S = 8;
export const RUSTLE_INTERVAL_MAX_S = 12;
export const RUSTLE_MIN_WIND = 1.5;
export const RUSTLE_TREES = 3;
export const RUSTLE_NEAREST = 5;
export const RUSTLE_DURATION_MIN_S = 1.6;
export const RUSTLE_DURATION_MAX_S = 3.4;
/** How far away (m) a tree can still rustle. */
export const RUSTLE_RANGE_M = 70;
/** Output scale of one rustle voice before the emitter distance model. */
export const RUSTLE_GAIN = 0.55;
/** Seconds of the one-pole smoothing that follows the wind level. */
/** Wind whistles: wind speed (m/s) where they start and reach full probability; ring 15-70 m around the listener. */
export const WHISTLE_MIN_WIND = 8;
export const WHISTLE_FULL_WIND = 14;
export const WHISTLE_MAX = 2;
export const WHISTLE_MIN_M = 15;
export const WHISTLE_MAX_M = 70;
export const WHISTLE_Y = 8;
/** Crickets: max voices, ring around the listener (m), chirp carrier range (Hz), per-voice level. */
export const CRICKET_MAX = 4;
export const CRICKET_MIN_M = 10;
export const CRICKET_MAX_M = 60;
export const CRICKET_PULSE_HZ = 30;
export const CRICKET_LEVEL = 0.1;
/** Church bell: fundamental, spacing between strikes (s), maximum hearing distance (m), emitter height (m). */
export const BELL_HZ = 230;
export const BELL_SPACING_S = 3.2;
export const BELL_RANGE_M = 400;
export const BELL_Y = 25;
export const BELL_LEVEL = 0.14;
export const BELL_MAX_STEP_H = 0.1;
export const BELL_MAX_RATE_H_PER_S = 0.5;
const MAX_DT = 2;

// ---------------------------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------------------------
/** Foliage loudness by season: lush in spring/summer, drier in autumn, bare in winter. */
export function seasonLeafLevel(season: Season): number {
  switch (season) {
    case 'spring': return 0.85;
    case 'summer': return 1;
    case 'autumn': return 0.65;
    default: return 0.1;
  }
}

/** Band-pass centre multiplier by season: dry autumn leaves crackle brighter. */
export function seasonLeafBrightness(season: Season): number {
  switch (season) {
    case 'spring': return 0.95;
    case 'summer': return 0.9;
    case 'autumn': return 1.35;
    default: return 1.1;
  }
}

/** Crackle (amplitude flutter) depth by season. */
export function seasonCrackle(season: Season): number {
  return season === 'autumn' ? 0.7 : season === 'winter' ? 0.5 : 0.3;
}

/** 0..1 wind drive for foliage: mean wind plus gust, about 14 m/s saturates. */
export function windDrive(windSpeed: number, gust: number): number {
  const w = Number.isFinite(windSpeed) ? Math.max(0, windSpeed) : 0;
  const g = Number.isFinite(gust) ? clamp01(gust) : 0;
  return clamp01((w + g * 4) / 14);
}

/** Rustle loudness (0..1) of one tree. Larger trees are louder. */
export function rustleLevel(windSpeed: number, gust: number, season: Season, treeScale: number): number {
  const wd = windDrive(windSpeed, gust);
  const size = Math.min(1.5, Math.max(0.5, 0.6 + 0.4 * (Number.isFinite(treeScale) ? treeScale : 1)));
  return seasonLeafLevel(season) * (0.06 + 0.94 * Math.pow(wd, 1.3)) * size;
}

/** Loudness (0..1) of one rustle burst: zero in still air, then growing with the wind. */
export function rustleBurstLevel(windSpeed: number, gust: number, season: Season, treeScale: number): number {
  const w = Number.isFinite(windSpeed) ? windSpeed : 0;
  if (w < RUSTLE_MIN_WIND) return 0;
  const wd = windDrive(windSpeed, gust);
  const size = Math.min(1.5, Math.max(0.5, 0.6 + 0.4 * (Number.isFinite(treeScale) ? treeScale : 1)));
  return seasonLeafLevel(season) * Math.pow(wd, 1.3) * size;
}

/** Band-pass centre (Hz) of the rustle: brighter with more wind and in autumn. */
export function rustleCenterHz(windSpeed: number, gust: number, season: Season): number {
  const wd = windDrive(windSpeed, gust);
  return Math.min(9000, (1400 + 2800 * wd) * seasonLeafBrightness(season));
}

/** Whistle starts per second: none below WHISTLE_MIN_WIND except a weak gust-driven chance above 5 m/s. */
export function whistleRate(windSpeed: number, gust: number): number {
  const w = clamp01((windSpeed - WHISTLE_MIN_WIND) / (WHISTLE_FULL_WIND - WHISTLE_MIN_WIND));
  const g = clamp01(gust) * clamp01((windSpeed - 5) / 4);
  return 0.012 * w + 0.25 * w * w + 0.05 * g;
}

/** 0..1 whistle strength (loudness) from wind and gust. */
export function whistleStrength(windSpeed: number, gust: number): number {
  return clamp01(0.3 + 0.5 * clamp01((windSpeed - WHISTLE_MIN_WIND) / (WHISTLE_FULL_WIND - WHISTLE_MIN_WIND)) + 0.3 * clamp01(gust));
}

export interface WhistlePlan {
  dur: number;
  f0: number;
  fMid: number;
  f1: number;
  q: number;
}

/** Centre frequency rises then falls inside 400-1500 Hz over 1.5-4 s. */
export function planWhistle(rand: () => number): WhistlePlan {
  const f0 = randRange(rand, 400, 1000);
  const fMid = Math.min(1500, f0 * randRange(rand, 1.3, 1.9));
  const f1 = Math.max(400, fMid * randRange(rand, 0.55, 0.85));
  return { dur: randRange(rand, 1.5, 4), f0, fMid, f1, q: randRange(rand, 18, 35) };
}

/** Crickets are switched off: they cluttered the soundscape. Set to true to bring them back. */
export const CRICKETS_ENABLED = false;

/** Cricket density 0..1: summer nights full, autumn nights half, otherwise none; fades out with rain. */
export function cricketDensity(night: boolean, season: Season, rain: number): number {
  if (!CRICKETS_ENABLED || !night) return 0;
  const s = season === 'summer' ? 1 : season === 'autumn' ? 0.5 : 0;
  return s * clamp01(1 - 1.5 * rain);
}

/** Bell strikes for a clock time: hour 1..12, midnight and noon strike 12. */
export function hourToStrikes(hour: number): number {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const s = h % 12;
  return s === 0 ? 12 : s;
}

/** See the file header for the rule. prevTod is null on the first frame. */
export function shouldStrike(prevTod: number | null, tod: number, dt: number): boolean {
  if (prevTod === null || !(dt > 0) || !Number.isFinite(tod) || !Number.isFinite(prevTod)) return false;
  const adv = (((tod - prevTod) % 24) + 24) % 24;
  if (adv <= 0 || adv > BELL_MAX_STEP_H) return false;
  if (adv / dt > BELL_MAX_RATE_H_PER_S) return false;
  return Math.floor(((tod % 24) + 24) % 24) !== Math.floor(((prevTod % 24) + 24) % 24);
}

/** Inharmonic bell partials (ratio to the fundamental, amplitude, decay seconds). Hum, prime, tierce, quint, nominal. */
export const BELL_PARTIALS: ReadonlyArray<{ ratio: number; amp: number; decay: number }> = [
  { ratio: 0.5, amp: 0.45, decay: 6 },
  { ratio: 1, amp: 1, decay: 5 },
  { ratio: 1.0035, amp: 0.55, decay: 4.5 }, // slightly detuned prime: the slow beating of a real bell
  { ratio: 1.2, amp: 0.7, decay: 3.5 },
  { ratio: 1.5, amp: 0.5, decay: 3 },
  { ratio: 2, amp: 0.8, decay: 2.5 },
];

// ---------------------------------------------------------------------------------------------
// Voices
// ---------------------------------------------------------------------------------------------
function safeStop(n: { stop(): void }): void {
  try {
    n.stop();
  } catch {
    /* not started or already stopped */
  }
}

interface WhistleVoice {
  emitter: Emitter;
  end: number;
  stop: () => void;
}

interface CricketVoice {
  emitter: Emitter;
  carrier: OscillatorNode;
  lfo: OscillatorNode;
  am: GainNode;
  lfoDepth: GainNode;
  gate: GainNode;
  /** Context time up to which chirps are already scheduled. */
  sched: number;
  level: number;
  x: number;
  z: number;
}

interface Dying {
  emitter: Emitter;
  end: number;
  stop: () => void;
}

interface Ringing {
  emitter: Emitter;
  strikesLeft: number;
  nextAt: number;
  end: number;
}

export interface NatureOptions {
  rand?: () => number;
}

export function createNatureSoundsWith(ctx: AudioContext, bus: AudioBus, opts: NatureOptions = {}): SoundSystem {
  const rand = opts.rand ?? createRandom();

  // ---- Leaf rustle: short bursts, one-shot nodes ----
  const dying: Dying[] = [];
  let rustleCountdown = randRange(rand, 3, RUSTLE_INTERVAL_MAX_S);

  const rustleBurst = (frame: AudioFrame) => {
    const l = frame.listener;
    const near: { d: number; t: { x: number; z: number; scale: number } }[] = [];
    for (const t of frame.trees) {
      const d = Math.hypot(t.x - l.x, t.z - l.z);
      if (d <= RUSTLE_RANGE_M) near.push({ d, t });
    }
    near.sort((a, b) => a.d - b.d);
    const pool = near.slice(0, RUSTLE_NEAREST);
    // Pick RUSTLE_TREES of the nearest trees at random, so the rustle moves around.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const wd = windDrive(frame.windSpeed, frame.gust);
    for (const { t } of pool.slice(0, RUSTLE_TREES)) {
      const level = rustleBurstLevel(frame.windSpeed, frame.gust, frame.season, t.scale) * RUSTLE_GAIN;
      if (level < 0.004) continue;
      const emitter = bus.createEmitter({ category: 'leaves', x: t.x, y: 4 + 2 * t.scale, z: t.z, refDistance: 6, maxDistance: 120 });
      const start = ctx.currentTime + 0.02 + rand() * 0.5; // trees do not start in unison
      const dur = randRange(rand, RUSTLE_DURATION_MIN_S, RUSTLE_DURATION_MAX_S) * (0.8 + 0.4 * wd);
      const src = ctx.createBufferSource();
      src.buffer = makeNoiseBuffer(ctx, 3, 'white');
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 0.8;
      bp.frequency.value = rustleCenterHz(frame.windSpeed, frame.gust, frame.season) * randRange(rand, 0.85, 1.15);
      const flutter = ctx.createGain();
      flutter.gain.value = 1;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = frame.season === 'autumn' ? randRange(rand, 9, 14) : randRange(rand, 3, 7);
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = seasonCrackle(frame.season) * (0.6 + 0.4 * wd);
      lfo.connect(lfoDepth);
      lfoDepth.connect(flutter.gain);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(level, start + Math.min(0.5, dur * 0.3)); // swell in
      env.gain.exponentialRampToValueAtTime(0.0001, start + dur); // and die away
      src.connect(bp);
      bp.connect(flutter);
      flutter.connect(env);
      env.connect(emitter.input);
      src.start(start);
      lfo.start(start);
      src.stop(start + dur + 0.1);
      lfo.stop(start + dur + 0.1);
      dying.push({
        emitter,
        end: start + dur + 0.2,
        stop: () => {
          safeStop(src);
          safeStop(lfo);
          src.disconnect();
          bp.disconnect();
          flutter.disconnect();
          lfo.disconnect();
          lfoDepth.disconnect();
          env.disconnect();
          emitter.dispose();
        },
      });
    }
  };

  // ---- Wind whistles ----
  const whistles: WhistleVoice[] = [];

  const spawnWhistle = (frame: AudioFrame) => {
    const l = frame.listener;
    const ang = rand() * Math.PI * 2;
    const r = randRange(rand, WHISTLE_MIN_M, WHISTLE_MAX_M);
    const emitter = bus.createEmitter({ category: 'wind', x: l.x + Math.cos(ang) * r, y: WHISTLE_Y, z: l.z + Math.sin(ang) * r, refDistance: 10, maxDistance: 150 });
    const plan = planWhistle(rand);
    const strength = whistleStrength(frame.windSpeed, frame.gust);
    const t = ctx.currentTime + 0.02;
    const end = t + plan.dur;
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(ctx, 2, 'white');
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = plan.q;
    bp.frequency.setValueAtTime(plan.f0, t);
    bp.frequency.exponentialRampToValueAtTime(plan.fMid, t + plan.dur * 0.45);
    bp.frequency.exponentialRampToValueAtTime(plan.f1, end);
    // A narrow band passes little noise energy, so the envelope peak is large.
    const env = ctx.createGain();
    const peak = 3 + 6 * strength;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + plan.dur * 0.35);
    env.gain.linearRampToValueAtTime(peak * 0.6, t + plan.dur * 0.65);
    env.gain.linearRampToValueAtTime(0, end);
    src.connect(bp);
    bp.connect(env);
    env.connect(emitter.input);
    src.start(t, rand());
    src.stop(end + 0.05);
    const stop = () => {
      safeStop(src);
      src.disconnect();
      bp.disconnect();
      env.disconnect();
    };
    src.onended = stop;
    whistles.push({ emitter, end: end + 0.1, stop });
  };

  // ---- Crickets ----
  const crickets: CricketVoice[] = [];

  const placeCricket = (c: CricketVoice, l: { x: number; z: number }) => {
    const ang = rand() * Math.PI * 2;
    const r = randRange(rand, CRICKET_MIN_M, CRICKET_MAX_M);
    c.x = l.x + Math.cos(ang) * r;
    c.z = l.z + Math.sin(ang) * r;
    c.emitter.setPosition(c.x, 0.3, c.z);
  };

  const addCricket = (l: { x: number; z: number }) => {
    const emitter = bus.createEmitter({ category: 'ambience', x: l.x, y: 0.3, z: l.z, refDistance: 3, maxDistance: 90 });
    emitter.setGain(0);
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = randRange(rand, 4200, 5000);
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = CRICKET_PULSE_HZ * randRange(rand, 0.93, 1.07);
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.5;
    lfo.connect(lfoDepth);
    lfoDepth.connect(am.gain);
    const gate = ctx.createGain();
    gate.gain.value = 0;
    carrier.connect(am);
    am.connect(gate);
    gate.connect(emitter.input);
    carrier.start();
    lfo.start();
    const c: CricketVoice = { emitter, carrier, lfo, am, lfoDepth, gate, sched: ctx.currentTime + rand() * 1.5, level: 0, x: l.x, z: l.z };
    placeCricket(c, l);
    crickets.push(c);
  };

  const killCricket = (c: CricketVoice) => {
    safeStop(c.carrier);
    safeStop(c.lfo);
    c.carrier.disconnect();
    c.lfo.disconnect();
    c.lfoDepth.disconnect();
    c.am.disconnect();
    c.gate.disconnect();
    c.emitter.dispose();
  };

  /** Keeps ~3 s of chirps scheduled on the gate: trains of 3-5 chirps (~0.1 s each, 3 pulses) then a rest. */
  const scheduleChirps = (c: CricketVoice, now: number) => {
    const g = c.gate.gain;
    while (c.sched < now + 3) {
      const chirps = 3 + Math.floor(rand() * 3);
      const period = randRange(rand, 0.3, 0.45);
      let t = Math.max(c.sched, now);
      for (let k = 0; k < chirps; k++) {
        const dur = 3 / CRICKET_PULSE_HZ;
        g.setValueAtTime(0, t);
        g.linearRampToValueAtTime(1, t + 0.004);
        g.setValueAtTime(1, t + dur);
        g.linearRampToValueAtTime(0, t + dur + 0.006);
        t += period;
      }
      c.sched = t + randRange(rand, 0.7, 2.2);
    }
  };

  // ---- Church bell ----
  let prevTod: number | null = null;
  let ringing: Ringing | null = null;

  const playStrike = (r: Ringing, t: number) => {
    for (const p of BELL_PARTIALS) {
      const end = t + p.decay;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = BELL_HZ * p.ratio;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(p.amp * BELL_LEVEL, t + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0003, end);
      osc.connect(env);
      env.connect(r.emitter.input);
      osc.start(t);
      osc.stop(end + 0.05);
      osc.onended = () => {
        osc.disconnect();
        env.disconnect();
      };
    }
    playNoiseBurst(ctx, r.emitter.input, { when: t, attack: 0.002, decay: 0.03, gain: 0.15, filter: { type: 'bandpass', frequency: 1800, q: 1.5 } });
  };

  function update(frame: AudioFrame): void {
    const dt = Number.isFinite(frame.dt) ? Math.min(MAX_DT, Math.max(0, frame.dt)) : 0;
    const now = ctx.currentTime;
    const l = frame.listener;
    const wind = Number.isFinite(frame.windSpeed) ? frame.windSpeed : 0;
    const gust = Number.isFinite(frame.gust) ? frame.gust : 0;

    // Fading-out rustle voices and finished whistles
    for (let i = dying.length - 1; i >= 0; i--) {
      if (dying[i].end <= now) {
        dying[i].stop();
        dying.splice(i, 1);
      }
    }
    for (let i = whistles.length - 1; i >= 0; i--) {
      if (whistles[i].end < now) {
        whistles[i].stop();
        whistles[i].emitter.dispose();
        whistles.splice(i, 1);
      }
    }

    // ---- Rustle: one burst about every 10 s, only when there is a breeze ----
    rustleCountdown -= dt;
    if (rustleCountdown <= 0) {
      rustleCountdown = randRange(rand, RUSTLE_INTERVAL_MIN_S, RUSTLE_INTERVAL_MAX_S);
      if (frame.trees.length > 0) rustleBurst(frame);
    }

    // ---- Whistles ----
    const rate = whistleRate(wind, gust);
    if (rate > 0 && whistles.length < WHISTLE_MAX && rand() < rate * dt) spawnWhistle(frame);

    // ---- Crickets ----
    const density = cricketDensity(frame.night, frame.season, frame.rain);
    const want = Math.round(CRICKET_MAX * density);
    while (crickets.length < want) addCricket(l);
    while (crickets.length > want) killCricket(crickets.pop() as CricketVoice);
    for (const c of crickets) {
      if (Math.hypot(c.x - l.x, c.z - l.z) > CRICKET_MAX_M * 1.3) placeCricket(c, l); // listener walked away
      c.level += (CRICKET_LEVEL * density - c.level) * (1 - Math.exp(-dt / 1.5));
      c.emitter.setGain(c.level);
      scheduleChirps(c, now);
    }

    // ---- Church bell ----
    const strike = shouldStrike(prevTod, frame.timeOfDay, dt);
    prevTod = Number.isFinite(frame.timeOfDay) ? frame.timeOfDay : prevTod;
    if (strike && frame.church && !ringing) {
      const dist = Math.hypot(frame.church.x - l.x, frame.church.z - l.z);
      if (dist <= BELL_RANGE_M) {
        const emitter = bus.createEmitter({ category: 'ambience', x: frame.church.x, y: BELL_Y, z: frame.church.z, refDistance: 30, maxDistance: 800, rolloff: 0.9 });
        const n = hourToStrikes(frame.timeOfDay);
        ringing = { emitter, strikesLeft: n, nextAt: now, end: 0 };
      }
    }
    if (ringing) {
      while (ringing.strikesLeft > 0 && now >= ringing.nextAt) {
        playStrike(ringing, ringing.nextAt);
        ringing.strikesLeft--;
        ringing.end = ringing.nextAt + BELL_PARTIALS[0].decay + 1;
        ringing.nextAt += BELL_SPACING_S;
      }
      if (ringing.strikesLeft === 0 && now > ringing.end) {
        ringing.emitter.dispose();
        ringing = null;
      }
    }
  }

  return {
    name: 'nature',
    update,
    dispose() {
      for (const d of dying) d.stop();
      dying.length = 0;
      for (const w of whistles) {
        w.stop();
        w.emitter.dispose();
      }
      whistles.length = 0;
      for (const c of crickets) killCricket(c);
      crickets.length = 0;
      if (ringing) ringing.emitter.dispose();
      ringing = null;
    },
  };
}

export const createNatureSounds: SoundSystemFactory = (ctx, bus) => createNatureSoundsWith(ctx, bus);
