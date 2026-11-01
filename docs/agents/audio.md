# Audio specialist
Reviewed 2026-11-01 at 02b0cdc

**Owns:** `src/audio/**`, `src/ui/SoundMixer.tsx`, `src/scene/audioBridge.ts`, `docs/AUDIO.md` and the audio tests (`tests/audio*.test.ts`, `tests/helpers/fakeAudio.ts`).

**Tuning rule:** tunable levels, ranges, intervals, windows and mixer defaults live in the `audio` section of `src/config/tuning.ts`; modules import them (`audio as audioTuning`) and keep the exported const names. Synthesis and algorithm constants (partials, filter shapes) stay local.

## Architecture (see `docs/AUDIO.md`)
- `index.ts` facade: `init`, `update(frame)`, `setSoundEnabled`, volumes, `dispose`. Context -> master -> limiter (DynamicsCompressor, threshold -9 dB, ratio 12) -> destination.
- `bus.ts` `AudioBus`: category buses (engine, horn, indicator, voice, footstep, bird, wing, dog, cat, leaves, wind, rain, thunder, ambience, aircraft, music), groups (effects, nature, music), emitters = panner + distance lowpass.
- Sound systems (`vehicles`, `people`, `animals`, `nature`, `rain`, `weather`, `aircraft`, `music`) each own their emitters and are listed in `systems.ts`.
- `frame.ts` `AudioFrame` is built each frame by `scene/audioBridge.ts` (pooled, no allocation). The listener comes from `audio/listener.ts`.

## Conventions
- Everything is object oriented and positional: one emitter per source, never a mixed track. Procedural synthesis only (no sound files).
- Listener (`listenerFromCamera`): above `STREET_HEIGHT = 8` m the listener stands on the ground point the camera looks at (ray to y = 0, at most `MAX_RAY = 400` m, ear height `EAR_HEIGHT = 2` m); at or below 8 m it is the camera itself. Forward is camera yaw only.
- `VoiceBudget` (`audio/voiceBudget.ts`) keeps the nearest N voices, with hysteresis: a candidate displaces a holder only when clearly nearer.
- Schedule on `ctx.currentTime` look-ahead; fade in/out to avoid clicks.

## Traps
- **HMR leaks AudioContexts** (the radio hiss after Sound off): `init` closes the previous `window.__mwAudioContext`, and `import.meta.hot.dispose` calls `dispose()`.
- Passing a plain object to `camera.getWorldDirection` crashed at runtime although tsc and unit tests passed: test in the browser.
- Sound and Music are separate: Sound off silences effects and nature, never music; master mute is separate.
- Aerial mode (camera above `AERIAL_HEIGHT_M = 45` m): only birds, wing flaps, rain, thunder, aircraft and music are heard.
- Constant leaf noise came from a loop with a floor level. Leaves are one-shot rustle bursts on the nearest trees (`RUSTLE_TREES = 3`), countdown 3 to `RUSTLE_INTERVAL_MAX_S = 12` s, only when wind >= `RUSTLE_MIN_WIND = 1.5` m/s.
- Fake AudioContext in tests needs every node factory you use (`createWaveShaper`, ...).

## Decisions
- Rain: only tin-roof "pit-pat" plus puddle plips at 30% (`PUDDLE_LEVEL = 0.3`, `rain.ts`). Thunder x2 loudness, x1.3 length. Bus air brake 0.4 (`AIR_BRAKE_LEVEL`, `vehicles.ts`). Dogs bark about once per 900 s (`DOG_MEAN_S = 900`, `animals.ts`). Horn request rules (cooldowns, gap, chance) are owned by traffic: `src/traffic/vehicles/constants.ts`. Crickets on (`CRICKETS_ENABLED = true`, `nature.ts`), only 22:00-05:00 on the in-app clock (`cricketDensity(hour, season, rain)`; summer full, autumn half), and silent in the aerial view (camera above `AERIAL_HEIGHT_M` = 45 m, `listener.ts`).
- Aircraft (`aircraft.ts`): Doppler clamp 0.85-1.15, at most `AIRCRAFT_MAX_VOICES = 2` voices, reference distance `AIRCRAFT_REF_DISTANCE = 250` m, max distance 2500 m.

## Open items
- Balance and sound quality are not verified by ear beyond the user's listening feedback. Balance changes come from user listening.

## Verify
`npx vitest run tests/audio*.test.ts`; render a system in an `OfflineAudioContext` in the dev page and check the peak (< 0.5) and no NaN.

## Scope notes
- `src/scene/audioBridge.ts`, `tests/audio*.test.ts` and `tests/helpers/fakeAudio.ts` are Audio-owned (lead decision, phase 2). Scope questions go to the lead before editing other areas.
- Last commit touching `src/audio`: `251fe15` (aircraft sound, cloud shadows).
