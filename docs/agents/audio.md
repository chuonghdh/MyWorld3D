# Audio specialist
Reviewed 2026-11-09 (Audio specialist; doc claims checked against code, see "Review 2026-11-09")

**Owns:** `src/audio/**`, `src/ui/SoundMixer.tsx`, `src/scene/audioBridge.ts`, `docs/AUDIO.md` and the audio tests (`tests/audio*.test.ts`, `tests/helpers/fakeAudio.ts`).

**Tuning rule:** tunable levels, ranges, intervals, windows and mixer defaults live in the `audio` section of `src/config/tuning/` (`audio.ts`; film audio knobs in `film.ts`); modules import them (`audio as audioTuning`) and keep the exported const names. Synthesis and algorithm constants (partials, filter shapes) stay local. Status: NOT fully followed, see Open items.

## Architecture (see `docs/AUDIO.md`)
- `index.ts` facade: `init`, `update(frame)`, `setSoundEnabled`, volumes, `uiCue`, `getRecordStream`, `dispose`. Context -> master -> limiter (`mixChain.ts`: DynamicsCompressor, threshold -9 dB, knee 6, ratio 12) -> destination. Panel cues bypass master and limiter (own gain to destination).
- `bus.ts` `AudioBus`: category buses (16: engine, horn, indicator, voice, footstep, bird, wing, dog, cat, aircraft, leaves, wind, rain, thunder, ambience, music), groups (effects, nature, music), emitters = panner + distance lowpass.
- Sound systems (`vehicles`, `people`, `animals`, `nature`, `rain`, `music`, `aircraft`) each own their emitters and are listed in `systems.ts`. `weather.ts` (thunder) is not in the registry: `rain.ts` creates and runs it.
- `route.ts` `routeFrame` is the one place for Sound switch, aerial gate and music switch; the live update and the film render both use it.
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
- Fake AudioContext in tests needs every node factory you use. `tests/helpers/fakeAudio.ts` has no `createWaveShaper`; `animalsVoices.ts` (`playBarks` grit, dog bark) needs it. `tests/audioAnimals.test.ts` has its own fake with it (line 62) and covers barks. No test that uses `fakeAudio` reaches the bark path (latent gap).

## Decisions
- Rain: mostly tin-roof "pit-pat"; puddle plips are 18% of drops, only when rain > 0.25, at level `PUDDLE_LEVEL = 0.3` (`rain.ts`; level from `audio.puddleLevel`). Thunder x2 loudness, x1.3 length. Bus and truck air brake 0.4 (`AIR_BRAKE_LEVEL`, `vehiclesCore.ts`). Dogs bark about once per 900 s (`DOG_MEAN_S = 900`, `animalsPure.ts`), half that near a fast vehicle. Horn request rules (cooldowns, gap, chance) are owned by traffic: `src/traffic/vehicles/constants.ts`. Crickets on (`CRICKETS_ENABLED = true`, `nature.ts`), only 22:00-05:00 on the in-app clock (`cricketDensity(hour, season, rain)`; summer full, autumn half), and silent in the aerial view (camera above `AERIAL_HEIGHT_M` = 45 m, `listener.ts`).
- Aircraft (`aircraft.ts`): Doppler clamp 0.85-1.15, at most `AIRCRAFT_MAX_VOICES = 2` voices, reference distance `AIRCRAFT_REF_DISTANCE = 250` m, max distance 2500 m.

## Open items
- Balance and sound quality are not verified by ear beyond the user's listening feedback. Balance changes come from user listening.
- **Knobs outside `src/config/tuning/` (CLAUDE.md gap), status 2026-11-09: still open, unchanged since 2026-11-08.** Not moved. Still local as knob-type constants: `AMBIENT_MEAN_S`, `OWL_MEAN_S`, `DOG_MEAN_S`, `DOG_RANGE_M`, `MAX_BARKERS`, `FLAP_BIRDS_MIN/MAX`, `MAX_FLAPS`, `BIRD_MAX_M` (`animalsPure.ts`); `RUSTLE_INTERVAL_MIN_S/MAX_S`, `RUSTLE_MIN_WIND`, `RUSTLE_TREES`, `RUSTLE_NEAREST`, `WHISTLE_MIN_WIND`, `WHISTLE_FULL_WIND`, `WHISTLE_MAX`, `WHISTLE_MIN_M/MAX_M` (`natureCore.ts`); `ENGINE_VOICES`, `ENGINE_MAX_DISTANCE`, `HORN_MAX_DISTANCE`, `HORN_MAX_CONCURRENT` (`vehiclesCore.ts`); `CHAT_VOICES`, `CHAT_MAX_DISTANCE`, `STEP_MAX_DISTANCE`, `UMBRELLA_MAX_DISTANCE`, `RAIN_ON`/`RAIN_OFF` 0.15/0.1 (`peopleCore.ts`); `AIRCRAFT_MAX_VOICES`, `AIRCRAFT_REF_DISTANCE`, `AIRCRAFT_MAX_DISTANCE`, `FADE_IN_S`, `FADE_OUT_S` (`aircraft.ts`); `RAIN_ON` 0.05, `MIN_RADIUS`, `MAX_RADIUS` (`rain.ts`); `THUNDER_MAX_PLACE_DISTANCE`, `THUNDER_HEIGHT` (`weather.ts`); `MAX_EVENT_SONGS`, `MAX_AMBIENT_SONGS`, `AMBIENT_MIN_M/MAX_M` (`animalsPure.ts`). The film-plan knob `birdRangeM` (moves `BIRD_MAX_M`) is not added. Moved since 2026-11-08: none. Decision needed (lead): move these to `audio.ts` with parity tests, or record reasoned exceptions in the guard file.
- Film plan (2026-11-04) P3 (ground-node ramp replacing the 45 m step) and P1/P2 (`listenerOverride.ts`, listener smoothing) are not built. Only the offline render uses the gate bypass.
- The 45 m aerial gate is still a step in live play (`route.ts:37`).
- Real offline render (peak, no NaN) is not run: needs a dev-page render.

## Verify
`npx vitest run tests/audio*.test.ts`; render a system in an `OfflineAudioContext` in the dev page and check the peak (< 0.5) and no NaN for the live path. The film render is scaled to `film.audioPeakTargetDb` (-3 dB) instead, so the < 0.5 check does not apply there.

## Scope notes
- `src/scene/audioBridge.ts`, `tests/audio*.test.ts` and `tests/helpers/fakeAudio.ts` are Audio-owned (lead decision, phase 2). Scope questions go to the lead before editing other areas.
- Last commit touching `src/audio`: `dcb63d5` (harness split, see 2026-11-08 review).

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

## Update 2026-11-04 (lead): levels and recording

- **Master default:** `audio.masterVolumeDefault` is 0.4 (was 0.8). Mixer master default is 40 (was 80) in `audio.mixerDefaults`.
- **Category defaults:** `audio.categoryDefaults` sets the start gain per category: engine, horn, indicator 0.5; voice 0.6; footstep 0.45; dog, cat 0.8; others 1. Applied in `defaultVolumes` (`audio/bus.ts`). Saved user levels override these.
- **Jet gain:** `audio.jetGain` is 1 (was 0.55). Reason: at the overview the jet is about 1000 m away and `AIRCRAFT_REF_DISTANCE` is 250 m, so the level was near silent. If still quiet, the next knob is `AIRCRAFT_REF_DISTANCE` in `audio/aircraft.ts` (a code constant, to move to tuning if changed).
- **Recording audio:** the record tap is after the limiter, so film audio follows the played mix. Verified by `ffmpeg volumedetect` on a film made at ground zoom: mean about -21 dB, peak about -4 dB. At overview the film is nearly silent by design (ground sounds are gated above 45 m).
- **Codec:** the MP4 with AAC needs the quoted codec string (see the architect notes). Without audio tracks the recorder picks video-only MP4.
- **Open:** peak near -4 dB may clip on laptop speakers; the user said it sounds fine but "quá to" when zoomed close to the road. Decide whether to lower film gain (not yet done).

## Session 2026-11-04 (film P4: offline render)
- New `src/audio/offlineRender.ts`: `renderFilmAudio(snapshots, {durationS, soundEnabled, volumes})` renders stereo at 48 kHz through the same bus, mix chain and systems as live. Time advances by `ctx.suspend()` at each snapshot (render quantum), so systems that schedule on `currentTime` work. `Math.random` is seeded for each system call and restored after.
- Hash: FNV-1a over samples rounded to 1e-4 (`measureSamples`), throws on non-finite.
- Shared modules extracted (behaviour unchanged): `mixChain.ts` (master, limiter), `route.ts` (`routeFrame`: Sound switch, aerial bird-only/quiet frames, music switch). `index.ts` re-exports `quietFrame`.
- Film bird: not in `AudioFrame`, so it never reaches the render. Aerial 45 m gate: unchanged in code (step), film fade is still open.
- Offline readiness (grep only, not run): the seven factories in `systems.ts` schedule on `ctx.currentTime`, use no timers and no `ctx.state` checks. Real offline run not verified; needs a dev-page render.
- No new knobs.

## Update 2026-11-04 (audio)

- **New `src/film/audioSnapshot.ts`:** `createAudioSnapshotRecorder(hz = AUDIO_SNAPSHOT_HZ)` returns `{ offer(t, frame), snapshots }`. Samples at 20 Hz film time (risk 12), stores `AudioSnapshot[]` for `renderFilmAudio`. `cloneAudioFrame` deep-copies every field the systems read and sets `dt` to 0.
- **Trap:** `AudioBridge.fill` returns pooled, mutated objects. Without the copy every snapshot aliases the last frame. `offer()` must run right after `fill()` in the same step.
- **Scene input (for Scene & QA, no scene change here):** per fixed step, `recorder.offer(filmT, audioBridge.fill(AudioBridgeInput))`. Required input is the full `AudioBridgeInput` (camera at the film pose, timeOfDay, season, windSpeed, gust, rain, night, musicEnabled, vehicles, pedestrians, trees, church, lifeEvents, thunder, horns, aircraft). `dt` is ignored. `pollLifeEvents`, `traffic.takeHorns()` and `weather.thunder` drain queues: call them once per fixed step, exactly as the live loop does, or the dry run loses events. Sound switch is not in the frame; pass `soundEnabled` to `renderFilmAudio`.
- **Render path:** no real `OfflineAudioContext` in the vitest node env. The test uses `FakeOffline` with the real `SOUND_SYSTEM_FACTORIES`: all systems run, none skipped. A real-context test is `it.skipIf` and runs only in a browser-like runtime. Default-path error (no context) is tested.
- **Hash:** equal across two renders of the same snapshots (fake context). Peak and hash values from the fake are synthetic; real peak needs a dev-page render.
- **45 m gate (risk 11):** above `AERIAL_HEIGHT_M` (45 m) `routeFrame` gives birds-only to `animals` and `quietFrame` to all others: no walkers, vehicles, trees, church, life events, horns, wind, gust or night. Rain, thunder, aircraft and music pass. The film overview runs above 45 m (cruise height = roofs + 15 m), so ground audio is silent there and steps at the crossing. Lead decision: film exemption. `routeFrame` takes `{ aerialGate }` (default true). The offline render passes `aerialGate: false`, so the film keeps its ground sound above 45 m. Live routing is unchanged.
- **New knobs:** none. `AUDIO_SNAPSHOT_HZ` is a fixed design rate (risk 12), kept local.
- **New libraries:** none.
- **Film exemption (lead):** `routeFrame(name, frame, soundEnabled, { aerialGate })`, default true. Offline render passes `aerialGate: false`. Live unchanged. Tests cover both.
- **Auto film audio track:** `openAutoEncoder({ audio: true })` declares AAC (`mp4a.40.2`, 48 kHz, stereo, `film.audioBitrate`). `session.encodeAudio(buffer)` takes the renderFilmAudio buffer, slices 1024 frames, planar f32. Call once, before `finish()`. `finish()` rejects if audio was opened but not encoded. Video path unchanged when `audio` is omitted.
- **Knob added:** `film.audioBitrate` = 192000 (TUNING.md row, tuningParity entry).
- **Quiet auto film (root cause):** the Chrome film peaked at -38.1 dB, mean -58.5 dB. Not a pipeline fault: snapshots, volumes and Sound switch are read correctly, and the tap is wired (`useTownFrame.ts`). The overview listener sits on the ground point the camera looks at, so the sounds are 100 to 300+ m away. The inverse law (`refDistance` 4 m, `maxDistance` 250 m) gives about -36 dB, and zoom attenuation adds about -10 dB at 300 m. The manual film is at ground zoom (about -4 dB).
- **Fix:** `renderFilmAudio` takes `peakTargetDb`, scales the mix to that peak (one gain), throws on a silent mix. `autoRun` passes `film.audioPeakTargetDb` (-3). Knob row in TUNING.md and tuningParity entry. Expected gain from the measured file: +35 dB. Not verified by a real render.

## Update 2026-11-06 (lead): film time
- The auto film now really steps the town by 1/fps (frameloop held 'never', 2f99377), so audio snapshots line up with film time. Earlier MP4s had the town on wall time; audio was not re-measured after the fix (open item).

## Update 2026-11-06 (audio): UI panel cues
- New `src/audio/uiCue.ts` and facade `uiCue(kind: 'open' | 'close')` (exported from `src/audio/index.ts`), for UI & Camera to call on panel and section expand/collapse.
- Sound: pink noise through a bandpass (Q 1.3) sweeping 650 -> 1700 Hz (open, attack 70 ms, decay 120 ms) or 1400 -> 520 Hz (close, attack 40 ms, decay 140 ms), plus a sine tick (open 1180 Hz at +60 ms, close 820 Hz at +100 ms; 4 ms attack, 50 ms decay, glide down 6 %, gain 0.12 of the swish). Spread per cue: Hz +-6 %, times +-10 %, gains +-15 %. Total about 170-210 ms, all below 2 kHz, linear envelopes from and to zero.
- Routing: own gain node straight to `ctx.destination`, outside master, limiter and record tap, so cues never reach the manual recording or the offline auto film (that render builds its own context and never calls uiCue). Level = `audio.uiCueLevel` (0.35) x master slider x effects slider. No-op before init, with Sound off, with the context not running, or within `audio.uiCueMinGapS` (0.06 s) of the last cue. Errors are swallowed (one warning).
- New knobs: `audio.uiCueLevel`, `audio.uiCueMinGapS` (TUNING.md rows, tuningParity entries). No new mixer category: the cue follows the effects slider; a separate UI slider would need a SoundMixer change.
- Tests: `tests/audioUiCue.test.ts`. Not listened to: level and timbre are unverified by ear.

## Update 2026-11-06 (audio): UI cue redesign, clockwork ratchet
- User feedback: the swish was too airy. `uiCue` (same API, routing, rate limit, film exclusion) is now a clockwork ratchet; the swish and sine tick are gone.
- Ticks: `audio.uiCueTicks` (7) white-noise impulses, first to last over `audio.uiCueDurationS` (0.26 s). Each: 1.5 ms attack, 16 ms decay (+-20 %), into three parallel bandpasses: metal 2350 Hz Q 14 (x2.2), metal 3000 Hz Q 18 (x1.1), brass/wood knock 460 Hz Q 5 (x1.6). Tick gain 0.55.
- Open (winding): each gap 0.86 of the previous (speeds up), pitch +2.5 % per tick. Close (unwinding): gap ratio 1/0.86 (slows down), pitch -2.5 % per tick, last tick is a latch: knock 330 Hz x2.2, metal partials x0.45, 30 ms decay, gain x0.8.
- Jitter per tick: gaps +-10 %, partial Hz +-3 %, levels +-18 %. Grind: brown noise, bandpass Q 0.9 drifting 150 -> 230 Hz (open) or back (close), 40 ms attack, gain 0.22, ends 60 ms after the last tick.
- New knobs: `audio.uiCueTicks`, `audio.uiCueDurationS` (TUNING.md rows, tuningParity entries). Partials, ratios and jitter stay local in `src/audio/uiCue.ts`.
- Not listened to: level, timbre and the band-limited noise loudness (high-Q gains are compensation guesses) are unverified by ear.

## Update 2026-11-06 (audio): single UI tick
- `uiCue('tick')` for switching house or block with the left panel open: one ratchet tick from the same partials (2350/3000/460 Hz), 1.5 ms attack, 20 ms decay +-10 % (about 20-30 ms with the ring), gain 0.55 x `audio.uiCueTickLevel` (0.75), pitch jitter +-4 % for the whole tick, no grind. Same routing, Sound switch, rate limit and film exclusion.
- New knob `audio.uiCueTickLevel` (TUNING.md row, tuningParity entry). Not listened to.

## Harness refactor (2026-11-06)
- `animals.ts`, `music.ts`, `nature.ts`, `people.ts`, `vehicles.ts` keep their names and factories; each re-exports its parts (`export *`).
- Animals: `animalsPure.ts` (knobs, pure helpers, songs), `animalsVoices.ts` (song, bark, meow, flutter builders).
- Music: `musicMood.ts` (mood, fades, scheduler), `musicVoices.ts` (Web Audio voices, reverb impulse).
- Nature: `natureCore.ts` (knobs, pure helpers, voice types).
- People: `peopleCore.ts` (knobs, pose, speakers, helpers), `peopleVoices.ts` (chat, footsteps), `peopleUmbrella.ts` (umbrella rain).
- Vehicles: `vehiclesCore.ts` (knobs, engine model, helpers), `vehiclesEngine.ts` (engine voice), `vehiclesSignals.ts` (indicator, horns).

## Review 2026-11-08 (Audio)
Checked against HEAD `6b036e4` with Grep/Read. Most numbers and names in this handbook and in `docs/AUDIO.md` are valid (listener constants, limiter, voice budget, 16 categories, group map, mixer storage keys, voice limits and distances, tuning values, hot-reload trap). Corrections below override the body above.

### Corrections (stale)
- **Moved paths:** `DOG_MEAN_S`, `BIRD_Y`, `BIRD_MAX_M` are in `animalsPure.ts`, not `animals.ts`. `AIR_BRAKE_LEVEL` is in `vehiclesCore.ts:21`, not `vehicles.ts`. Rustle, whistle, cricket and bell constants are in `natureCore.ts` (`nature.ts` re-exports). Limiter (-9 dB, ratio 12) is in `mixChain.ts`. The aerial gate is `routeFrame` in `route.ts:37`, not `index.ts:115-117`; `quietFrame` lives in `route.ts` and is re-exported from `index.ts`.
- **Knobs now in config** (`src/config/tuning/audio.ts`): `AERIAL_HEIGHT_M` = `audio.aerialHeightM` (45); `JET_GAIN` = `audio.jetGain` (1, not 0.55); master start 0.4 (`masterVolumeDefault`); per-category starts (`categoryDefaults`); mixer start master 40 (`mixerDefaults`).
- **Verify line:** "peak < 0.5" is superseded. The film render scales to `film.audioPeakTargetDb` (-3 dB) in `renderFilmAudio`. Keep the peak < 0.5 check only for the live path.
- **Scope:** last commit touching `src/audio` is `dcb63d5`, not `251fe15`.
- **Trap, fake context:** `animalsVoices.ts:110` calls `createWaveShaper`, but `tests/helpers/fakeAudio.ts` does not define it. Whether a test reaches that path is unverified.
- **Film plan (2026-11-04) status:** `listenerOverride.ts` does not exist. The 45 m gate is still a step (`route.ts:37`); only the offline render passes `aerialGate: false`. The ground-node ramp (plan P3) is not built.

### Rules check
- **Layer and dependency guard** (`tests/harness.test.ts`, FEATURES includes `audio`): audio imports neither `scene` nor `ui`. Valid and enforced.
- **350-line limit:** every `src/audio/*.ts` is at most 337 lines (`bus.ts`). No audio entry in `OVERSIZED`. Valid; `bus.ts` is close to the limit.
- **localStorage guard:** `src/ui/SoundMixer.tsx` is on the allow-list. Valid.
- **Math.random (layout) guard:** `audio` is not in `LAYOUT_DIRS`, so the guard does not cover audio. Not a violation: `aircraft.ts:63` and `musicMood.ts:209` are non-layout, and `offlineRender.ts` seeds Math.random.
- **No-network ADR 0005:** audio has no `fetch`. Valid. But ADR 0005 says "Persisted data is the JSON settings file ... only", while `SoundMixer.tsx` persists to localStorage (`MIXER_STORAGE_KEY`, `CATEGORY_STORAGE_KEY`). The ADR text is stale. Lead to fix (not an audio file).
- **Tuning rule (CLAUDE.md, "ONLY in src/config/tuning"):** not enforced for audio and not followed. Knob-type literals remain in feature code: `DOG_MEAN_S`, `AMBIENT_MEAN_S`, `OWL_MEAN_S` (`animalsPure.ts:19-38`); `RUSTLE_INTERVAL_MIN_S/MAX_S` (`natureCore.ts:13-14`); `ENGINE_VOICES`, `ENGINE_MAX_DISTANCE`, `HORN_MAX_DISTANCE` (`vehiclesCore.ts:10-16`); `CHAT_VOICES`, `CHAT_MAX_DISTANCE` (`peopleCore.ts:11-14`); `AIRCRAFT_MAX_VOICES`, `AIRCRAFT_REF_DISTANCE`, `AIRCRAFT_MAX_DISTANCE` (`aircraft.ts:13-16`). These are intervals, counts and distances, which CLAUDE.md defines as knobs. The "Tuning rule" paragraph above overstates the current state. Lead decision: move them or record reasoned exceptions.
- **Knob doc rule:** every `audio.ts` key I checked appears in `docs/TUNING.md`. Valid.

### Not verified
- Level, timbre and balance by ear (out of scope here).
- Did not run `vitest`, `tsc` or `npm run check`.
- `harness/README.md` Math.random list omits `agentRoom`, which the guard includes (not audio; for the lead).

## Review 2026-11-09 (Audio)
Checked `docs/AUDIO.md` and this handbook against code (Grep/Read). Own files fixed: `docs/AUDIO.md`, `docs/agents/audio.md`. No code or tests touched. No commit.

### Fixed in own docs
- `docs/AUDIO.md`: Files list was incomplete (added `mixChain.ts`, `route.ts`, `recordTap.ts`, `uiCue.ts`, `offlineRender.ts`, split helper files). Facade list now includes `uiCue`, `getRecordStream`. Aerial gate path `index.ts` -> `route.ts`. Leaf rustle = 3 of the 5 nearest trees per burst. Night music = D minor pentatonic (was "D Dorian"). Thunder duck = while thunder is in the frame, 3 s recovery. Added sections: panel cues (`uiCue`), recording and film audio (`getRecordStream`, `renderFilmAudio`, peak target).
- Handbook body: rain puddle share is 18% at level 0.3 (was "30%"). Air brake and dog-bark paths point to `vehiclesCore.ts` and `animalsPure.ts`. `index.ts` facade list and systems list corrected (weather runs under rain). Tuning-rule paragraph marked as not fully followed. Fake-context trap restated with exact location. Verify line: film peak uses -3 dB target, < 0.5 only for the live path.

### Verified correct (no change)
- Limiter (-9 dB, knee 6, ratio 12, attack 3 ms, release 0.25 s), listener constants (8 m, 2 m, 400 m), zoom attenuation, distance lowpass (18 kHz to 1.2 kHz at 300 m), 16 categories and 3 groups, mixer labels, default 40/100/100/100, storage keys, voice budget hysteresis 0.2, aircraft (2 voices, 250/2500 m, fades 3 s / 2.5 s, 260 Hz / 1.1 kHz / 780 & 1010 Hz), vehicles (8 engine within 120 m, 6 indicator within 60 m, horn 220 m, 4 concurrent), people (4 chat within 30 m, 5 steps within 28 m, speed > 0.3, 4 umbrella within 25 m, rain 0.15), animals (4 event songs, 3 ambient 20-90 m, flaps 3-6, max 3, dog 120 m, 3 barkers, dog mean halved near a fast vehicle, meows 3), rain (10 drops + 4 bed at 45-105 m, RAIN_ON 0.05), thunder (450 m, 60 m height, x2, x1.3), wind whistle (8 m/s, 2 max, 15-70 m), bell 400 m, crickets 22-05 with summer 1 / autumn 0.5, music (72/54/38 bpm, 2 s fade, level 0.8, duck 0.55), horn cooldowns 45 s / 6 s / 50% (`trafficLife.ts`). Test files: 14 `tests/audio*.test.ts` plus `tests/helpers/fakeAudio.ts`, 173 `it(` blocks in total. Largest audio file `bus.ts` 337 lines. Git: last `src/audio` commit `dcb63d5`.

### Open item: knobs outside `src/config/tuning/` (status)
- Still open. Nothing moved since 2026-11-08. The list of still-local knob-type constants is in "Open items" above. The 2026-11-08 list was incomplete: about 25 more literals are intervals, counts and distances (for example `MAX_BARKERS`, `RUSTLE_TREES`, `CHAT_VOICES`, `AIRCRAFT_MAX_VOICES`, `THUNDER_MAX_PLACE_DISTANCE`).
- Film-plan knobs (`filmListenerSmoothS`, `filmListenerBlendM`, `aerialBlendM`, `groundFadeS`, `filmFadeS`, `filmZoomFloor`, `birdRangeM`): none added. `listenerOverride.ts` does not exist.

### For the Architect (docs/TUNING.md, not edited here)
- Stale code locations (constants moved): row "Bird audio cap" `animals.ts:35-40` -> `animalsPure.ts:29-34`. "Dog bark range" `animals.ts:42` -> `animalsPure.ts:36`. "Dog bark mean interval" `animals.ts:44` -> `animalsPure.ts:38`. "Max barkers" `animals.ts:45` -> `animalsPure.ts:39`. "Ambient animal interval" `animals.ts:25` -> `animalsPure.ts:19`. "Owl interval" `animals.ts:27` -> `animalsPure.ts:21`.
- "Mixer storage keys" `SoundMixer.tsx:17` -> line 18. "Mixer smoothing" `bus.ts:95` -> `bus.ts:98` (`SMOOTH_S`).
- "Bell pitch and height" `nature.ts:51, 54` -> `natureCore.ts:39, 42` (`BELL_HZ`, `BELL_Y`).
- "Leaf rustle interval" `nature.ts:25-26` -> `natureCore.ts:13-14`. "Leaf rustle min wind" `nature.ts:27` -> `natureCore.ts:15`. "Whistle wind range" `nature.ts:38-39` -> `natureCore.ts:26-27`.
- "Rain on threshold" `rain.ts:17` -> `rain.ts:18`. "Rain drop radius" `rain.ts:23-24` -> `rain.ts:24-25`.
- "Pedestrian rain on/off" `people.ts:37-38` -> `peopleCore.ts:17-18` (`RAIN_ON` 0.15, `RAIN_OFF` 0.1; value is also in `people`, not `rain`).
- "Thunder range and height" `weather.ts:12, 14` -> `weather.ts:13, 15`.
- "Music fade" `music.ts:17` -> `musicMood.ts:7` (`FADE_SECONDS`). "Music mood hours" `music.ts:26-33` -> `musicMood.ts` (`MOOD_KEYS` range; verify line).
- "Vehicle engine voices" `vehicles.ts:27` -> `vehiclesCore.ts:10`. "Vehicle horn distance" `vehicles.ts:33` -> `vehiclesCore.ts:16`. "Horn concurrency" `vehicles.ts:34` -> `vehiclesCore.ts:17`; the row says "Not exported" but `HORN_MAX_CONCURRENT` is exported.
- "Aircraft fade" `aircraft.ts:17-18` -> `aircraft.ts:18-19`.
- Wrong content: "Aerial height" row says "crickets and bells are silent". Code silences crickets only (`nature.ts:267-268`). Bells are not gated. Fix the row text.
- "Cricket window" and "Cricket count and range" rows give `audio.ts` line numbers (261, 269, 271, 265) that are not meaningful; use keys only.
- Line 221 says category list is `bus.ts:13-30`; actual list is `bus.ts:14-31`.

### Not verified
- Level, timbre and balance by ear. `vitest`, `tsc` and `npm run check` not run (read-only review).
