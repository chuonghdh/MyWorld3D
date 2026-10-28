// Weather sounds for the procedural Web Audio engine: rain bed, wind swell, thunder.
// Built from the shared noise buffer, no assets. index.ts creates it inside init() and forwards
// setWeatherSound / playThunder; every call is a no-op before the audio context exists.

export interface WeatherAudio {
  /** rain 0..1, swell 0..1 (extra wind whistle, e.g. storm gusts), snowMute dampens the street a bit. */
  set(rain: number, swell: number): void;
  /** Plays one clap now. Distance in metres shapes brightness, length and loudness; strength 0..1. */
  thunder(distance: number, strength: number): void;
  dispose(): void;
}

/** Loudness and low-pass cutoff of a thunder clap for a distance in metres. Pure, tested. */
export function thunderCharacter(distance: number, strength: number): { gain: number; cutoff: number; length: number } {
  const d = Math.max(0, distance);
  const near = 1 / (1 + d / 450);
  return {
    gain: Math.min(1, Math.max(0.05, strength) * (0.25 + 0.75 * near)),
    cutoff: 250 + 2400 * near,
    length: 2.5 + Math.min(5, d / 500),
  };
}

export function createWeatherAudio(ctx: AudioContext, master: GainNode, noise: AudioBuffer): WeatherAudio {
  const loop = (): AudioBufferSourceNode => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    src.start(0, Math.random() * 1.5);
    return src;
  };

  // Rain: a bright hiss plus a lower patter on roofs.
  const hissF = ctx.createBiquadFilter();
  hissF.type = 'highpass';
  hissF.frequency.value = 3200;
  const hissG = ctx.createGain();
  hissG.gain.value = 0;
  loop().connect(hissF);
  hissF.connect(hissG);
  hissG.connect(master);

  const patF = ctx.createBiquadFilter();
  patF.type = 'bandpass';
  patF.frequency.value = 1100;
  patF.Q.value = 0.6;
  const patG = ctx.createGain();
  patG.gain.value = 0;
  loop().connect(patF);
  patF.connect(patG);
  patG.connect(master);

  // Wind swell: low-passed noise whose level breathes with a slow LFO.
  const swellF = ctx.createBiquadFilter();
  swellF.type = 'bandpass';
  swellF.frequency.value = 420;
  swellF.Q.value = 1.4;
  const swellG = ctx.createGain();
  swellG.gain.value = 0;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.13;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0;
  lfo.connect(lfoDepth);
  lfoDepth.connect(swellG.gain);
  lfo.start();
  loop().connect(swellF);
  swellF.connect(swellG);
  swellG.connect(master);

  const claps = new Set<AudioScheduledSourceNode>();

  return {
    set(rain, swell) {
      const t = ctx.currentTime;
      const r = Math.min(1, Math.max(0, rain));
      const s = Math.min(1, Math.max(0, swell));
      hissG.gain.setTargetAtTime(r * 0.2, t, 0.6);
      patG.gain.setTargetAtTime(r * r * 0.16, t, 0.6);
      swellG.gain.setTargetAtTime(0.02 + s * 0.16, t, 1.2);
      lfoDepth.gain.setTargetAtTime(s * 0.1, t, 1.2);
      swellF.frequency.setTargetAtTime(380 + s * 500, t, 1.5);
    },
    thunder(distance, strength) {
      const c = thunderCharacter(distance, strength);
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.playbackRate.value = 0.5 + Math.random() * 0.2;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(c.cutoff, t);
      lp.frequency.exponentialRampToValueAtTime(90, t + c.length);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(c.gain * 0.9, t + 0.04 + Math.min(0.6, distance / 4000));
      // rolling rumble: a few decaying swells
      let at = t + 0.3;
      let amp = c.gain * 0.7;
      for (let i = 0; i < 4; i++) {
        g.gain.linearRampToValueAtTime(amp * (0.5 + Math.random() * 0.5), at);
        at += 0.4 + Math.random() * 0.8;
        amp *= 0.65;
      }
      g.gain.linearRampToValueAtTime(0, t + c.length);
      src.connect(lp);
      lp.connect(g);
      g.connect(master);
      src.start(t, Math.random());
      src.stop(t + c.length + 0.1);
      claps.add(src);
      src.onended = () => {
        claps.delete(src);
        src.disconnect();
        lp.disconnect();
        g.disconnect();
      };
    },
    dispose() {
      for (const s of claps) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }
      claps.clear();
      hissG.gain.value = 0;
      patG.gain.value = 0;
      swellG.gain.value = 0;
    },
  };
}
