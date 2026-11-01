# Audio architecture

Reviewed 2026-11-01 at 02b0cdc

All sound is synthesised with Web Audio (no audio files). Every sound belongs to a scene object (or is a
non-positional bed), has its own node chain and, when positional, its own `PannerNode` at the object's
position. Nothing is mixed into a shared looping track. The listener is the camera view.

## Graph

```
source (osc / noise) -> Emitter.input (gain) -> distance lowpass -> PannerNode (equalpower, inverse)
   -> category bus (GainNode) -> group gain -> zoom gain -> master -> limiter -> destination
```

- Limiter: `DynamicsCompressor` (threshold -9 dB, knee 6, ratio 12, attack 3 ms, release 0.25 s), so storm
  peaks compress instead of clipping.
- Distance lowpass: about 18 kHz at 0 m, falling log-linearly to 1.2 kHz at 300 m, then flat (air absorption).
- Default master volume 0.8; every group and category defaults to 1.

## Files

- `bus.ts`: `AudioBus`, `Emitter`, categories, groups, volumes. Re-exports `VoiceBudget`.
- `voiceBudget.ts`: `VoiceBudget<T>` (N nearest voiced, `hysteresis` default 0.2, optional `maxDistance`).
- `listener.ts`: `listenerFromCamera`, `ListenerState`.
- `math.ts`: pure maths (`distanceGain`, `distanceLowpassHz`, `dopplerRatio`, `equalPowerPan`, `zoomAttenuation`).
- `synth.ts`: `makeNoiseBuffer`, `startLoopingNoise`, `playNoiseBurst`, `playTone`, `createRandom`, `randRange`.
- `frame.ts`: `AudioFrame`, `SoundSystem`, `SoundSystemFactory` (the contract).
- `systems.ts`: registry `SOUND_SYSTEM_FACTORIES` (vehicles, people, animals, nature, rain, music, aircraft).
- `index.ts`: facade used by the app (`init`, `isReady`, `update`, `setSoundEnabled`, volumes, `dispose`).
- `weather.ts`: positional thunder (`createThunderSounds`), run by the `rain` system.

## Coordinates and listener

World axes are Three.js: x east, y up, z south. Metres, seconds, radians, m/s. Web Audio uses the same axes,
so world positions go straight into `setPosition`. Put emitters at the source (vehicle ~1 m, bird ~6 m,
church bell 25 m).

- Camera at or below 8 m: the listener is the camera itself.
- Camera above 8 m: the listener stands at ear height 2 m on the ground point the camera looks at (ray to
  y = 0, at most 400 m). If the camera does not look down, it stands 'camera height' metres ahead on the
  yaw forward vector.
- Forward is camera yaw only.
- Overall level falls as the view rises: `max(0.12, 1/(1+height/150))` (`zoomAttenuation`).

## AudioFrame

Built once per render frame by `src/scene/audioBridge.ts` (pooled, no allocation in steady state) and passed
to `audio.update(frame)`.

| Field | Meaning |
|---|---|
| `dt` | seconds since last frame |
| `listener` | `ListenerState` from `listenerFromCamera` |
| `timeOfDay` | clock hours 0..24 |
| `season` | `'spring' \| 'summer' \| 'autumn' \| 'winter'` |
| `windSpeed`, `gust` | m/s; gust strength 0..1 |
| `rain` | 0..1 |
| `night` | boolean |
| `vehicles` | `{id, x, z, heading, cls, speed, accel, braking, indicator}`; `cls` is `car\|bus\|truck\|motorbike`, `indicator` is -1/0/1 |
| `pedestrians` | `{id, x, z, speed, pose, umbrella, dog: {x,z,speed}\|null}`; `pose` is the numeric `POSE_*` id (walk 0, stand 1, chat 2, sit 3) or its name |
| `trees` | street trees `{x, z, scale}` |
| `church` | `{x, z}` or null |
| `lifeEvents` | `{type: 'pigeon-scatter'\|'bird-call'\|'cat-meow', x, z}` |
| `thunder` | claps due this frame `{angle, distance, strength}` (delay already applied) |
| `horns` | horn requests this frame `{x, z, cls}` |
| `aircraft` | airliners in the air `{id, x, y, z, vx, vy, vz}` (optional; empty while paused) |
| `musicEnabled` | Music button state; the music system fades over 2 s |

Ids must be stable for the life of the object; sources key their emitters on them.

## Adding a sound source

1. Edit only your own file and export a `SoundSystemFactory`:

```ts
export const createAnimalSounds: SoundSystemFactory = (ctx, bus) => {
  const budget = new VoiceBudget<AudioPedestrian>({
    max: 5,
    onAcquire: (id, p) => { /* create emitter + sources */ },
    onRelease: (id) => { /* stop sources, emitter.dispose() */ },
  });
  return {
    name: 'animals',
    update(frame) { /* budget.update(candidates); move emitters; trigger one-shots */ },
    dispose() { budget.clear(); },
  };
};
```

2. Per object: `const e = bus.createEmitter({ category, x, y, z, refDistance, maxDistance, rolloff })`, connect
   sources to `e.input`, call `e.setPosition(...)` each frame and `e.setGain(...)` for state. `e.dispose()`
   disconnects the chain; stop your own oscillators and buffer sources too.
3. Use `VoiceBudget` to voice the N nearest objects. Release callbacks must dispose emitters.
4. Use `synth.ts` helpers for one-shots. Pitch effects: `dopplerRatio` on `playbackRate` / `frequency`.
5. Non-positional beds (music) connect to `bus.category('music')` directly.
6. Register the factory in `systems.ts`. `audio.update` wraps each system in try/catch with a one-time warning.
7. Do not create nodes per frame: create on acquire, reuse, dispose on release.

## Categories, groups and volumes

Categories (16): engine, horn, indicator, voice, footstep, dog, cat, aircraft, bird, wing, leaves, wind, rain,
thunder, ambience, music.

| Group | Categories | Mixer |
|---|---|---|
| effects | engine, horn, indicator, voice, footstep, dog, cat, aircraft | Effects slider |
| nature | bird, wing, leaves, wind, rain, thunder, ambience | Nature slider |
| music | music | Music slider |

Facade API (`index.ts`): `setMasterVolume`, `setGroupVolume`, `setCategoryVolume`, `setVolumes(partial)`,
`getGroupVolumes()` (plain 0..1 numbers `{master, groups, categories}` for persistence). Values set before
`init()` are kept and applied on init.

`setSoundEnabled(on)` is the Sound switch: when off, the effects and nature group gains fade to 0 and the
update loop skips every system except `music`. Music has its own switch (`frame.musicEnabled`).

## Mixer (`src/ui/SoundMixer.tsx`)

- Group sliders, whole percent 0..100: Master (default 80), Effects (100), Nature (100), Music (100).
  Layout: Master, then Effects and Nature side by side, then Music.
- "Each sound" (collapsed `<details>`): one slider per category, 100 by default.
  - Effects: Engines, Horns, Turn signals, Voices, Footsteps, Dogs, Cats, Aircraft.
  - Nature: Birdsong, Wing flaps, Leaves, Wind, Rain, Thunder, Church bells & crickets.
- Storage: `myworld3d.mixer.v1` (master, effects, nature, music) and `myworld3d.mixer.sounds.v1` (per-sound).
  Corrupt or missing storage falls back to defaults. Levels are applied at module load, before the panel opens.

## Sound systems

Positional unless noted. Distances in metres. Each system's `name` is its registry key.

| Sound | Source | System file (`name`) | Trigger and limits | Category |
|---|---|---|---|---|
| Engine | nearest vehicles, up to 8 voiced (within 120 m) | `vehicles.ts` (`vehicles`) | speed, accel, class; Doppler; braking adds air-brake level 0.4 | engine |
| Turn-signal tick | vehicles with indicator on, up to 6 (within 60 m), 1.5 Hz | `vehicles.ts` | `indicator != 0` | indicator |
| Horn | vehicle position, within 220 m, up to 4 concurrent | `vehicles.ts` | `frame.horns`. Requests are rate-limited in traffic (`src/traffic/vehicles/constants.ts`: 45 s per vehicle, 6 s city-wide, 50 %) | horn |
| Voices | standing and chatting pedestrians, up to 4 (within 30 m) | `people.ts` (`people`) | pose `chat` / `stand` | voice |
| Footsteps | walkers faster than 0.3 m/s, up to 5 (within 28 m) | `people.ts` | `speed`; wet steps in rain | footstep |
| Umbrella rain | pedestrians with `umbrella`, up to 4 (within 25 m) | `people.ts` | `rain` > 0.15 | rain |
| Birdsong | bird-call events (up to 4 songs); ambient trickle 20-90 m (up to 3); owls at night | `animals.ts` (`animals`) | `lifeEvents`, `timeOfDay`, `season`, `rain` | bird |
| Wing flaps | 3-6 birds, at most 3 flaps at once | `animals.ts` | `pigeon-scatter` events | wing |
| Dog bark | each dog within 120 m, at most 3 barking; about once per 900 s, twice as often near a fast vehicle | `animals.ts` | `pedestrian.dog` | dog |
| Cat meow | `cat-meow` events, at most 3 | `animals.ts` | `lifeEvents` | cat |
| Leaf rustle | one-shot bursts every 8-12 s from up to 5 trees within 70 m | `nature.ts` (`nature`) | wind >= 1.5 m/s, scaled by wind, gust and season (no constant hiss) | leaves |
| Wind whistle | up to 2 at a time, 15-70 m | `nature.ts` | wind >= 8 m/s | wind |
| Church bell | 25 m up at the church, within 400 m | `nature.ts` | hour strikes | ambience |
| Crickets | 22:00-05:00 on the in-app clock only; up to 4 (within 10-60 m); summer full, autumn half, none otherwise; fade out with rain | `nature.ts` | `frame.timeOfDay`, `season`, `rain`; `CRICKETS_ENABLED = true` | ambience |
| Rain drops | up to 10 emitters, 3-60 m around the listener; tin-roof plinks, puddle plips (18 %, rain > 0.25, level 0.3) | `rain.ts` (`rain`) | `rain` > 0.05 | rain |
| Rain bed | 4 pink-noise emitters 45-105 m out | `rain.ts` | `rain` > 0.05 | rain |
| Thunder | one emitter per clap at listener + direction * min(distance, 450), 60 m up; gain x2, length x1.3 | `weather.ts` via `rain.ts` | `frame.thunder` | thunder |
| Jet pass | each airliner, nearest 2 | `aircraft.ts` (`aircraft`) | `frame.aircraft`; Doppler from radial speed | aircraft |
| Generative music | none (non-positional) | `music.ts` (`music`) | `musicEnabled` (2 s fade), time of day; ducked to 0.55 for a few seconds after thunder; level 0.8 | music |

Music moods follow the hour: day (about 72 bpm, C major pentatonic), golden (about 54 bpm, F major), night
(about 38 bpm, D Dorian). They crossfade.

## Aerial mode

`index.ts`: when the camera is above 45 m (`AERIAL_HEIGHT_M`), the ground systems get a quiet frame (no
vehicles, pedestrians, trees, church, life events, horns, wind or night). Rain, thunder, aircraft and music
keep playing. Crickets stay silent (ground-only). The bird system gets only bird-call and pigeon-scatter events (no dogs, no cats). From the
overview, ground sound is quieter only through distance and the zoom attenuation.

## Aircraft (jet pass)

`src/audio/aircraft.ts` voices the airliners flown by `src/aircraft`. The scene fills `AudioFrame.aircraft`
from `aircraft.audioSources()` (pooled); it is empty while the simulation is paused.

- One bus emitter per aircraft in category `aircraft` (effects group). At most `AIRCRAFT_MAX_VOICES` = 2
  voiced, nearest first. `refDistance` 250 m, `maxDistance` 2500 m (inverse model). The bus adds the distance
  lowpass (air absorption) and equal-power panning.
- The voice (`buildJetVoice`, also works on an `OfflineAudioContext`): brown noise through a 260 Hz lowpass
  (rumble), pink noise through a 1.1 kHz bandpass (whoosh), and two detuned sines (780 and 1010 Hz) whose level
  drifts with an LFO. `jetDoppler` maps radial speed to a 0.85..1.15 ratio applied to `playbackRate`, the whine
  frequencies and the filter cutoffs. `JET_GAIN` = 0.55.
- Voices fade in over 3 s and out over 2.5 s; a released voice is kept until silent, then disposed. Nothing
  starts when `frame.dt` is 0.

## Tests

`tests/audio*.test.ts` (aircraft, animals, bus, math, mixer, music, nature, people, rain, vehicles, weather) and
`tests/helpers/fakeAudio.ts`. The fake AudioContext must implement every node factory the code uses.
