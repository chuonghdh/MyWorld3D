// Animal sounds: bird songs (event driven and an ambient trickle), wing-flap flutter, dog barks, cat meows.
// Every sound is a separate positional one-shot: its own oscillators/noise, its own Emitter at the object's
// position, disposed when the sound has finished. No shared mixed loop. See docs/AUDIO.md.
//
// Everything here is synthesised from acoustics knowledge and has not been judged by ear (see the
// tuning constants below).

import type { Emitter, AudioBus } from './bus';
import type { AudioFrame, SoundSystem, SoundSystemFactory } from './frame';
import { clamp01 } from './math';
import { createRandom, randRange } from './synth';
import { MAX_EVENT_SONGS, MAX_AMBIENT_SONGS, AMBIENT_MIN_M, AMBIENT_MAX_M, AMBIENT_MEAN_S, OWL_MEAN_S, BIRD_Y, BIRD_REF_M, BIRD_MAX_M, BIRD_LEVEL, FLAP_BIRDS_MIN, FLAP_BIRDS_MAX, MAX_FLAPS, DOG_RANGE_M, DOG_MEAN_S, MAX_BARKERS, DOG_VEHICLE_M, DOG_VEHICLE_SPEED, MAX_MEOWS, MAX_DT, birdActivity, owlChance, pickSpecies, dogVoice, composeSong } from './animalsPure';
import type { BirdSpecies } from './animalsPure';
import { playSong, playBarks, playMeow, playFlutter } from './animalsVoices';
import type { Disposer } from './animalsVoices';
export * from './animalsPure';
export * from './animalsVoices';

// ---------------------------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------------------------
type ShotKind = 'song' | 'ambient' | 'wing' | 'bark' | 'meow';

interface Shot {
  kind: ShotKind;
  emitter: Emitter;
  /** Context time after which the shot is over. */
  end: number;
  dogId?: number;
  cleanup?: Disposer;
}

export interface AnimalOptions {
  /** Random source; inject a stub in tests. */
  rand?: () => number;
}

export function createAnimalSoundsWith(ctx: AudioContext, bus: AudioBus, opts: AnimalOptions = {}): SoundSystem {
  const rand = opts.rand ?? createRandom();
  const shots: Shot[] = [];
  const dogs = new Map<number, { timer: number }>();
  const activeBark = new Map<number, Shot>();
  let ambientTimer = -1;

  const exp = (mean: number) => -Math.log(1 - Math.min(0.999999, rand())) * mean;
  const count = (kind: ShotKind) => {
    let n = 0;
    for (const s of shots) if (s.kind === kind) n++;
    return n;
  };

  const release = (s: Shot) => {
    s.cleanup?.();
    s.emitter.dispose();
    if (s.dogId !== undefined && activeBark.get(s.dogId) === s) activeBark.delete(s.dogId);
  };

  const spawnSong = (kind: 'song' | 'ambient', species: BirdSpecies, x: number, z: number) => {
    const emitter = bus.createEmitter({ category: 'bird', x, y: BIRD_Y, z, refDistance: BIRD_REF_M, maxDistance: BIRD_MAX_M, rolloff: 1.2 });
    const song = composeSong(species, rand);
    const t0 = ctx.currentTime + 0.03;
    const cleanup = playSong(ctx, emitter.input, t0, song, BIRD_LEVEL);
    shots.push({ kind, emitter, end: t0 + song.duration + 0.3, cleanup });
  };

  const nextBark = (mean: number) => Math.max(2, exp(mean));

  function update(frame: AudioFrame): void {
    const dt = Number.isFinite(frame.dt) ? Math.min(MAX_DT, Math.max(0, frame.dt)) : 0;
    const now = ctx.currentTime;
    const l = frame.listener;

    for (let i = shots.length - 1; i >= 0; i--) {
      if (shots[i].end < now) {
        release(shots[i]);
        shots.splice(i, 1);
      }
    }

    const activity = birdActivity(frame.timeOfDay, frame.season, frame.rain);
    const owl = owlChance(frame.night, frame.season, frame.rain);

    // Events
    for (const ev of frame.lifeEvents) {
      if (!Number.isFinite(ev.x) || !Number.isFinite(ev.z)) continue;
      if (ev.type === 'bird-call') {
        if (count('song') >= MAX_EVENT_SONGS) continue;
        if (frame.night) {
          if (rand() < owl) spawnSong('song', 'owl', ev.x, ev.z);
        } else if (rand() < clamp01(activity * 1.5)) {
          spawnSong('song', pickSpecies(rand, frame.timeOfDay), ev.x, ev.z);
        }
      } else if (ev.type === 'pigeon-scatter') {
        if (count('wing') >= MAX_FLAPS) continue;
        const emitter = bus.createEmitter({ category: 'wing', x: ev.x, y: 3, z: ev.z, refDistance: 6, maxDistance: 120 });
        const birds = FLAP_BIRDS_MIN + Math.floor(rand() * (FLAP_BIRDS_MAX - FLAP_BIRDS_MIN + 1));
        const end = playFlutter(ctx, emitter.input, now + 0.02, birds, rand);
        shots.push({ kind: 'wing', emitter, end: end + 0.1 });
      } else if (ev.type === 'cat-meow') {
        if (count('meow') >= MAX_MEOWS) continue;
        const emitter = bus.createEmitter({ category: 'cat', x: ev.x, y: 0.5, z: ev.z, refDistance: 3, maxDistance: 80 });
        const end = playMeow(ctx, emitter.input, now + 0.02, rand);
        shots.push({ kind: 'meow', emitter, end: end + 0.1 });
      }
    }

    // Ambient trickle of distant songs (owl hoots at night)
    const rate = frame.night ? owl : activity;
    if (rate > 0.03) {
      if (ambientTimer < 0) ambientTimer = exp(frame.night ? OWL_MEAN_S / rate : AMBIENT_MEAN_S / rate);
      ambientTimer -= dt;
      if (ambientTimer <= 0) {
        if (count('ambient') < MAX_AMBIENT_SONGS) {
          const ang = rand() * Math.PI * 2;
          const r = randRange(rand, AMBIENT_MIN_M, AMBIENT_MAX_M);
          spawnSong('ambient', frame.night ? 'owl' : pickSpecies(rand, frame.timeOfDay), l.x + Math.cos(ang) * r, l.z + Math.sin(ang) * r);
        }
        ambientTimer = exp(frame.night ? OWL_MEAN_S / rate : AMBIENT_MEAN_S / rate);
      }
    } else {
      ambientTimer = -1;
    }

    // Dogs
    const seen = new Set<number>();
    for (const p of frame.pedestrians) {
      const d = p.dog;
      if (!d) continue;
      seen.add(p.id);
      const active = activeBark.get(p.id);
      if (active) active.emitter.setPosition(d.x, 0.6, d.z);
      const dist = Math.hypot(d.x - l.x, d.z - l.z);
      if (!(dist <= DOG_RANGE_M)) continue; // cheap range gate: far dogs do not tick
      let st = dogs.get(p.id);
      if (!st) {
        st = { timer: nextBark(DOG_MEAN_S) };
        dogs.set(p.id, st);
      }
      st.timer -= dt;
      if (st.timer > 0) continue;
      if (count('bark') >= MAX_BARKERS || active) {
        st.timer = 3 + rand() * 4;
        continue;
      }
      const emitter = bus.createEmitter({ category: 'dog', x: d.x, y: 0.6, z: d.z, refDistance: 4, maxDistance: 160 });
      const voice = dogVoice(p.id);
      const barks = 2 + Math.floor(rand() * 3);
      const end = playBarks(ctx, emitter.input, now + 0.02, voice, barks, rand);
      const shot: Shot = { kind: 'bark', emitter, end: end + 0.1, dogId: p.id };
      shots.push(shot);
      activeBark.set(p.id, shot);
      let mean = DOG_MEAN_S;
      for (const v of frame.vehicles) {
        if (v.speed > DOG_VEHICLE_SPEED && Math.hypot(v.x - d.x, v.z - d.z) < DOG_VEHICLE_M) {
          mean *= 0.5;
          break;
        }
      }
      st.timer = nextBark(mean);
    }
    for (const id of [...dogs.keys()]) if (!seen.has(id)) dogs.delete(id);
  }

  return {
    name: 'animals',
    update,
    dispose() {
      for (const s of shots) release(s);
      shots.length = 0;
      activeBark.clear();
      dogs.clear();
    },
  };
}

export const createAnimalSounds: SoundSystemFactory = (ctx, bus) => createAnimalSoundsWith(ctx, bus);
