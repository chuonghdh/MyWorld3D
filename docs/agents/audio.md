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

## Session 2026-11-04 (film audio plan)
Plan only; no source edits. Goal: sound follows a film viewpoint (manual camera or auto bird), mix follows user volumes, recording includes sound.

### Findings (file:line)
- Listener hard switch at 8 m: `listener.ts:50-62`. At h <= 8 the listener is the camera; above, it is the ground point the camera looks at (up to `MAX_RAY` 400 m away, y = 2). A jump of up to 400 m across one frame.
- Aerial gate is a step at 45 m: `index.ts:115-117` (`quietFrame`). Ground systems release voices (fade 0.4-0.5 s: `vehicles.ts:476`, `people.ts:275`), so a bird crossing 45 m loses all street sound on a fixed edge.
- Zoom from camera height: `math.ts:40`, applied `bus.ts:221` (smoothed 0.1 s). 300 m gives x0.33 (-9.6 dB) on everything, regardless of source distance.
- Inverse model, default ref 4 / max 250 / rolloff 1 (`bus.ts:293-295`). Gain is clamped beyond max (flat, not silent). Bird: ref 8, max 160, rolloff 1.2 (`animals.ts:556`): gain 0.042 (-27 dB) at any distance >= 160 m, but the air lowpass (`math.ts:17`) still falls to 1.2 kHz at 300 m.
- Bird songs sit at fixed `BIRD_Y` = 6 m (`animals.ts:30`), so a bird at 100 m sounds ground level. The film bird has no emitter.
- Aircraft: ref 250, max 2500 (`aircraft.ts:15-16`), voice budget max 3000 (`aircraft.ts:165`). Gain floor at 2500 m = 0.1.
- Listener has no velocity (no Doppler for listener motion). Orientation is yaw only (`listener.ts:44`).
- `index.ts:109`: `ctx.state !== 'running'` returns early, so a suspended context gives silent frames with no error.
- `useTownFrame.ts:171`: `setSoundEnabled(soundEnabled && !paused)`; paused simulation mutes all effects and nature.
- Tests run in vitest `node` (`vite.config.ts`). `fakeAudio` checks graph and params only; peak and NaN need an `OfflineAudioContext` in the browser.

### Plan
1. Pure `listenerOverride.ts`: blend camera vs. ear-ground listener with `smoothstep` over a band around 8 m; one-pole smoother for position and yaw forward.
2. `audioBridge.fill` takes an optional `listenerOverride`; `index.ts` gets `setListenerOverride(state | null)`. `null` must be bit-identical to today.
3. Aerial gate: ground categories go through a new `ground` gain node ramped by smoothed height with a hysteresis band around 45 m. Bird, wing, rain, thunder, aircraft and music stay ungated.
4. Recording: real-time tap. `limiter -> MediaStreamAudioDestinationNode` in addition to `destination`; video from `canvas.captureStream(fps)`; `MediaRecorder` for both. The tap sits after master, so sliders, Sound and Music switches follow. Film mode uses fixed `dt = 1/fps`.
5. Rejected for now: `OfflineAudioContext` re-render from a frame log (duplicates every system, needs seeded replay and deterministic video).

### New knobs (`src/config/tuning/audio.ts`, each: TUNING.md row + tuningParity entry)
- `filmListenerSmoothS` 0.25 s, `filmListenerBlendM` 12 m, `aerialBlendM` 6 m, `groundFadeS` 1.5 s, `filmFadeS` 0.5 s, `filmZoomFloor` 0.5, `birdRangeM` (moves `BIRD_MAX_M` 160 from `animals.ts`).

### Tests
- vitest + fakeAudio: listener step per 1/60 s bounded across 7.5-8.5 m and 44-46 m; smoother never overshoots; ground ramp endpoints; tap connected after limiter; suspended context makes `update` a no-op; new knobs in parity test.
- Distance gain along a circular bird path (pure `distanceGain` + `distanceLowpassHz`): peak at closest approach, monotone with distance.
- Peak < 0.5 and no NaN: `OfflineAudioContext` render on the dev page (60 s film path).
- A/V sync: clap marker, offset < 40 ms.

### Phases
P1 listener math + smoother (golden test: manual camera poses outside the band unchanged). P2 override plumbing (null path identical). P3 ground node and aerial ramp (no step at 45 m). P4 recorder tap (webm has audio; sync < 40 ms; stops when tab hidden). P5 knobs, docs, parity, dev render check, user listening pass.

### Risks
- Balance by ear: not judged here. Only user listening and offline peak/RMS numbers.
- HMR: recorder and tap must be disposed in `dispose()` and `import.meta.hot.dispose`.
- Autoplay: resume and record only from a click handler (`init()` pattern); watch `statechange`.
- CPU during recording: canvas capture plus encoder on top of live systems; measure frame time at target fps.
- Hidden tab: rAF stops while audio runs, so video and audio diverge. Refuse to record hidden.
- Pause mutes sound (`useTownFrame.ts:171`): a paused film records silence unless decided otherwise.
- Bird songs at fixed 6 m height undermine "bird close to source" at altitude.

### Open questions
- Does the film bird get its own flap/wind sound?
- Should zoom attenuation be exempt in film mode?
- Output format (webm or mp4), resolution, fps?
- Record while paused?
