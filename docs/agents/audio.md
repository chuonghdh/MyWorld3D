# Audio specialist

**Owns:** `src/audio/**`, `src/ui/SoundMixer.tsx`, `src/scene/audioBridge.ts`, `docs/AUDIO.md` and the audio tests (`tests/audio*.test.ts`, `tests/helpers/fakeAudio.ts`).

## Architecture (see `docs/AUDIO.md`)
- `index.ts` facade: `init`, `update(frame)`, `setSoundEnabled`, volumes, `dispose`. Context -> master -> limiter (DynamicsCompressor) -> destination.
- `bus.ts` `AudioBus`: category buses (engine, horn, indicator, voice, footstep, bird, wing, dog, cat, leaves, wind, rain, thunder, ambience, aircraft, music), groups (effects, nature, music), emitters = panner + distance lowpass.
- Sound systems (`vehicles`, `people`, `animals`, `nature`, `rain`, `weather`, `aircraft`, `music`) each own their emitters and are listed in `systems.ts`.
- `frame.ts` `AudioFrame` is built each frame by `scene/audioBridge.ts` (pooled, no allocation).

## Conventions
- Everything is object oriented and positional: one emitter per source, never a mixed track. Procedural synthesis only.
- Listener: ground focus point above 8 m, camera below. `VoiceBudget` keeps the nearest N voices with hysteresis.
- Schedule on `ctx.currentTime` look-ahead; fade in/out to avoid clicks.

## Traps
- **HMR leaks AudioContexts** (the radio hiss after Sound off): `init` closes the previous `window.__mwAudioContext`, and `import.meta.hot.dispose` calls `dispose()`.
- Passing a plain object to `camera.getWorldDirection` crashed at runtime although tsc and unit tests passed: test in the browser.
- Sound and Music are separate: Sound off silences effects and nature, never music; master mute is separate.
- Aerial mode (camera above 45 m): only birds, wing flaps, rain, thunder, aircraft and music are heard.
- Constant leaf noise came from a loop with a floor level: leaves are one-shot bursts every 8-12 s scaled by wind (>= 1.5 m/s).
- Fake AudioContext in tests needs every node factory you use (`createWaveShaper`, ...).

## Decisions
- Rain: only tin-roof "pit-pat" plus puddle plips at 30% (`PUDDLE_LEVEL`). Thunder x2 loudness, x1.3 length. Bus air brake 0.4 (`AIR_BRAKE_LEVEL`). Dogs bark about once per 900 s (`DOG_MEAN_S`). Horns: 45 s cooldown, 6 s gap, 50% chance. Crickets disabled (`CRICKETS_ENABLED`).
- Aircraft: Doppler clamp 0.85-1.15, at most 2 voices, reference distance 250 m.

## Open items
- Nothing heard by ear yet beyond the user's feedback; balance changes come from user listening.

## Verify
`npx vitest run tests/audio*.test.ts`; render a system in an `OfflineAudioContext` in the dev page and check the peak (< 0.5) and no NaN.

Session 2026-11-01: no changes in owned area (src/audio, src/ui/SoundMixer.tsx, docs/AUDIO.md). Scope confirmed by lead: `src/scene/audioBridge.ts` and `tests/audio*.test.ts`, `tests/helpers/fakeAudio.ts` are Audio-owned (listed in Owns above). No code change, no commit.
