// Procedural Web Audio engine for MyWorld3D. No audio files.
// Call init() from a user gesture (browsers block autoplay); every other call is a no-op before that.

import { createWeatherAudio, type WeatherAudio } from './weather';

export type VehicleClass = 'car' | 'bus' | 'truck' | 'motorbike';

type AudioWindow = { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };

const ENGINE_BASE_HZ: Record<VehicleClass, number> = {
  car: 85,
  bus: 55,
  truck: 45,
  motorbike: 130,
};

const MASTER_LEVEL = 0.8;
const ENGINE_LEVEL = 0.15;
/** Average seconds between random horn honks and dog barks. */
const HORN_INTERVAL_S = 40;
const BARK_INTERVAL_S = 25;

interface Engine {
  osc: OscillatorNode;
  gain: GainNode;
  base: number;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let leafGain: GainNode | null = null;
let leafFilter: BiquadFilterNode | null = null;
let weatherAudio: WeatherAudio | null = null;
let weatherRain = 0;
let weatherSwell = 0;
const engines = new Map<VehicleClass, Engine>();

let windSpeed = 0;
let soundEnabled = true;

/**
 * Creates the AudioContext and all looping sources. Call once from a click or key handler.
 * Returns false if Web Audio is unavailable. Safe to call again.
 */
export function init(): boolean {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  }
  const w = window as unknown as AudioWindow;
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return false;

  const context = new Ctor();
  const out = context.createGain();
  out.gain.value = soundEnabled ? MASTER_LEVEL : 0;
  out.connect(context.destination);
  ctx = context;
  master = out;

  noise = makeNoiseBuffer(context, 2);
  buildLeaves(context);
  buildCrowd(context);
  buildEngines(context);
  weatherAudio = createWeatherAudio(context, out, noise);
  weatherAudio.set(weatherRain, weatherSwell);
  setWind(windSpeed);
  return true;
}

export function isReady(): boolean {
  return ctx !== null;
}

/** Wind speed in m/s. Drives leaf rustle volume and brightness. */
export function setWind(speed: number): void {
  windSpeed = Math.max(0, speed);
  if (!ctx || !leafGain || !leafFilter) return;
  const t = ctx.currentTime;
  const level = Math.min(1, windSpeed / 15);
  leafGain.gain.setTargetAtTime(0.02 + level * 0.35, t, 0.3);
  leafFilter.frequency.setTargetAtTime(1500 + level * 3000, t, 0.5);
}

/** Master mute. Mirrors WorldSettings.soundEnabled; the caller passes that value. */
export function setSoundEnabled(on: boolean): void {
  soundEnabled = on;
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(on ? MASTER_LEVEL : 0, ctx.currentTime, 0.05);
}

/** Rain bed level 0..1 and wind swell 0..1 (storm gusts). Cheap; call every frame. */
export function setWeatherSound(rain: number, swell: number): void {
  weatherRain = rain;
  weatherSwell = swell;
  weatherAudio?.set(rain, swell);
}

/** One thunder clap now; the caller applies the distance/340 s delay. Distance in metres, strength 0..1. */
export function playThunder(distance: number, strength = 1): void {
  if (!ctx || !soundEnabled) return;
  weatherAudio?.thunder(distance, strength);
}

/** Sets how loud a vehicle class hums. gain 0..1; 0 silences it. */
export function setVehicleNearby(vehicle: VehicleClass, gain: number): void {
  const engine = engines.get(vehicle);
  if (!ctx || !engine) return;
  const g = clamp01(gain) * ENGINE_LEVEL;
  engine.gain.gain.setTargetAtTime(g, ctx.currentTime, 0.2);
}

/**
 * Plays a passing vehicle: the hum swells and fades with a Doppler-like pitch drop.
 * Gain falls off with distance in world metres.
 */
export function playVehiclePass(vehicle: VehicleClass, distance: number): void {
  const engine = engines.get(vehicle);
  if (!ctx || !engine) return;
  const peak = ENGINE_LEVEL / (1 + Math.max(0, distance) / 15);
  const t = ctx.currentTime;
  const g = engine.gain.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(0, t);
  g.linearRampToValueAtTime(peak, t + 1.5);
  g.linearRampToValueAtTime(0, t + 3);
  const f = engine.osc.frequency;
  f.cancelScheduledValues(t);
  f.setValueAtTime(engine.base * 1.12, t);
  f.linearRampToValueAtTime(engine.base * 0.88, t + 3);
}

/** Short car horn, pitch picked at random. */
export function playHorn(): void {
  if (!ctx || !master || !soundEnabled) return;
  const t = ctx.currentTime;
  const base = 380 + Math.random() * 140;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(0.12, t + 0.02);
  out.gain.setValueAtTime(0.12, t + 0.35);
  out.gain.linearRampToValueAtTime(0, t + 0.45);
  out.connect(master);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2200;
  lp.connect(out);
  for (const ratio of [1, 1.25]) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = base * ratio;
    osc.connect(lp);
    osc.start(t);
    osc.stop(t + 0.5);
    osc.onended = () => osc.disconnect();
  }
}

/** Dog bark: two or three short pitched bursts with a falling pitch envelope. */
export function playBark(): void {
  if (!ctx || !master || !soundEnabled) return;
  const t0 = ctx.currentTime;
  const count = 2 + Math.floor(Math.random() * 2);
  const pitch = 520 + Math.random() * 180;
  for (let i = 0; i < count; i++) {
    const t = t0 + i * 0.2;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.28, t + 0.01);
    env.gain.linearRampToValueAtTime(0, t + 0.13);
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = 900;
    formant.Q.value = 1.2;
    formant.connect(env);
    env.connect(master);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(pitch, t);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.5, t + 0.13);
    osc.connect(formant);
    osc.start(t);
    osc.stop(t + 0.15);
    osc.onended = () => {
      osc.disconnect();
      formant.disconnect();
      env.disconnect();
    };
  }
}

/**
 * Advances random ambient events (horns, barks). Call once per frame with the frame time in seconds.
 * Does nothing while sound is disabled.
 */
export function tick(dt: number): void {
  if (!ctx || !soundEnabled || ctx.state !== 'running') return;
  if (Math.random() < dt / HORN_INTERVAL_S) playHorn();
  if (Math.random() < dt / BARK_INTERVAL_S) playBark();
}

/** Releases the audio context. Use when the scene unmounts. */
export function dispose(): void {
  weatherAudio?.dispose();
  weatherAudio = null;
  if (ctx) void ctx.close();
  ctx = null;
  master = null;
  noise = null;
  leafGain = null;
  leafFilter = null;
  engines.clear();
}

// ---- internals -------------------------------------------------------------

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function makeNoiseBuffer(context: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(context.sampleRate * seconds);
  const buf = context.createBuffer(1, len, context.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function loopNoise(context: AudioContext): AudioBufferSourceNode {
  const src = context.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  src.start();
  return src;
}

/** Leaf rustle: band-passed noise, volume and brightness follow wind speed. */
function buildLeaves(context: AudioContext): void {
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1500;
  filter.Q.value = 0.7;
  const gain = context.createGain();
  gain.gain.value = 0;
  loopNoise(context).connect(filter);
  filter.connect(gain);
  gain.connect(master as GainNode);
  leafFilter = filter;
  leafGain = gain;
}

/** Crowd chatter: low-level band-passed noise with a slow random-feeling swell. */
function buildCrowd(context: AudioContext): void {
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 900;
  filter.Q.value = 0.5;
  const gain = context.createGain();
  gain.gain.value = 0.03;
  const lfo = context.createOscillator();
  lfo.frequency.value = 0.37;
  const lfoDepth = context.createGain();
  lfoDepth.gain.value = 0.02;
  lfo.connect(lfoDepth);
  lfoDepth.connect(gain.gain);
  lfo.start();
  loopNoise(context).connect(filter);
  filter.connect(gain);
  gain.connect(master as GainNode);
}

/** One low engine hum per vehicle class, silent until setVehicleNearby or playVehiclePass. */
function buildEngines(context: AudioContext): void {
  const classes: VehicleClass[] = ['car', 'bus', 'truck', 'motorbike'];
  for (const cls of classes) {
    const base = ENGINE_BASE_HZ[cls];
    const osc = context.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = base;
    const lp = context.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const gain = context.createGain();
    gain.gain.value = 0;
    osc.connect(lp);
    lp.connect(gain);
    gain.connect(master as GainNode);
    osc.start();
    engines.set(cls, { osc, gain, base });
  }
}
