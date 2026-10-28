# Audio architecture (Round 5)

All sound is synthesised with Web Audio (no audio files), object-oriented, separate and positional.
Every sound belongs to a scene object, has its own node chain and its own `PannerNode` at the object's
position, and is never mixed into a shared looping track. The listener is the camera view.

## Graph

```
source (osc / noise) -> Emitter.input (gain) -> distance lowpass -> PannerNode (equalpower, inverse)
   -> category bus (GainNode) -> group gain -> zoom gain -> master -> destination
```

- `src/audio/bus.ts`: `AudioBus`, `Emitter`, categories, groups, volumes. Re-exports `VoiceBudget`.
- `src/audio/voiceBudget.ts`: `VoiceBudget<T>`.
- `src/audio/listener.ts`: `listenerFromCamera`, `ListenerState`.
- `src/audio/math.ts`: pure maths (`distanceGain`, `distanceLowpassHz`, `dopplerRatio`, `equalPowerPan`, `zoomAttenuation`).
- `src/audio/synth.ts`: `makeNoiseBuffer`, `startLoopingNoise`, `playNoiseBurst`, `playTone`, `createRandom`, `randRange`.
- `src/audio/frame.ts`: `AudioFrame`, `SoundSystem`, `SoundSystemFactory` (the contract).
- `src/audio/systems.ts`: registry array `SOUND_SYSTEM_FACTORIES`.
- `src/audio/index.ts`: facade used by the app (`init`, `update`, volumes, mute, weather shims).
- `src/audio/weather.ts`: legacy rain bed, wind swell and thunder (non-positional, to be replaced by `rain.ts` / `nature.ts` and a positional thunder).

## Coordinates and units

World axes are Three.js: x east, y up, z south. Metres, seconds, radians, m/s. Web Audio uses the same
right-handed axes, so world positions go straight into `setPosition`. Ear height is 2 m; put emitters at
the source (vehicle roof ~1 m, bird in the canopy ~6 m, church bell ~25 m).

Listener: when the camera is above 8 m it stands on the ground point the camera looks at (ray to y = 0,
at most 400 m from the camera, y = 2); at or below 8 m it is the camera itself. Forward is camera yaw
only. Overall level falls as the view rises: `max(0.12, 1/(1+height/150))`.

## AudioFrame

Built once per render frame by the scene and passed to `audio.update(frame)`.

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
| `pedestrians` | `{id, x, z, speed, pose, umbrella, dog: {x,z,speed}\|null}` |
| `trees` | street trees `{x, z, scale}` |
| `church` | `{x, z}` or null |
| `lifeEvents` | `{type: 'pigeon-scatter'\|'bird-call'\|'cat-meow', x, z}` from `src/life/common.ts` |
| `thunder` | claps due this frame `{angle, distance, strength}` |
| `horns` | horn requests from traffic this frame `{x, z, cls}` |
| `aircraft` | airliners in the air `{id, x, y, z, vx, vy, vz}` (optional; empty while paused) |

Ids must be stable for the life of the object; sources key their emitters on them.

## Adding a sound source

1. Edit only your own file (for example `src/audio/animals.ts`) and export a `SoundSystemFactory`:

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

2. Per object: `const e = bus.createEmitter({ category: 'engine', x, y, z, refDistance, maxDistance, rolloff })`,
   connect sources to `e.input`, call `e.setPosition(...)` every frame and `e.setGain(...)` for state.
   `e.dispose()` disconnects the whole chain. Stop and disconnect your own oscillators/buffer sources too.
3. Use `VoiceBudget` to keep the N nearest objects voiced (assignment is stable: a newcomer must be
   `hysteresis` (default 20%) nearer to steal a voice). Release callbacks must dispose emitters.
4. Use `synth.ts` helpers for one-shots (`playNoiseBurst`, `playTone` clean up their nodes). Looping
   sources: `startLoopingNoise`, or your own oscillators. Pitch effects: `dopplerRatio` on `playbackRate` / `frequency`.
5. Non-positional beds (music, weather) may connect to `bus.category('music')` directly.
6. Register the factory in `systems.ts` (already listed for the six stubs). `audio.update` wraps each
   system in try/catch with a one-time warning, but systems must still guard against NaN inputs.
7. Do not create nodes per frame; create on acquire, reuse, dispose on release. No `Math.random()` for
   anything persistent: audio is runtime-only, so it is allowed for timing and variation.

## Categories and volumes

Categories: engine, horn, indicator, voice, footstep, aircraft, bird, wing, dog, cat, leaves, wind, rain, thunder,
ambience, music. Groups: effects (engine, horn, indicator, voice, footstep, dog, cat, aircraft), nature (bird, wing,
leaves, wind, rain, thunder, ambience), music (music). API (facade): `setMasterVolume`, `setGroupVolume`,
`setCategoryVolume`, `setVolumes(partial)`, `getGroupVolumes()` returning plain 0..1 numbers
(`{master, groups, categories}`) for persistence. Values set before `init()` are kept and applied on init.
`setSoundEnabled(false)` mutes the master and stops `update` work.

## Planned sounds

| Sound | Source object | System file | Trigger | Category |
|---|---|---|---|---|
| Engine | each of the nearest 8 vehicles, per class | `vehicles.ts` | speed, accel, class; doppler | engine |
| Horn | vehicle at the requested position | `vehicles.ts` | `frame.horns` | horn |
| Turn-indicator tick | vehicle with indicator on | `vehicles.ts` | `indicator != 0` | indicator |
| People talking | pedestrians/groups (nearest 5) | `people.ts` | standing/slow walkers | voice |
| Footsteps | nearest 5 walkers | `people.ts` | `speed`, surface | footstep |
| Rain on umbrellas | pedestrians with `umbrella` | `people.ts` | `rain` and `umbrella` | rain |
| Bird song | street trees (day) | `animals.ts` | `timeOfDay`, `season`, `night` | bird |
| Wing flaps | birds, pigeon scatter | `animals.ts` | `lifeEvents` `pigeon-scatter` | wing |
| Bird call | position of the event | `animals.ts` | `lifeEvents` `bird-call` | bird |
| Dog bark | `pedestrian.dog` | `animals.ts` | random, dog `speed` | dog |
| Cat meow | event position | `animals.ts` | `lifeEvents` `cat-meow` | cat |
| Leaf rustle | street trees | `nature.ts` | `windSpeed`, `gust`, `season` | leaves |
| Wind whistle | wind, occasional | `nature.ts` | strong `windSpeed` | wind |
| Crickets | disabled (`CRICKETS_ENABLED`) | `nature.ts` | - | ambience |
| Church bell | church | `nature.ts` | on the hour, near `church` | ambience |
| Rain pit-pat | ground/roofs around listener | `rain.ts` | `rain` | rain |
| Thunder | direction/distance from listener | `weather.ts` now, later positional | `frame.thunder` | thunder |
| Jet pass | each airliner (nearest 2) | `aircraft.ts` | `frame.aircraft`; doppler from radial speed | aircraft |
| Generative music | none (non-positional) | `music.ts` | Music button, time of day | music |

## Compatibility shims (remove once Town.tsx is updated)

`setVehicleNearby`, `setWind`, `tick` are no-ops. `setWeatherSound(rain, swell)` and
`playThunder(distance, strength)` still drive the legacy non-positional rain bed and thunder in `weather.ts`
(routed through the `rain` and `thunder` category buses so the volumes apply).

## Aircraft (jet pass)

`src/audio/aircraft.ts` voices the airliners flown by `src/aircraft`. The scene fills `AudioFrame.aircraft`
from `aircraft.audioSources()` (position and velocity, pooled); it is empty while the simulation is paused.

- One bus emitter per aircraft in category `aircraft` (Effects group, own "Aircraft" mixer slider), at most
  `AIRCRAFT_MAX_VOICES` = 2 voiced (nearest first, `VoiceBudget`). The planes fly 190-300 m up and are heard
  from up to 1 km, so the emitter uses `refDistance` 250 m and `maxDistance` 2500 m (inverse model); the bus
  adds the distance lowpass (air absorption) and equal-power panning that follows the plane.
- The voice (`buildJetVoice`, works on an `OfflineAudioContext` too) is looped brown noise through a 260 Hz
  lowpass (rumble), pink noise through a 1.1 kHz bandpass (whoosh) and two quiet detuned sines (780 and
  1010 Hz) whose level drifts with a slow LFO. `jetDoppler` turns the radial speed into a 0.85..1.15 ratio that
  scales `playbackRate`, the whine frequencies and the filter cutoffs. Overall level is `JET_GAIN` = 0.55.
- Voices fade in over 3 s and out over 2.5 s (a released voice is kept until silent, then disposed), so there
  are no clicks; nothing starts when `frame.dt` is 0.
- The aerial mode in `index.ts` (camera above 45 m) lets the aircraft system through (`quietFrame` keeps
  `frame.aircraft`); from the overview it is quieter only through distance and the zoom attenuation.
