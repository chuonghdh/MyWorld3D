// People sounds: murmured conversation, footsteps and rain drumming on umbrellas. Every sound belongs to one
// pedestrian (ids are stable), has its own emitter at that pedestrian and follows them every frame.
//
// Pose: src/traffic/pedestrians.ts defines POSE_WALK = 0, POSE_STAND = 1, POSE_CHAT = 2, POSE_SIT = 3. The frame
// type declares `pose: string`, but the scene passes the numeric pose (as a number or a numeric string); both
// numbers, numeric strings and the names 'walk' | 'stand' | 'chat' | 'sit' are accepted (see poseKind).
//
//  talking    speech-like murmur, no words: a sawtooth glottal source at the speaker's pitch (men 90-130 Hz, women
//             and children 190-250 Hz, chosen by id) through three parallel formant band-passes (vowel F1/F2/F3
//             scaled by vocal tract length), a little breath noise and an occasional fricative burst. Syllables of
//             about 0.7/rate seconds at 3-5 Hz in phrases of 3-7 syllables separated by pauses. Category 'voice'.
//  footsteps  heel strike per step: a short noise tick plus a low thud on dry pavement; lowpassed wetter tap with
//             a splash hiss when frame.rain > 0.1. Steps per second follow speed; the emitter alternates 10 cm to the
//             left and right of the walking line. Category 'footstep'.
//  umbrella   rain on a taut canopy: a looped buffer of sparse random drop impulses through a drum resonance and a
//             bright patter band; density and level follow frame.rain. Category 'rain' (so the rain volume slider
//             controls it; it only exists while it rains).
// Tuned from acoustics knowledge, not by ear.

import type { AudioBus } from './bus';
import { VoiceBudget } from './bus';
import type { VoiceCandidate } from './bus';
import type { AudioFrame, AudioPedestrian, SoundSystem, SoundSystemFactory } from './frame';
import { CHAT_VOICES, STEP_VOICES, UMBRELLA_VOICES, CHAT_MAX_DISTANCE, STEP_MAX_DISTANCE, UMBRELLA_MAX_DISTANCE, RAIN_ON, RAIN_OFF, MOUTH_Y, poseKind } from './peopleCore';
import type { Voice } from './peopleCore';
import { ChatVoice, StepVoice } from './peopleVoices';
import { UmbrellaVoice } from './peopleUmbrella';
export * from './peopleCore';
export * from './peopleVoices';
export * from './peopleUmbrella';

// ---------------------------------------------------------------------------------------------------------
// The system

type Cands = VoiceCandidate<AudioPedestrian>[];

export class PeopleSounds implements SoundSystem {
  readonly name = 'people';
  private readonly chats = new Map<number, ChatVoice>();
  private readonly steps = new Map<number, StepVoice>();
  private readonly umbrellas = new Map<number, UmbrellaVoice>();
  private readonly dying: Voice[] = [];
  private readonly chatBudget: VoiceBudget<AudioPedestrian>;
  private readonly stepBudget: VoiceBudget<AudioPedestrian>;
  private readonly umbrellaBudget: VoiceBudget<AudioPedestrian>;
  private readonly chatCands: Cands = [];
  private readonly stepCands: Cands = [];
  private readonly umbCands: Cands = [];
  private rainOn = false;

  constructor(private readonly ctx: AudioContext, bus: AudioBus) {
    const mk = <V extends Voice>(map: Map<number, V>, max: number, maxDistance: number, make: (p: AudioPedestrian) => V) =>
      new VoiceBudget<AudioPedestrian>({
        max,
        maxDistance,
        onAcquire: (id, p) => map.set(id as number, make(p)),
        onRelease: (id) => {
          const v = map.get(id as number);
          if (!v) return;
          map.delete(id as number);
          v.release();
          this.dying.push(v);
        },
      });
    this.chatBudget = mk(this.chats, CHAT_VOICES, CHAT_MAX_DISTANCE, (p) => new ChatVoice(ctx, bus, p));
    this.stepBudget = mk(this.steps, STEP_VOICES, STEP_MAX_DISTANCE, (p) => new StepVoice(ctx, bus, p));
    this.umbrellaBudget = mk(this.umbrellas, UMBRELLA_VOICES, UMBRELLA_MAX_DISTANCE, (p) => new UmbrellaVoice(ctx, bus, p));
  }

  /** Diagnostics for tests. */
  get stats(): { chat: number; steps: number; umbrellas: number; dying: number } {
    return { chat: this.chats.size, steps: this.steps.size, umbrellas: this.umbrellas.size, dying: this.dying.length };
  }

  chatIds(): number[] {
    return [...this.chats.keys()];
  }

  stepIds(): number[] {
    return [...this.steps.keys()];
  }

  umbrellaIds(): number[] {
    return [...this.umbrellas.keys()];
  }

  chatVoice(id: number): ChatVoice | undefined {
    return this.chats.get(id);
  }

  stepVoice(id: number): StepVoice | undefined {
    return this.steps.get(id);
  }

  update(frame: AudioFrame): void {
    const l = frame.listener;
    const now = this.ctx.currentTime;
    for (let i = this.dying.length - 1; i >= 0; i--) {
      if (now >= this.dying[i].endTime) {
        this.dying[i].destroy();
        this.dying.splice(i, 1);
      }
    }

    const rain = Number.isFinite(frame.rain) ? frame.rain : 0;
    if (this.rainOn ? rain < RAIN_OFF : rain > RAIN_ON) this.rainOn = !this.rainOn;

    let nc = 0;
    let ns = 0;
    let nu = 0;
    const ps = frame.pedestrians;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
      const d = Math.hypot(p.x - l.x, MOUTH_Y - l.y, p.z - l.z);
      const kind = poseKind(p.pose);
      if (kind === 'chat' && d <= CHAT_MAX_DISTANCE) nc = this.add(this.chatCands, nc, p, d);
      if (kind === 'walk' && p.speed > 0.3 && d <= STEP_MAX_DISTANCE) ns = this.add(this.stepCands, ns, p, d);
      if (this.rainOn && p.umbrella && d <= UMBRELLA_MAX_DISTANCE) nu = this.add(this.umbCands, nu, p, d);
    }
    this.chatCands.length = nc;
    this.stepCands.length = ns;
    this.umbCands.length = nu;
    this.chatBudget.update(this.chatCands);
    this.stepBudget.update(this.stepCands);
    this.umbrellaBudget.update(this.umbCands);

    if (this.chats.size + this.steps.size + this.umbrellas.size === 0) return;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      const c = this.chats.get(p.id);
      if (c) c.update(p);
      const s = this.steps.get(p.id);
      if (s) s.update(p, rain);
      const u = this.umbrellas.get(p.id);
      if (u) u.update(p, rain);
    }
  }

  private add(list: Cands, n: number, p: AudioPedestrian, d: number): number {
    const c = list[n];
    if (!c) list[n] = { key: p.id, distance: d, item: p };
    else {
      c.key = p.id;
      c.distance = d;
      c.item = p;
    }
    return n + 1;
  }

  dispose(): void {
    this.chatBudget.clear();
    this.stepBudget.clear();
    this.umbrellaBudget.clear();
    for (const v of this.dying) v.destroy();
    this.dying.length = 0;
    this.chats.clear();
    this.steps.clear();
    this.umbrellas.clear();
  }
}

export const createPeopleSounds: SoundSystemFactory = (ctx, bus): SoundSystem => new PeopleSounds(ctx, bus);
