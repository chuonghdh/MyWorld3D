# Technical Architect
Reviewed 2026-11-01 at 02b0cdc

**Owns:** cross-cutting structure, not feature code. Module boundaries, the asset pipeline, the performance budget, the build and test toolchain, and dependency hygiene. Writes no feature geometry; it reviews, proposes and sets standards that the specialists implement. Edits docs and budgets/guard tests only, and only when the owning specialist agrees.

## Role
- Keep the dependency direction clean: `core` and `store` at the bottom, `city` and `buildings`/`streets`/`traffic`/`environment` as feature modules, `scene` as the composition layer, `ui` at the top. Flag any feature module importing `scene` or `ui`.
- Keep layouts pure: anything generated from `settings` plus `layout.seed` is a pure function (no `Math.random`, no wall-clock time). Hashes in tests are the contract.
- Review each merge that crosses owners (for example block merging touched city, streets, traffic, buildings and scene). Check file ownership in `docs/agents/README.md` and `docs/REPO_MAP.md` before approving.
- Track size limits (`src/scene` files <= 350 lines) and split a file before it grows past the rule.

## Asset pipelines
- **Procedural first.** Geometry, textures, shader patches and all audio are generated in code from seeds. New binary assets need a reason and a budget line.
- **Binary assets (exception).** `public/models/` holds 56 GLB files (Quaternius and Kenney, CC0, `LICENSE.txt` in each folder), plus 5 PNG and 1 JPG. They are tracked in git and loaded at runtime by `scene/useNatureTrees.ts` and `streets/natureTrees.ts`; `tests/budget.test.ts` reads them. Do not gitignore them: a clean checkout would lose the city trees and fail the budget.
- **Geometry.** Repeated parts use instanced meshes (`MeshBuilder`, `placeMatrix`). A new mesh counts against the draw-call budget; prefer merging into an existing mesh of the same material.
- **Textures and shaders.** Shared canvas textures are created once and cached. Shader patches go through `onBeforeCompile` with a `customProgramCacheKey` that is versioned (e.g. `building-body-v11` (was v4; `buildings/materials.ts:94`), `person-rig-v3`). Chained patches append a suffix to the previous key (e.g. `|wx1` in `shaders/wetSurface.ts`). Shared patches live in `src/shaders/` (`cloudShade.ts`, `wetSurface.ts`). No GLSL identifier `patch` is used.
- **Audio.** Sound routing follows `docs/AUDIO.md`. The Audio specialist owns the bus and emitters.
- **Fonts, icons, UI assets.** Inline SVG in TSX or small CSS. No fetch, XHR or WebSocket in `src` (stale: since ADR 0013, `fetch` and `EventSource` are allowed in `src/agentRoom/bridgeClient/` only); `localStorage` is used only in `src/ui/SoundMixer.tsx` and `src/ui/sectionState.ts` (stale: second file, see Review 2026-11-08).
- **Caching.** Anything that depends on layout is keyed by `layoutKey`. `cityLayoutKey` (`src/city/layoutKey.ts`) ignores `trafficMultiplier` and includes `blockMerges`. `createLayoutProvider` is single-entry; `retargetTraffic` changes only spawns. Pieces are cached per block signature (`useTownPieces`).
- **Save files.** JSON settings are the only persisted state. Every new field needs a default, validation in `io.ts`, and a migration note if old saves change meaning.

## Performance standards
- **Frame budget.** 60 fps target on a mid-range desktop GPU at the default quality tier; 30 fps floor on phones at the lowest tier. Frame time is measured, not guessed.
- **Draw calls and triangles.** The guard tests in `tests/budget.test.ts` are the limit (see Scene & QA handbook for current values). Raising a limit needs a measured reason written in the handbook and approval from Scene & QA.
- **Rebuild cost.** A user action that rebuilds the town has a time budget. Reference: 1x1 to 1x2 merge ~1 s, 1x2 to 2x2 ~2.4 s (accepted for now; speed-up is backlog). A new feature may not make these worse without a note.
- **Determinism.** Same seed and settings produce the same output. No `Math.random` in layout code (city, streets, buildings, traffic, environment, life, store). Exceptions: `App.tsx` `switchTrees` (user action, species saved with the layout, accepted) and audio (not layout). Incomplete (2026-11-08): `src/scene/useTownFrame.ts:93-94` also calls `Math.random` (leaf drop, user action) and is outside the guard's directory list; see Review 2026-11-08.
- **No coplanar geometry.** Decals use distinct heights plus polygon offset.
- **Visual quality is not traded silently.** A cheaper path needs side-by-side evidence and a note.
- **Measurement.** Use the `__r3f` dev handle (draw calls, triangles) and `performance.now()` around layout builds. The built-in browser cannot paint frames; use the connected Chrome for visual or timing checks and say what was not seen.

## Traps
- Vite can serve a stale transform of a module after a multi-file edit. A `ReferenceError` in a module that looks correct means the server is stale: touch the file or restart the dev server, then recheck the served source.
- An error inside the R3F Canvas unmounts the whole React tree, which looks like a blank page. Boot screen and error boundary exist for this (`src/ui/boot.ts`, `src/ui/ErrorBoundary.tsx`).
- Node-only APIs (`node:fs`) in tests break `tsc` unless node types are configured. `tests/budget.test.ts` (line 82 on 2026-11-08, was 88) builds the module name by string concatenation in a dynamic import; keep that pattern. Or use Vite `?raw` imports.
- `weatherUniforms` is shared by reference. Swap `.value` only, never replace the uniform object (`streets/index.ts`, `shaders/wetSurface.ts`).
- Lab clones: the tree-compare page (`src/dev/treeCompare`) reads clones only and is not imported by the city. Shared modules it does not clone are listed in `docs/agents/scene-qa.md` (Tree lab).

## Decisions
- Specialists own their directories; the architect does not edit feature code. Cross-owner changes go through the owner.
- Owners do not add feature code to the architect handbook. The architect records reviews and standards only.
- Budgets live in tests, not in prose, so they fail loudly.
- Lab clones stay separate from the city until the user approves a merge.

## Findings status (phase 2 review, verified at 02b0cdc)

| # | Finding | Status |
|---|---|---|
| 1 | Feature modules importing `scene` | Closed. No `../scene` imports in sky, aircraft, feature folders or store. `sky/SkyDome.tsx:7` uses `core/runtime`; `aircraft/schedule.ts` reads `uiCamera.maxDistance` from `config/tuning` (core/cameraLimits removed) |
| 2 | Store importing city and weather | Closed. No city or weather imports in `src/store`. `core/blockIds.ts` and `core/weatherKinds.ts` exist |
| 3 | Draw-call guard, dead 400 limit | Closed. No 400 limit in `tests/budget.test.ts`; cap 140 (line 296 on 2026-11-08, was 308). Test comments disagree on the measured figure (130 at line 261; the 132 figure is gone); not re-measured here. Still closed 2026-11-08 |
| 4 | Shader ownership split | Closed, committed in `6a89651`. `src/shaders/wetSurface.ts` and `src/shaders/cloudShade.ts` exist; `environment/cloudShade.ts` re-exports; `weather/wet.ts` imports `../shaders/wetSurface` |
| 5 | Files over 350 lines | Closed 2026-11-08 for `src/` (no src file over 350; largest `src/scene/CameraRig.tsx` 349). The rest of this row is the 2026-11-01 state, kept as history: open. 32 files over 350 lines. `traffic/vehicles.ts` 314 (was 1794), `traffic/pedestrians.ts` 281 (was 1511). Largest: `buildings/facade/roof.ts` 1070, `ui/panels.css` 930, `life/birds.ts` 801, `audio/vehicles.ts` 770. Each owner splits its own files, no behaviour change |
| 6 | `Math.random` for tree species (`App.tsx`, `switchTrees`) | Accepted. Random on purpose; species travel with the exported layout (`exportLayout` / `importLayout` in `store/io.ts`). 2026-11-08: incomplete, `src/scene/useTownFrame.ts:93-94` also uses `Math.random` (leaf drop) and is not recorded |
| 7 | Import version check strict equality (`store/io.ts:208`) | Open, low priority (UI & Camera). No migration path; only user-triggered export and import exist |
| 8 | Signature `JSON.stringify` per block | Open, unmeasured. `src/scene/useTownPieces.ts:51` (2026-11-08) stringifies `lots` and house overrides on every memo run. Measure with `performance.now()` before changing |

New finding (closed 2026-11-08: `src/core/runtime.ts:4` now imports from `./types`): `src/core/runtime.ts:4` imports the type `GustEvent` from `environment/wind`. Type-only and erased at build, but `core` should not depend on feature modules. Move `GustEvent` to `core/types.ts`. Owner: Scene & QA.

## Open items
- Findings 7 and 8 above (finding 5 and the `core/runtime.ts` type import are closed 2026-11-08; see Review 2026-11-08).
- Frame time and rebuild time still need measurement in connected Chrome.
- First full review of repository structure, asset patterns and budgets is done (this handbook). Re-run the module-graph grep after any cross-owner merge.

## How to verify
`npx tsc --noEmit`, `npx vitest run` (rerun the pedestrian flake alone), `npx vite build`. For structure claims: grep for `from '../scene` and `from '../ui` in feature folders and `src/store`; `wc -l` for the 350-line rule. For performance claims, measure in Chrome with the scene graph and draw-call counts, and state plainly what was not checked by eye.

## Session notes (2026-11-01)
- Build check at the first review pass: `tsc --noEmit` and `vite build` exited 0; index JS 1,650.63 kB (gzip 507.56 kB) is above Vite's 500 kB warning. Not re-run in the 02b0cdc review. Code-split or raise `chunkSizeWarningLimit` only with a measured reason.
- `tree-compare.html` is committed at the repo root as a dev-server-only entry (not built). `src/dev/treeCompare/` and `src/shaders/` are committed.

## Research notes (not adopted)
- Harness (revfactory/harness, meta-skill that generates agents and skills): adopt nothing wholesale. Adaptable pieces: a short cross-owner handoff checklist (files, acceptance, what must not change) and using the Explore agent for broad scans. Conflicts: generated team replaces our fixed roster, `/harness:evolve` rewrites owned files, and a change-history section in CLAUDE.md conflicts with the slim CLAUDE.md rule. No token-savings figures are published by the project. Revisit only with a measured pilot.
- Code graph tools (CodeGraph, Graphify; the "Graphity" repo URL returned 404): their token savings are self-reported and small-N. Our repo (166 TS/TSX files) is small enough that the hand-written REPO_MAP and handbooks route most lookups in one hop. Revisit only if a pilot on a cross-folder task shows 25% or more fewer tokens. No install, no pilot run.

## Session 2026-11-04 (film feature plan)
Plan only. No source edits, no commits. Feature: camera button next to Photo in `src/ui/TimeBar.tsx`, menu with Manual film (user flies, realtime record) and Auto film (scripted bird flight over the town, Gothic cathedral, skim, sky tilt to sun/moon, perch at cathedral west/front face).

### Evidence (current code)
- Photo pipeline: `src/scene/ScreenshotRequest.tsx:3-12` reads the canvas in a priority-2 `useFrame` after the composer (priority 1) because `preserveDrawingBuffer = false`. Reuse this hook for frame capture.
- Composer: `src/scene/PostFX.tsx:56-88` HalfFloat target with MSAA (`preset.msaa`, 4 on high/medium). Tilt-shift blurs frame edges (`TILT_BLUR_PX`, line 21); bloom is screen-space.
- Resolution: `src/App.tsx:145` `dpr={[1, preset.dprMax]}`; tiers in `src/config/tuning/sceneQa.ts:27-31` (dprMax 2/1.5/1, shadowMap 4096/2048/1024).
- Shadow frustum shrinks with camera distance in 10 m steps (`src/scene/townShadow.ts:31-40`), so detail rises on zoom-in. Anisotropy set only in `src/buildings/signs/atlas.ts:94`; general texture filtering not audited.
- Sim clock: `src/scene/useTownFrame.ts:71-72` uses R3F `frameDt`; `runtime.simTime` (`src/core/runtime.ts:27`). Weather, clouds, aircraft take `dt`. R3F 8.17 exposes `state.advance(timestamp)` (store typings) for manual stepping.
- Randomness: none in city, streets, buildings, traffic, life, environment, store, core (grep). Non-deterministic: `src/weather/Lightning.ts`, `src/audio/*` (people, vehicles, music, synth, aircraft), `useTownFrame.ts` leaf devil (user action, accepted).
- Audio graph: `src/audio/index.ts:66` limiter -> destination; `bus.ts:128-135` zoom gain -> master; `math.ts:39` `zoomAttenuation` (1/(1+h/150), min 0.12). Aerial quiet frame above 45 m silences ground systems (`docs/AUDIO.md`, Aerial mode). `systems.ts` types use `AudioContext`, not `BaseAudioContext`.
- Budgets: `tests/budget.test.ts:273-297` main tris <= 1.9 M, shadow <= 605 k, main+shadow <= 2.3 M, draw calls <= 140 (comment says 130 or 132 measured).
- Config is a directory `src/config/tuning/` (index + 7 section files), not `tuning.ts` as CLAUDE.md states. Parity test handles both.
- Camera: `uiCamera` maxDistance 600, minDistance 4 (`src/config/tuning/uiCamera.ts:66-68`).
- Gothic cathedral: `src/buildings/monuments/culture.ts:435`. Front (west) face not verified; check its `Site` before scripting the perch.

### Decisions
1. Two pipelines.
   - Manual film: realtime. `canvas.captureStream` + MediaRecorder (WebM) for v1. Audio: `createMediaStreamDestination` tap after the limiter (`audio/index.ts:66`), so user volumes, zoom gain and positional mix are included. Realtime so sync holds by construction.
   - Auto film: deterministic two-pass. Pass 1 dry-runs the scene at fixed dt (1/30 s) via `runtime.fixedDt` override, records pose and `AudioFrame` snapshots at 20 Hz. Pass 2 steps `state.advance(t)` per frame, renders, `new VideoFrame(canvas)` -> `VideoEncoder` (H.264 MP4 or VP9 WebM) with a lazy-loaded muxer chunk. Audio is re-rendered with `OfflineAudioContext` from the recorded snapshots, using a volume snapshot from `getGroupVolumes()`.
   - Fallback when `VideoEncoder.isConfigSupported` fails: MediaRecorder path for Auto too, at the cost of realtime duration.
2. Resolution: default 1920x1080 @ 30 fps. Output size is set explicitly (pixel ratio 1 during film), not from devicePixelRatio. Optional 2x supersample (render 3840x2160, downsample) only on high tier, after measurement. 4K HalfFloat MSAA4 target is ~265 MB of GPU memory: not on phones. Tilt-shift forced off during film (blur is not sharpness). Audit texture anisotropy and mipmaps; set renderer-wide max anisotropy if missing.
3. Audio: offline re-render for Auto needs (a) `AudioBus` / systems typed on `BaseAudioContext`, (b) seeded RNG (`synth.ts` `createRandom`) in every system used by film, (c) no `Date.now` or wall clock. Film bird voice goes in category `wind` (Nature slider) and is exempt from the aerial quiet frame, else a high bird is silent. Positional level already rises with proximity (PannerNode inverse). `zoomAttenuation` still lowers the whole bus at altitude; state this to the user.
4. Modules (new, all <= 350 lines):
   - src/film/flightPath.ts (planned) (pure keyframes, Catmull-Rom, input is sun/moon direction and cathedral site). Owner: UI & Camera (camera path), data from Sky & Environment and Buildings.
   - src/film/driver.tsx (planned) (mounted in Canvas, fixed-dt stepping, cancel and unmount cleanup). Owner: Scene & QA.
   - `src/film/recorder.ts` (VideoEncoder + muxer, MediaRecorder fallback, backpressure: `encodeQueueSize` cap, `VideoFrame.close()` each frame). Owner: Scene & QA.
   - src/film/offlineAudio.ts (planned) (snapshot store and offline render glue). Owner: Audio.
   - `src/life/filmBird.ts` (one merged mesh, reuses the `flyer` animal material key, no new shader). Owner: Traffic & Life.
   - src/ui/FilmMenu.tsx (planned) (menu, progress, cancel); `TimeBar.tsx` only mounts it. Owner: UI & Camera.
   - `src/config/tuning/film.ts` (new section; knobs: fps, width, height, bitrate, phase durations, circle radii, skim height, tilt angle, perch offset, snapshot Hz). Add to `index.ts`, `tests/tuningParity.test.ts` and `docs/TUNING.md`.
5. Cross-owner file list: `src/core/runtime.ts` (fixedDt, film request; no feature imports, Scene & QA), `src/scene/useTownFrame.ts` (read fixedDt), `src/scene/PostFX.tsx` (size and tilt override), `src/scene/CameraRig.tsx` (film camera mode suspends input, UI & Camera), `src/audio/index.ts` + `bus.ts` + `synth.ts` + `systems.ts` (Audio), `src/life/index.ts` (Traffic & Life), `src/sky/state.ts` (pure `sunDirAt(time)` export, Sky & Environment), `src/buildings/monuments/culture.ts` (site export, Buildings). Architect reviews the merge (dependency direction: `film` imports scene only via the driver mount; `core` gets no feature import).

### Phases and acceptance
- P0 Spec: path keyframes, knobs, open questions answered. Accept: this section updated.
- P1 Manual realtime record (captureStream, bus tap, 1080p, fixed 30 fps, tilt off). Accept: 30 s clip, no DOM in frame, silent when all volumes at 0, `tsc`/`vitest`/`vite build` green, sync checked by a clap marker in connected Chrome.
- P2 Fixed-dt driver and dry-run. Accept: two runs with the same seed give identical pose and `AudioFrame` hash series (vitest, no render).
- P3 VideoEncoder + muxer lazy chunk, fallback. Accept: frame count = duration x fps, decodes in a player, index JS delta small (lazy chunk only).
- P4 Offline audio. Accept: two runs give byte-equal audio hash; level within 1 dB of live at the same pose; group volumes respected.
- P5 Auto path and bird. Accept: path tests (start height, cathedral circle radius, skim height above road, perch faces west/front); draw calls +1 for the bird.
- P6 Sharpness. Accept: side-by-side frames at three zoom levels in connected Chrome; budget tests unchanged; supersample only if measured.
- P7 UI menu, cancel, HMR. Accept: cancel leaves no encoder or offline context alive; no console errors across a HMR reload.
- P8 QA. Accept: `tsc`, `vitest` (pedestrian flake solo), `vite build`; low tier at 720p runs.

### Risks (likelihood / impact / mitigation)
1. Frame drops during realtime capture: H / M. Fixed 30 fps cap, 1080p, auto-drop to 720p on low tier; Auto uses deterministic path.
2. Encoder unavailable (VideoEncoder missing, codec unsupported): M / M. `isConfigSupported` check, MediaRecorder fallback, disable Auto if neither exists.
3. Memory growth: encoded chunks, unclosed VideoFrames, HalfFloat MSAA targets: M / H. Close each VideoFrame, cap encode queue, dispose the composer target after film, 4K banned on phones.
4. Layout determinism: `Lightning.ts` and audio use `Math.random`: H / M. Film-only seeded RNG and sim-time flash; determinism test hashes pose and audio snapshots.
5. HMR: live encoder or offline context survives hot reload: M / M. `import.meta.hot.dispose` in driver (audio already does this at `audio/index.ts:188`); reset `runtime.fixedDt`.
6. Shader cache keys: reuse `flyer` material key; any new patch needs a versioned `customProgramCacheKey`; tilt-off or supersample change forces recompile (first-start hitch). Mitigation: warm up at menu open.
7. Phone performance: fill rate and memory at 1080p. H / H on low-end. Blind spot: no phone in this session. Mitigation: 720p preset, measure in connected Chrome with `__r3f` (draw calls, triangles).
8. Audio drift (manual realtime): MediaRecorder vs AudioContext clock: M / M. Clap-marker test; accept a few frames of drift and say so.
9. Shimmer when zoomed out: M / M. Mipmaps and anisotropy audit; SSAA if measured.
10. Draw-call headroom: 140 cap vs ~132 measured. M / H. Bird merged into one mesh; film test measures bird separately.
11. Aerial quiet frame silences bird voice: H / M. Exempt the film bird voice (decision 3).
12. Two-pass memory for snapshots: M / M. 20 Hz, store only fields the audio systems read; measure size per 60 s.
13. Cathedral facade orientation unverified: M / L. Check `Site` in `culture.ts` before scripting the perch.

### Open items (user)
- Length and output size (default 60 s, 1080p, 30 fps); is 4K on desktop wanted?
- Container: MP4 (H.264, Safari-friendly) or WebM first?
- Auto film time of day: current clock or fixed golden hour?
- Tilt-shift off during film (recommended): confirm.
- Bird look: silhouette of an existing life flyer, or a new mesh?
- Confirm: Manual recording excludes UI and uses realtime audio tap.

### Notes for lead
- Resolved: CLAUDE.md names the `src/config/tuning/` directory, not a single file.

## Update 2026-11-04 (lead): new dependency, rules, commits

- **Dependency approved by user:** `mp4-muxer@5.2.2`, pinned exact (`--save-exact`), published more than two weeks before the install. Use: MP4 container for the auto film (P3). It must load lazily via `import()` inside the auto encoder, so it lands in its own chunk. Review the chunk size and the import site.
- **Film commits on `feature_video_camera`:** `457be77` (manual film, aircraft, audio defaults), `157c706` (P2 dry run, `src/film/autoPath.ts`).
- **Codec rule:** MediaRecorder MIME strings with more than one codec must quote the list: `video/mp4;codecs="avc1.42E028,mp4a.40.2"`. The unquoted form is rejected by Chrome and silently falls back to WebM. Tests pin the quoted strings in `tests/film/recorder.test.ts`.
- **Tuning placement:** new audio defaults live in `audio.categoryDefaults`; the opening-flight tilt in `skyEnvironment.aircraft.introTiltDeg`; the overview direction in `uiCamera.overviewDirection`; film knobs `autoSeconds`, `autoVirtualMinutes` in `film.ts`.
- **Working method (user, standing):** assign implementation work to the specialist agents (Scene & QA for film code, Audio for sound, Sky & Environment for aircraft). The lead reviews, runs `tsc` and tests, and updates docs. Do not leave the Orchestrator working alone.

### Review requested from Technical Architect
1. Confirm the lazy-load boundary for `mp4-muxer` and the expected chunk size once P3 lands.
2. Check the quoted codec strings against the Chrome, Firefox and Safari MediaRecorder and VideoEncoder support notes. (Result: `docs/feature_video_camera.md` section 3.1 has no such notes; see the review result below.)
3. Confirm the knob placement above against the knob rule (no literals in feature code).
4. Decide whether `SLOTS` 3 to 4 (aircraft trail slots) needs a budget note in `docs/feature_video_camera.md` section 3.2. (Result: see below.)

### Review result (Technical Architect, 2026-11-04)
- OK: `mp4-muxer` pinned exact `5.2.2` in `package.json` and in the root of `package-lock.json`. Registry publish date 2025-07-02, more than two weeks old.
- OK: codec strings match `src/film/recorder.ts` (lines 29 to 40) and `tests/film/recorder.test.ts`.
- OK: knobs in place. `audio.categoryDefaults`, `audio.masterVolumeDefault` (0.4; was 0.8 in 457be77), `audio.mixerDefaults.master` (40), `audio.jetGain` (1), `skyEnvironment.aircraft.introTiltDeg` (8), `uiCamera.overviewDirection`, `film.autoSeconds` (30), `film.autoVirtualMinutes` (30). Each has a `tests/tuningParity.test.ts` entry and a `docs/TUNING.md` row, except the two gaps below.
- GAP: `docs/TUNING.md` has no row for `uiCamera.overviewDirection` or `audio.masterVolumeDefault`. Lead to add (outside this handbook).
- Draw calls: aircraft = 2 (the `planes` InstancedMesh and the contrail ribbon mesh, both `castShadow = false`). `SLOTS` 3 to 4 adds 0 draw calls; it only grows instance count and ribbon vertices. No budget change. Cap 140, about 132 measured (`docs/feature_video_camera.md` section 3.2).
- RISK: `avc1.42E028` is H.264 Baseline level 3.0 (frame-size limit about 720x576). Film 1080p (1920x1080) needs level 4.0, e.g. `avc1.42E028`. Chrome may reject or downgrade the 1080p option. Not verified in a browser. Action: level check in `recorder.ts` plus a 1080p test.
- Lazy load: `src/film/autoEncoder.ts` uses `await import('mp4-muxer')`; the top-level import is type-only. Nothing in `src` statically imports `autoEncoder.ts` yet, so no chunk exists yet. Keep the dynamic import. Verify chunk size with `npx vite build` once P3 is wired, and check the chunk is absent from the main bundle.
- Not verified: browser support notes (Chrome, Firefox, Safari), Chrome fallback to WebM, ffmpeg volume figures, mixer default 80 to 40, peak clipping.

## Update 2026-11-06 (lead): film time rules
- R3F loop: `<Canvas frameloop>` is a controlled prop. R3F 8.17.10 `configure()` re-applies the prop on every Canvas render, so an imperative `setFrameloop` is undone by the next App re-render. One source of truth: `src/film/loopHold.ts` (`useFilmLoopHold`, `canvasFrameloop`, `holdFilmLoop`, `releaseFilmLoop`). Commit 2f99377.
- Visual motion must follow sim time (`runtime.simTime` or the R3F `dt`), never `performance.now()` / `Date.now()`. Wall clocks are only for UI chips, perf timers and file names. Reason: the auto film renders slower than real time; a wall clock runs ~5x fast in the MP4.
- Auto film step guard: a fixed step throws (film fails) if the loop is not 'never' or the clock drifted off the film timeline.
- Film canvas: use `filmCanvas()` / `filmViewSize()` from `src/film/resizeBridge.ts`; never `document.querySelector('canvas')` (another canvas can come first).

## Update 2026-11-06 (lead): shader and material rules
- Reserved GLSL words are a compile risk, not a style issue: a failed compile removes the body material. Check new shader code for them (`patch`, and the other ES reserved words) before a change ships.
- Surface weathering (roof moss, wall weathering, window trim ageing, brick size) is shader-only: no new geometry or materials per house, budget unchanged (main 1,428,818, shadow 576,406, 127 calls at the last check). Any budget change must be stated with before and after numbers.
- Per-house variation comes from object-position noise or a seeded value, never from a random call at render time.
- Surface ids route the look: a new surface needs its own id and an explicit routing list, so the cathedral and other monuments keep their look.

## Update 2026-11-06 (architect): harness made real
- Edit hook: `.claude/settings.json` PostToolUse, matcher `Edit|Write`, runs `tsc --noEmit` on `.ts`/`.tsx` under `src/` or `tests/`. Silent on success, exit 2 with errors on failure. Replaces the echo-only Bash hook. Measured: tsc about 8.4 s; the targeted vitest run is about the same, so tsc is kept.
- `npm run check` = `tsc --noEmit && vitest run && vite build`. No dependency change.
- CI: `.github/workflows/ci.yml` on push and PR to `dev` and `master`, Node 20, `npm ci`, `npm run check`. Not yet run on GitHub.
- Keep the hook command free of backslashes (Windows paths are normalised in JS). Backslashes were lost when Node spawned Git Bash.

## Update 2026-11-08 (architect): Agent Room ownership (T-0008)
- Human exception to "architect writes no feature code": the architect owns src/agentRoom/**, src/config/tuning/agentRoom.ts (plus its entries in `tests/tuningParity.test.ts` and `docs/TUNING.md`), tools/agent-bridge/** and agent-room.html. No 9th specialist (rejected by the user).
- Scene & QA keeps `vite.config.ts`, `tests/layers.test.ts`, `tests/harness.test.ts` and `docs/REPO_MAP.md`; it reviews architect phases.
- Design: `docs/adr/0013-agent-room-module.md` (Proposed). Decisions: hooks only in .claude/settings.local.json; bridge started by hand; redact prompt text and tool inputs, keep tool names and paths; replay 50 commits plus completed tasks; one-way SSE, no command channel; unmatched agents are guests.
- Notes for agent-room work go in this handbook only.

## Update 2026-11-08 (architect): Agent Room phase 2 (engine, mapping)
- ADR 0013 accepted; ADR 0005 narrowed (network only in src/agentRoom/bridgeClient/). CLAUDE.md knob rule now allows a per-section parity file.
- Engine (src/agentRoom/engine/): `apply` is pure, skips events whose seq is not newer (counted as stale), time only from event.t. Simulation uses mulberry32 on `agentRoom.simSeed`.
- Mapping (src/agentRoom/mapping/): first session id is lead; Agent/Task PreToolUse queues the named specialist, the next unseen agent_id binds to it (or to agent_type when present). No match -> guest. Only tool names and paths leave the mapper (redaction test uses a sentinel string).
- Trap: the parity reader in `tests/tuningParity.test.ts` matches the first `name:` across all tuning files, so knob names must be unique across sections (walkSpeed clashed; renamed avatarWalkSpeed).
- Trap: owners.ts copies the ownership table; update it with `docs/agents/README.md`. Keyword matching is heuristic ("life", "city" are broad).

## Update 2026-11-08 (architect): Agent Room phase 3 (room render, simulation)
- Runtime (src/agentRoom/runtime.ts) owns engine state, the live world buffer and the feed; RoomView's Driver ticks it in useFrame at priority -1 (dt capped 0.1 s) and copies the zustand mirror at `agentRoom.mirrorHz`. Views read the runtime, never write it.
- Bubbles: DOM layer plus an in-canvas projector writing style transforms directly (no React re-render per frame, no drei Html).
- Draw budget measured (forced render, renderer.info): 11 calls, about 4.5k triangles, 6 programs, no GL error. Built-in pane frames were not seen by eye.
- Name matching: exact name or slug, then a full name inside the text, then a key that points at exactly one specialist; several hits -> guest. Broad words (city, life, scene, environment) are not keys.
- tests/agentRoomOwners.test.ts parses the ownership table and fails on drift either way (bare file names in the UI & Camera row are read as src/scene/).
- New knobs: viewDistance, simLoopEvents, meetHoldSec. Debug handle: `window.__agentRoom` (gl, scene, camera, rt).

## Update 2026-11-08 (architect): Agent Room phase 4 (replay)
- `node tools/agent-bridge/replay.mjs [--commits 50] [--out ...]` writes harness/runs/agent-room-replay.json (gitignored by `harness/runs/*.json`). Contents: commit short hash, time, changed paths (no bodies, no diffs); tasks (active and completed) front matter; brief task and owner; claims.
- The room reads it from the Vite dev server (src/agentRoom/bridgeClient/loadReplay.ts, the only fetch); src/agentRoom/replay/build.ts turns it into events (commit -> lead delegates to the owner of most files; owner names that are not agent ids -> guest). Playback is one event per `agentRoom.replayStepSec`, looping. No replay file, or `?source=simulation` -> labelled simulation.
- The replay file is not in `vite build` output; a built page falls back to simulation until the phase 5 bridge serves it.
- Runtime split: createRuntime(source, nextBatch) shared by simulation and replay; seq stays rising across loops.

## Update 2026-11-08 (architect): Agent Room UI pass, steps 1, 2 and camera (plan harness/briefs/T-0008-architect-p5ui.md)
- Shell: src/agentRoom/ui/theme.css (tokens, imported by main.tsx), AppShell (rail, top bar, side panel, camera bar; measures insets into uiStore), NavRail, TopBar, AgentsTab, PanelTabs, CameraBar, Icons, metrics.ts (pure: metrics, status pills, honesty lines, source control matrix). Overlay.tsx removed.
- uiStore.ts is separate from the engine mirror (store.ts). 3D reads camera request, follow, toggles, paused/speed from it; never writes the mirror.
- Runtime gained restart / seek(i) (fold of the first i events, pure) / progress for the replay scrubber.
- Camera: cameraPresets.ts (pure, from layout.ts; 11 targets), CameraController.tsx (drei OrbitControls + damped fly-to, follow, target clamp, setViewOffset to centre the free area). User drag cancels fly/follow. Keys: 0 overview, 1 hub, 2-9 desks, W wall, Esc, F, Space.
- Knobs added: roomSeed, qualityDefault, camFocusDistance, camDampTarget, camDampDistance, camFitMax.
- Trap: the built-in pane runs rAF at about 1-2 fps when hidden, so camera motion cannot be judged there; screenshots at an emulated 1600x900 did render.

## Update 2026-11-08 (architect): Agent Room look steps 3-6 and UI & Camera review fixes
- Look: Lighting (ACES 1.15, hemisphere, shadow sun in High only, 3 warm points, fog from 38 m), Outside (sky + 220 seeded skyline boxes, 1 draw), WindowWall (solid centre panel, glass 0.1 m behind the face, mullions 0.02 m in front), Decor (radial glass partitions, plants), Desks (rounded slab, panels, chairs, 2 monitors with one scrolling code texture tinted per owner), Hub (console, ring 2 cm above, orb), WallScreen (2x canvas, redraw on signature only), Robots (merged body per role with vertex colours + instanced arms, legs, rings, contact shadows; pure poses in robotPose.ts), Trails (instanced dots, target ring), Arcs (curved additive lines + packets). Agents.tsx and Links.tsx removed.
- Measured (High, forced render): 62 draw calls, about 61k triangles, 19 programs, no GL error.
- Review fixes: listbox rows focusable with Enter/Space/arrow keys; live connection pill; target clamp moves the camera by the same delta; refit on inset or size change while resting on a preset; segmented speed control; replay scrubber moved to the top bar; select(id, fromScene) switches tab only for 3D clicks; key help tooltip; asymmetric z clamp documented.
- Trap: a plane geometry given `onUpdate={(g) => g.translate(...)}` translates again on every update; build translated geometry in useMemo.
- Trap: mergeParts needs indexed geometries with normals; uv is dropped.

## Update 2026-11-08 (architect): Agent Room steps 8-9 and visual critique round
- Step 8: ui/pick.ts (pure isClick, 5 px; pickHandlers for meshes; recordDown on the canvas wrapper; onMissed clears selection only on a real click). Robot bodies and desk slabs (instanceId -> owner) are pick targets; no extra hit meshes. 3D pick -> select(id, true) -> Agents tab.
- Step 9: world/QualityMonitor.tsx (drei PerformanceMonitor, drop High -> Performance once, never auto-raise; nextQuality pure).
- Measured at 974 px: High 63 draw calls / 63.8k tris (shadows on); Performance 43 / 37.4k (shadows off). No console errors.
- Critique fixes: lost template literal in CameraController fitKey (PowerShell double-quoted replace ate `${...}`); z clamp symmetric, wall preset target moved 1 m in front of the wall; overview K 0.7 aimed at the desk-arc centroid; ROBOT_SCALE 1.25 and body #c9d1dc; brighter floor, hemisphere ground #3a3226, hub spotlight, stronger desk lights; hub floor halo r 2 and bigger orb; wall screen larger type; skyline 300 boxes over x +-95.
- Trap: never write TS with `${...}` through a PowerShell double-quoted string; use the Edit tool or single-quoted here-strings.

## Update 2026-11-08 (architect): Agent Room phase 6, living office (brief harness/briefs/T-0008-architect-p6.md)
- Engine: RoomState gained `called` (last delegation time per agent), `tasks` (kanban cards from task_state) and `shipped` (tool `commit <hash>`). Simulation emits DEMO-n tasks and labelled demo commits.
- world/office.ts is the pure plan: lead at LEAD_SPOT beside the board; called -> huddle slot (meetHoldSec), done -> report at the board (reportHoldSec), active -> desk, no event for idleAfterSec -> fixed pantry seat (seatOf, one per specialist). Guest: hidden at the door until active, then board, then bench. Tested in tests/agentRoomOffice.test.ts.
- liveWorld steps toward the plan; screen glow only when working AND arrived. Robots: activityPose (sit with mug sip, talk, type, slump), heading toward plan.look on arrival, seated drop to the seat height.
- Visuals: Board (kanban canvas, cards ease to their column, ship-it bell + ring on commits, SHIPPED counter), Pantry (one merged furniture mesh, steam, pendant light), DeskProps (merged per-specialist props, status lamps, EQ bars, globe, car), Door (sliding leaf + bench), Bursts (done sparks), daylight.ts (local clock -> sky, skyline windows, fill), director camera (Settings + camera bar; any drag turns it off).
- Knobs: reportHoldSec, celebrateSec, directorDwellSec, followRealClock (meetHoldSec and idleAfterSec reused).
- Measured (simulation, 1600x900, High): 88 draw calls, about 71k triangles, no GL error.

## Update 2026-11-08 (architect): Agent Room routing and phase 6 critique round
- world/nav.ts: furniture footprints from the layout (desks, hub, board, partitions, sofas, counter, tables, bench, plants), 0.2 m grid inflated by ROBOT_R 0.35, A* 8-way without corner cutting and an index tie-break, line-of-sight smoothing. Start/goal inside furniture (seats) use a short end leg from the nearest free cell. liveWorld recomputes a route only when the plan target changes and walks it at walking speed. tests/agentRoomNav.test.ts: work-loop routes for every specialist stay 0.15 m clear of every footprint between end legs; deterministic.
- Board moved to the left wall (yaw pi/2), lead at its back end, huddle rows in front; guest bench moved past the door.
- Overview: overviewFit() binary-searches the distance so all office corners project inside the free area with 8% padding (projectNdc pure, tested at 3 sizes); maxDistance 60 and fog from 65 m so a far overview is not fogged.
- Pantry darker and desaturated, one pendant over the bar, steam only while someone lounges; seated glance (index-seeded); desk screens flash green on done; delegation floor pulse desk -> board (extra instances in Trails); Agents tab shows the location (placeText from the mirrored office activity).
- Measured 1600x900 simulation: High 89 calls / 71k tris; Performance 62 / 42k. No console errors.

## Update 2026-11-08 (architect): Agent Room floor plan from the human (orange corridors)
- layout.ts follows the human's plan: BOARD on the back wall centre-left (kanban + mission strip, replaces WallScreen), DISCUSS table in front (Hub.tsx is now the table with strip, orb and floor halo), pantry back-right, desks in two 2x2 blocks (DESK_COLS / DESK_ROWS, roster order fixed), agents stand/sit on the desk front side facing the board, aisle at AISLE_X.
- corridors.ts is the only walking network: desk stubs, two row corridors per block, central aisle to the discuss ring, top corridor to the pantry entry, far-right corridor; huddle slots and the lead spot are ring nodes. route.ts = Dijkstra on it (+ mid-edge continuation) and grid legs (nav.ts) only into the pantry and onto the guest bench. Tested: every leg off those zones is a corridor edge, axis-aligned, clear of furniture.
- Agents sit on the desk chair to work (CHAIR_SEAT_Y 0.49, seated typing pose). Door and bench at the front-left on the row-2 corridor.
- Overview fitted from the front (dir 0, 0.8, 0.6). Camera bar collapses to icons under 640 px.
- Measured 1600x900 simulation, High: 90 calls / 70k tris, no console errors.
- Trap: three.js spot light targets need to be in the scene (Lighting adds spot.target).

## Update 2026-11-08 (architect): Agent Room polish round 2 and phase 5 (live)
- Polish: knob roomHalfWidth (12.5) scales the plan's x positions (SX); side walls are 80%-transparent glass with thin frames; floor split into work slabs (tiles) and a pantry slab (planks), tops all at y = 0, side by side; pantry glass partition on its west side (corridor enters from the south); board 7.5 x 2.7 m with large type and an agent status strip; under 640 px the playback controls sit in an overflow menu and the camera bar collapses to one button.
- Live: tools/agent-bridge/{lib.mjs (+ lib.d.mts for tests), hook.mjs, server.mjs, fixture.jsonl}. Port and ring size are read from the tuning file text (no duplicated values). hook.mjs redacts (event, ids, tool name, repo-relative file paths, agent ids, specialist words only), POSTs with a 300 ms limit, hard exit 0 at 900 ms. server.mjs: 127.0.0.1, CORS for the Vite origins, ring + SSE with Last-Event-ID, /replay, /health. Room: bridgeClient/live.ts (EventSource, connection pill), createLiveRuntime stamps events with the room clock; source order Live -> Replay -> Simulation, ?source= forces one.
- Hooks for the 7 events are in .claude/settings.local.json only. Run: npm run bridge, then open agent-room.html.
- Mapper fix: a generic agent_type (general-purpose, Explore) falls back to the specialist named by the pending delegation.
- Measured: High 96 / 70k, Performance 67 / 42k (1600x900). Hook round trip about 245 ms per event (node start-up).
- Trap: the first session id the room sees becomes the lead; a stale ring (fixture or an older session) makes the real main session show as guest until the bridge restarts.

## Review 2026-11-08 (Architect, cross-cutting)

Scope: this handbook's claims, `docs/agents/README.md` rules for the lead, `CLAUDE.md`, `harness/README.md`, `harness/workflows/WORKFLOW.md`, `docs/adr/README.md`. Method: Read and Grep/Glob/wc on the repo, plus a run of the guard files only: `tests/harness.test.ts`, `tests/layers.test.ts`, `tests/tuningParity.test.ts`, `tests/agentRoomTuning.test.ts`, `tests/agentRoomOwners.test.ts` (5 files, 528 tests, all pass). Not run: `npm run check`, `tests/budget.test.ts`, browser checks. No commit. Only this file was edited; stale lines above carry an inline "stale" or "2026-11-08" note and the old text is kept as history.

### Verified (current code, 2026-11-08)
- 350-line ratchet: `OVERSIZED` in `tests/harness.test.ts` is empty; no `src/` file is over 350 lines (largest `src/scene/CameraRig.tsx` 349). Tests are not covered: 11 files in `tests/` are over 350 (largest `tests/helpers/geometryAudit.ts` 832).
- Layering: `core/runtime.ts:4` imports `./types`; dependency-direction and layer tests pass. Feature folders import no `scene`/`ui` (guarded list below).
- Assets: 56 GLB under `public/models/` (quaternius, kenney-nature), 5 PNG + 1 JPG (`quaternius/textures/`), `LICENSE.txt` in both folders. `scene/useNatureTrees.ts` and `streets/natureTrees.ts` exist.
- Shaders: `shaders/cloudShade.ts` and `shaders/wetSurface.ts` exist; `|wx1` at `wetSurface.ts:114`; `person-rig-v3` at `traffic/people/rigShader.ts:95`; `building-body-v11` at `buildings/materials.ts:94` (corrected above).
- Budget values in `tests/budget.test.ts`: main <= 1,900,000 (lines 272, 286), shadow <= 605,000 (280), main+shadow <= 2,300,000 (291), draw calls <= 140 (296). Not re-measured.
- Agent Room: all 18 knob names from the 2026-11-08 updates exist in `src/config/tuning/agentRoom.ts`. Constants exist: `ROBOT_R` (nav.ts), `ROBOT_SCALE` (robotParts.ts), `CHAIR_SEAT_Y` (office.ts), `DESK_COLS`, `AISLE_X` (layout.ts), `LEAD_SPOT` (office.ts). 12 `tests/agentRoom*.test.ts` files exist. `tools/agent-bridge/` has lib.mjs, lib.d.mts, hook.mjs, server.mjs, replay.mjs, fixture.jsonl.
- Film: `mp4-muxer` pinned `5.2.2` in package.json; loaded by `import('mp4-muxer')` in `src/film/autoEncoder.ts:103`.
- ADRs 0001 to 0013 all present; `docs/adr/README.md` table matches.
- Harness: `.claude/settings.json` PostToolUse `Edit|Write` hook present (guarded by `harness.test.ts`, skipped in CI because `.claude/` is gitignored). `harness/config/`, `harness/scripts/`, `harness/templates/brief.md`, `docs/ACCEPTANCE.md`, `harness/state/handoffs/TEMPLATE.md`, `harness/tasks/TEMPLATE.md` exist. `.github/workflows/` has ci.yml, drift.yml, evals.yml, pr-checklist.yml.
- `npm run check` in package.json = `tsc --noEmit && npm run lint && vitest run && vite build` (matches CLAUDE.md and harness README).

### Stale or wrong (not invalid rules, but out of date)
- `building-body-v4` is now v11 (corrected above).
- localStorage allow-list is two files: `src/ui/SoundMixer.tsx`, `src/ui/sectionState.ts`.
- Network: `fetch` and `EventSource` are allowed only in `src/agentRoom/bridgeClient/` (ADR 0013). XHR and WebSocket are banned everywhere.
- `budget.test.ts` dynamic import is at line 82, not 88. Cap line is 296, not 308. The 132 figure is gone.
- `useTownPieces.ts` signature line is 51.
- Finding 5 (32 files over 350) is closed. Finding "core imports GustEvent" is closed.
- `src/ui/panels.css` is now a 12-line @import index over `src/ui/panels/*.css`; the harness README "1247 lines" note is stale.
- `harness/README.md` guard table and CI row miss several guards and workflows (see proposals).

### Rules: enforced vs stated
Enforced by a guard that passes now: 350-line ratchet (src only); dependency direction feature/core/store -> no scene/ui (`harness.test.ts`); core and store and agentRoom layers (`layers.test.ts`); no `Math.random` in core, store, city, streets, buildings, traffic, life, environment, agentRoom; no fetch/XHR/WebSocket/EventSource except bridgeClient; localStorage allow-list; settings hook present; docs point at real files; ownership table covers every src folder; ADR sections; workflow and claim records; tuning value parity for listed knobs; two duplicate lists (`HOUSE_PRESETS`, `MONUMENT_KINDS`); budget limits (budget.test.ts, not run here).

Stated but NOT enforced, or only partly:
- "Feature modules never import scene or ui": `film` is not in the guard's FEATURES list. `src/film/autoPath.ts:8` imports `../scene/cameraMath`; `src/film/autoRun.ts:8` imports `../scene/filmPath` (type). The 2026-11-04 plan said film reaches scene only through the driver mount. Gap.
- "No Math.random in layout code": guard excludes scene, sky, weather, audio, film, ui. `src/scene/useTownFrame.ts:93-94` (leaf drop) and `src/ui/HousePanel.tsx:89` use it. Only App.tsx `switchTrees` is in the handbook's exception list.
- "Every new knob: one doc line in config" and "row in docs/TUNING.md": not guarded. Parity checks values only for listed knobs.
- "No duplicate values": only the listed VALUES and DUPLICATE_LISTS, not a general check.
- "No knob literals in feature code": not guarded.
- "Lab copies only in labTuning.ts": labTuning values are checked, but no guard blocks other copies.
- "Visual motion uses sim time": not guarded. `src/film/filmClock.ts:7` takes `performance.now()` as a default argument; check that it drives only UI/file timing, not visuals. Not verified in depth.
- Edit hook: presence only, not behaviour. Hook command is not run by any test.
- Lead rule 5 (verification) lists `npx tsc`, `vitest`, `vite build` and omits lint, which `npm run check` includes.
- Lead rules 1, 3, 4 (reuse, briefs, handbook upkeep) and CLAUDE.md commit/attribution rules are process only.

Enforced but missing from the docs (add to `harness/README.md` guard table): settings hook; Agent Room layers; ownership and ADR records; workflow records and handoff template; claims and briefs; completed-task Review sections; eval cases; PR template, drift check, workflow shape, CODEOWNERS; duplicate lists in tuning parity; localStorage second file; ADR 0013 network exception.

### Open (not changed by this review)
- Finding 7: `src/store/io.ts:208` still strict version equality (low).
- Finding 8: `src/scene/useTownPieces.ts:51` `JSON.stringify` per block signature, unmeasured.
- Codec: `src/film/recorder.ts` still uses `avc1.42E028` (H.264 Baseline level 3.0, about 720x576 frame limit). No level check and no 1080p test found. The 2026-11-04 RISK is still open.
- `src/ui/HousePanel.tsx` Math.random in HousePanel (ui, unguarded): decide with UI & Camera.
- `src/film/filmClock.ts:7`: confirm the wall clock is not used for visuals.
- Budgets not re-run here; 2.3 M and 140 caps unverified by measurement; test comments disagree (130 vs 127).
- CI has never run on GitHub (2026-11-06 note still true per the harness README).
- Unverified: `createLayoutProvider` and `retargetTraffic` (city caching), `streets/index.ts` weatherUniforms, the GLSL reserved-word claim, lab clone list in `docs/agents/scene-qa.md`, `.claude/settings.local.json` hook count, `harness/evals/` contents.

### Proposed edits: applied 2026-11-08 by lead to CLAUDE.md, docs/agents/README.md and harness/README.md (list omitted here to keep the file guard-clean)

## Update 2026-11-08 (Agent Room)
- Lead desk: `LeadDesk.tsx`, one monitor and one keyboard, yawed by `agentRoom.leadDeskYaw` (-0.25 rad, mirrored from +0.25 so the front faces the subagent block to the south-west). Lead works at `LEAD_HOME` when it has a tool event; otherwise stands at the board's right end (`LEAD_NODE`).
- Subagent desks: 2.2 m long (was 1.6), monitors 1.5x (0.93 x 0.57 m), one keyboard per desk. Shared sizes and chair geometry in `deskParts.ts`.
- Board: 5.4 m tall (was 2.7). `ROOM.wallH` raised to 6.2 m so the board stays under the back wall top. Side walls and window glass are taller too (a visible change).
- Board ticker: one canvas, one texture. `ticker.ts` builds short status messages; `drawTicker` scrolls them by sim time (`boardTickerPxPerSec`). Redraw at `boardTickerHz`, separate from the card slide step (MAX_HZ).
- Discuss table: round (r 1.1 m), white stools on a ring of 9 seats (`SEAT_R` 1.65 m, `seatPos(k)`). Seat 0 faces the room, specialists take seats 0-7, the guest seat 8. Ring chords are the only non-axis corridor edges (test allows them).
- Seated huddle and report: ring agents sit on stools (relax pose, seat top `RING_SEAT_Y`). Lead huddle stays standing (seatY 0).
- Walk speed doubled: `avatarWalkSpeed` 2.8 m/s.
- Measured in the built-in pane, High tier, same method both times: before 65 draw calls / 42,380 triangles; after 76 / 47,406. The brief's 96 / 70k figures do not match this pane; the handbook's 2026-11-08 phase 9 note gives 63 / 63.8k at 974 px. Measure again in connected Chrome before quoting.
- Traps: Vite serves stale transforms after multi-file edits (`touch` the files or restart). `RING_SEAT_Y` must come after `STOOL_SEAT_Y` (const TDZ). Mesh `matrix` props are fragile in R3F: use positioned groups.
- Open: the lead's walkway passes about 0.4 m from the desk's front corner. Robot clearance and the ticker's redraw cost (a 2800 x 2016 texture upload at 12 Hz) are not measured. Stool and monitor layout not seen by eye at full size.
- Pre-existing, not from this work: `tests/harness.test.ts` "docs point at real files" fails on 18 stale path tokens in docs outside this owner's files (see the guard output; paths are listed there).
- Robots (later pass): no legs (zero gravity). Gliding robots pitch forward by `flyLeanRad` x speed; all floating robots hover by `hoverAmpM`. Leg mesh and leg pose fields removed.
- Lead: orange body (`leadRobotColor`). Sits at its desk while a tool runs; otherwise relaxes in the pantry on a ninth seat (bar stool at the bar's back, `seatOf('lead')`). Huddles still stand at LEAD_SPOT.
- Table light: yellow point light above the discuss table centre (`tableLightColor`, `tableLightIntensity`).
- Measured (same pane, High): 73 draw calls / 41,844 triangles.
- Lead desk (latest): yaw 0, head-on with the members. Lead sits on the far side (desk-local -z, LEAD_HOME north of the desk), monitor on the member side with the screen turned to the lead. Walkway runs down the desk's west end (LEAD_NODE) and round to the chair. Lead status not idle -> desk; idle -> pantry seat 9.
- Table light: bright blue (tableLightColor #3aa8ff, intensity 10).
- Plants: plants.ts (seeded, pure; off walkways, desks, table, board wall, pantry, door) rendered by PlantRows.tsx (2 instanced draw calls). Knobs plantTallCount 4, plantShortCount 6, heights 1.7 and 0.7 m. Trap: plants.ts and Plants.tsx clash on Windows (case-insensitive), so the renderer is PlantRows.tsx.
- Walking robots: arms hang still while gliding (no gait swing). Measured (High): 75 draw calls / 43,694 triangles.
- Plants (revised): fixed row beside the far-right corridor, wall side (x = RIGHT_X + 1.0), 1.6 m slots, alternating tall and short; counts plantTallCount 3 and plantShortCount 2. Random scatter removed; plants.ts no longer uses the seed.
- Lead route: enters from the top corridor (new node at LEAD_NODE.x on the top line), straight down the x = 1.2 spine, no ring chords. Guest desk: GuestDesk.tsx at (guestDeskX, guestDeskZ), walkway west along the guest seat row then north. Guest active -> desk; called -> ring.
- Table: top is discussTableColor (blue); the light is tableLightColor (yellow). Plants: one row of 3 (2 tall, 1 short) against the right window wall, 2.2 m spacing.
- Measured (High): 81 draw calls / 43,090 triangles.
- Hover name: a robot or desk under the pointer (pickHandlers -> hovered) shows its bubble with the agent label even with no speech text (Bubbles.tsx). No new render pass.
- Flight: avatarWalkSpeed 5.6 (doubled). easeFactor(done, len) in liveWorld.ts eases each route from easeMinSpeedFrac to full speed over easeRampM at each end (smoothstep, sim-time dt). Route length and progress are per route; a re-plan restarts the ease.

## Update 2026-11-08 (architect): node_modules drift guard
- Incident: dusk sky at 00:00. After the suncalc 2.1.1 bump (PR #15, d8f50de) local `node_modules` still had suncalc 1.9.0 (radians); code assumes v2 degrees. Fixed by `npm install` and deleting `node_modules/.vite`.
- Guard: `tests/depsSync.test.ts` compares each direct dependency's installed `node_modules/<pkg>/package.json` version with `package-lock.json`. Fails with "node_modules out of sync with lockfile: run npm install". Reads files via `fs` (not `require`; exports maps hide package.json). Optional deps may be absent.
- Rule: After any dependency bump, or pulling a merge that changes `package-lock.json`, run `npm install`, delete `node_modules/.vite`, and restart Vite.

## Update 2026-11-08 (architect): guest role removed
- Human request: only the lead and the specialists show work. `AgentId` has no `guest`. Deleted: `GuestDesk.tsx`, `Door.tsx` (guest door and bench), guest ring seat (SEAT_COUNT 9 -> 8), guest corridors, knobs `agentRoom.guestDeskX/Z` (parity rows and TUNING rows removed).
- Mapping (src/agentRoom/mapping/hook.ts): any event without `agent_id` is the lead (fixes the trap above: a stale session first in the ring made the live lead a guest). Agent/Task delegations queue per session; a subagent binds to agent_type, else its session's oldest pending delegation, else the lead. Agent `name` / SendMessage `to` match exactly first. Unmatched -> lead, counted in `stats.unmatched`. `specialistFromText` returns null for no match.
- Replay: unknown owners -> lead. Traps: parallel Agent spawns bind in first-event order (a guess if two start together). Checked against the live bridge ring: this session's subagents map to sky-environment and architect, the lead to lead, no guest.
- ADR 0013 "Decision change 2026-11-08" records this.

## Update 2026-11-09 (architect): Agent Room binding and doc review
- Ring check (`/events`, 331 events, seq 303): six Agent spawns in one second, each with a description only (`general-purpose`). Subagent events carry `agent_id` and `agent_type` only, never a name. Resumes use SendMessage `to` = the agent id.
- Fix (`src/agentRoom/mapping/hook.ts`): SendMessage `to` that is a known agent id now routes to that agent's bound specialist. Before, every id-addressed resume went to lead. Test: tests/agentRoomMapping.test.ts "SendMessage to a resumed subagent id".
- Limit, not fixed: a subagent whose first event finds no pending delegation binds to lead for the whole session. Parallel spawns bind in first-event order, so a wrong bind can happen. The durable fix is for the lead to pass `name` on Agent calls and for the mapper to read it at bind time; subagent events do not carry it today.
- Math.random outside the guard dirs: `src/scene/useTownFrame.ts:93-94` (leaf drop, Scene & QA), `src/ui/HousePanel.tsx:89` (random house pick, UI & Camera). Recorded in docs/agents/README.md open items.
- Codec: `src/film/recorder.ts:29` `avc1.42E028` (level 3.0) vs `src/film/autoEncoder.ts:10` `avc1.640028` (level 4.0). Open.
- Preview constants `PREVIEW_FLOORS` (3) and `PREVIEW_SEED` (1), `src/buildings/preview.ts:22,24`: contract constants, not knobs. Recorded in docs/TUNING.md section 12.
- Film guard gap (`FEATURES` at tests/harness.test.ts:59 lacks film): open, user decision.
- docs/TUNING.md: stale file:line refs in audio, traffic, life, city, sky rows re-pointed; config line numbers dropped (keys only); duplicate "Config now" rows removed from "Not yet tunable"; `uiCamera.walkSpeed` key fixed; `agentRoom.avatarWalkSpeed` row repaired.

## Update 2026-11-09 (architect): durable agent registry (binding by spawn record)
- Source of truth: each Agent spawn writes `{agentId, name, subagent_type, description}` to `harness/runs/agent-registry.json` (gitignored). Written by `tools/agent-bridge/registry.mjs` as a PostToolUse hook, matcher `Agent`, in `.claude/settings.json`.
- Field: the spawn result text carries `agentId: <hex>`; the hook reads it by searching the serialized `tool_response`, so it works for a string, a text block or an object. Confirmed from the session transcript (tool results); the live hook payload field must be confirmed on the first hook fire (see the live check note below).
- Backfill: `node tools/agent-bridge/registry.mjs --backfill <session.jsonl>` read 11 spawns of this session (8 specialist handbook reviews, 3 earlier). Ids and specialists are in the guard test `tests/agentRegistry.test.ts`.
- Bridge: `GET /registry` serves the file; `src/agentRoom/bridgeClient/loadRegistry.ts` loads it before the live feed; `createHookMapper(source, claims, registry)` binds registered ids first, then the delegation queue, then the first owned file, then lead.
- Process: after adding a hook, restart Claude Code (hooks load at session start). After changing the bridge, restart `npm run bridge` (the ring is lost). Then reload the room.
- Limit: subagents spawned before this change have no hook record; they are backfilled only from the transcript, and new sessions need the hook.

## Update 2026-11-11 (architect): delegated delivery (T-0009)
- Decision: `docs/adr/0014-delegated-delivery.md` supersedes the commit rule of ADR 0008. Agents land work on `dev` by task branch and pull request; `master` and eight other items are human-only. The lists are data in `harness/config/policies.json` (`autonomy`, version 2); other docs point there.
- Pipeline: `harness/workflows/delivery.md` (Intake, Plan, Delegate, Verify, Review, Land, Escalate, Improve), run through the deliver and improve skills (.claude/skills/). Durable specialists: .claude/agents/ (eight specialists plus a read-only reviewer); each definition points at its handbook and copies nothing from it.
- Backlog: records in `harness/tasks/backlog/` need `priority` (P1 to P3) and `type` (`harness/scripts/validate-task.mjs`). `node harness/scripts/next-task.mjs` lists them by priority then id; `--next-id` gives the next free id. Seeded T-0010 to T-0019 from the open items and known gaps; `src/ui/HousePanel.tsx` Math.random was already gone, so no record.
- Failure feedback: `drift.yml` and `evals.yml` open one GitHub issue labelled harness per failing title (`issues: write`). Not run on GitHub yet.
- Tracking: `.gitignore` ignores `.claude/*` and re-includes agents/, skills/ and settings.json. A plain `.claude/` ignore cannot be re-included (git does not descend into an ignored directory).
- Trap: the session permission classifier refused the agent edit of .claude/settings.json (self-modification), even with the human approval in the brief. The `permissions` block has to be applied by the human or the lead session.
- Trap: a Git Bash heredoc with many quotes and backticks failed to parse on Windows; write one-off scripts with the Write tool and run them with node.
- Trap: the docs guard reads a bare backticked name ending in .md, .json or .html as a root or docs/ file. Write the full path, or no backticks.
- Limit: permission rules match command prefixes, so `gh pr merge` cannot be limited to pull requests to `dev`. The git guard hook holds that rule once applied (next section); until then policy and workflow do. No GitHub branch protection is set from this repo.
- Open: first end-to-end deliver run; T-0010 (headless smoke) so visual and perf checks stop being human-only.

## Update 2026-11-11 (architect): T-0009 review fixes
- Git guard: `harness/scripts/guard-git.mjs` (PreToolUse hook on Bash; pure `decideGit(command, ctx)`, types in `harness/scripts/guard-git.d.mts`). Second pass after Scene & QA review: git or gh anywhere in a command counts (env, time, paths, substitutions); redirections and heredoc bodies are dropped; checkout tracks the branch; an unknown or detached branch blocks commit, merge, rebase and a pull without --ff-only; gh api writes on branch, protection, ref and merge paths are blocked. It holds what the permission prefixes cannot: commit on dev or master, push that is not `origin task/...`, pull request without `--base dev`, merge of a pull request whose base is not dev. It tracks `git switch` inside one command line and honours quotes. Not parsed: `bash -c`, eval, scripts. Fails open on a bad payload.
- The hook entry and the permission lists are in a proposed settings file handed to the human; an agent session cannot write .claude/settings.json.
- Hook command: a `node -e` one-liner that imports the guard by file URL from CLAUDE_PROJECT_DIR (else the git top level, else the working directory) and calls its exported `main()`. A relative `node harness/scripts/...` command exits 1 after a `cd`, which does not block. A load failure exits 2 (fail closed).
- Land order is fixed: stage, `check-claims --staged` with claims active, then release claims and move the record, then commit. Done lives on the task branch until the merge; a branch that cannot go green is corrected back to blocked.
- Backlog records from issues carry `source: issue-N`. No " #" in a front matter value: the readers strip text after " #" as a comment.
- Skills carry `disable-model-invocation: true` (on demand only).
- Open: GitHub branch protection for master and dev (human action); scheduled drift and eval runs only see master.

## Update 2026-11-11 (T-0010)
- Playwright 1.65.0 is an exact-pinned devDependency; `npm run smoke` runs `tests/smoke/smoke.mjs` (node and npm only, Windows safe). Browser: `npx playwright install chromium`.
- CI job `smoke` sits next to `check` and `secrets` (build, then smoke). Not a verify gate: it needs a browser. Making it a required check is a human action in the repository rules.
- Human checks dropped from quality-gates.json: console errors, blank canvas, draw calls and triangles. Kept: audio, visual taste, real-hardware frame time.
- Open: required-check rule for `smoke`; first CI run of the job unverified.
