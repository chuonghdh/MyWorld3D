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
- **Textures and shaders.** Shared canvas textures are created once and cached. Shader patches go through `onBeforeCompile` with a `customProgramCacheKey` that is versioned (e.g. `building-body-v4`, `person-rig-v3`). Chained patches append a suffix to the previous key (e.g. `|wx1` in `shaders/wetSurface.ts`). Shared patches live in `src/shaders/` (`cloudShade.ts`, `wetSurface.ts`). No GLSL identifier `patch` is used.
- **Audio.** Sound routing follows `docs/AUDIO.md`. The Audio specialist owns the bus and emitters.
- **Fonts, icons, UI assets.** Inline SVG in TSX or small CSS. No fetch, XHR or WebSocket in `src`; `localStorage` is used only in `src/ui/SoundMixer.tsx`.
- **Caching.** Anything that depends on layout is keyed by `layoutKey`. `cityLayoutKey` (`src/city/layoutKey.ts`) ignores `trafficMultiplier` and includes `blockMerges`. `createLayoutProvider` is single-entry; `retargetTraffic` changes only spawns. Pieces are cached per block signature (`useTownPieces`).
- **Save files.** JSON settings are the only persisted state. Every new field needs a default, validation in `io.ts`, and a migration note if old saves change meaning.

## Performance standards
- **Frame budget.** 60 fps target on a mid-range desktop GPU at the default quality tier; 30 fps floor on phones at the lowest tier. Frame time is measured, not guessed.
- **Draw calls and triangles.** The guard tests in `tests/budget.test.ts` are the limit (see Scene & QA handbook for current values). Raising a limit needs a measured reason written in the handbook and approval from Scene & QA.
- **Rebuild cost.** A user action that rebuilds the town has a time budget. Reference: 1x1 to 1x2 merge ~1 s, 1x2 to 2x2 ~2.4 s (accepted for now; speed-up is backlog). A new feature may not make these worse without a note.
- **Determinism.** Same seed and settings produce the same output. No `Math.random` in layout code (city, streets, buildings, traffic, environment, life, store). Exceptions: `App.tsx` `switchTrees` (user action, species saved with the layout, accepted) and audio (not layout).
- **No coplanar geometry.** Decals use distinct heights plus polygon offset.
- **Visual quality is not traded silently.** A cheaper path needs side-by-side evidence and a note.
- **Measurement.** Use the `__r3f` dev handle (draw calls, triangles) and `performance.now()` around layout builds. The built-in browser cannot paint frames; use the connected Chrome for visual or timing checks and say what was not seen.

## Traps
- Vite can serve a stale transform of a module after a multi-file edit. A `ReferenceError` in a module that looks correct means the server is stale: touch the file or restart the dev server, then recheck the served source.
- An error inside the R3F Canvas unmounts the whole React tree, which looks like a blank page. Boot screen and error boundary exist for this (`src/ui/boot.ts`, `src/ui/ErrorBoundary.tsx`).
- Node-only APIs (`node:fs`) in tests break `tsc` unless node types are configured. `tests/budget.test.ts` (line 88) builds the module name by string concatenation in a dynamic import; keep that pattern. Or use Vite `?raw` imports.
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
| 3 | Draw-call guard, dead 400 limit | Closed. No 400 limit in `tests/budget.test.ts`; cap 140 (line 308). Test comments disagree on the measured figure (130 at line 269, 132 at line 307); not re-measured here |
| 4 | Shader ownership split | Closed, committed in `6a89651`. `src/shaders/wetSurface.ts` and `src/shaders/cloudShade.ts` exist; `environment/cloudShade.ts` re-exports; `weather/wet.ts` imports `../shaders/wetSurface` |
| 5 | Files over 350 lines | Open. 32 files over 350 lines. `traffic/vehicles.ts` 314 (was 1794), `traffic/pedestrians.ts` 281 (was 1511). Largest: `buildings/facade/roof.ts` 1070, `ui/panels.css` 930, `life/birds.ts` 801, `audio/vehicles.ts` 770. Each owner splits its own files, no behaviour change |
| 6 | `Math.random` for tree species (`App.tsx`, `switchTrees`) | Accepted. Random on purpose; species travel with the exported layout (`exportLayout` / `importLayout` in `store/io.ts`) |
| 7 | Import version check strict equality (`store/io.ts:208`) | Open, low priority (UI & Camera). No migration path; only user-triggered export and import exist |
| 8 | Signature `JSON.stringify` per block | Open, unmeasured. `src/scene/useTownPieces.ts:50` stringifies `lots` and house overrides on every memo run. Measure with `performance.now()` before changing |

New finding (open): `src/core/runtime.ts:4` imports the type `GustEvent` from `environment/wind`. Type-only and erased at build, but `core` should not depend on feature modules. Move `GustEvent` to `core/types.ts`. Owner: Scene & QA.

## Open items
- Findings 5, 7 and 8 above, and the `core/runtime.ts` type import.
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
   - `src/film/flightPath.ts` (pure keyframes, Catmull-Rom, input is sun/moon direction and cathedral site). Owner: UI & Camera (camera path), data from Sky & Environment and Buildings.
   - `src/film/driver.tsx` (mounted in Canvas, fixed-dt stepping, cancel and unmount cleanup). Owner: Scene & QA.
   - `src/film/recorder.ts` (VideoEncoder + muxer, MediaRecorder fallback, backpressure: `encodeQueueSize` cap, `VideoFrame.close()` each frame). Owner: Scene & QA.
   - `src/film/offlineAudio.ts` (snapshot store and offline render glue). Owner: Audio.
   - `src/life/filmBird.ts` (one merged mesh, reuses the `flyer` animal material key, no new shader). Owner: Traffic & Life.
   - `src/ui/FilmMenu.tsx` (menu, progress, cancel); `TimeBar.tsx` only mounts it. Owner: UI & Camera.
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
- Dashboard card for Technical Architect not updated here (lead rule 5).
- CLAUDE.md names `src/config/tuning.ts`; actual path is the `src/config/tuning/` directory. Fix in CLAUDE.md or flag to the lead.
