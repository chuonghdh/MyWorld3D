# Scene & QA specialist
Reviewed 2026-11-01 at 02b0cdc

**Owns:** `src/scene/**` (everything not owned by UI & Camera or Audio), `src/core/**`, `src/App.tsx`, `src/main.tsx`, `src/dev/treeCompare/**` (tree lab, dev only), `tree-compare.html`, `dashboard/`, `public/models/**` (Quaternius and Kenney GLB, CC0), `tests/helpers/**`, budget and determinism tests, build health and project docs (`docs/BRD.md`, `REVIEW-01.md`, `DESIGN-3D.md`).

## Key files
- `scene/Town.tsx` (294 lines): mounts everything. The per-frame work lives in `useTownFrame.ts`; other hooks: `useTownPieces`, `useTownGreenery`, `useTownTraffic`, `useTownAircraft`, `useNatureTrees`; helpers `townBlocks.ts`, `townShadow.ts`, `mergeBlock.ts`. `runtime.ts` is a re-export of `core/runtime.ts`.
- `scene/PostFX.tsx` composer: MSAA, bloom, sanitize pass, shadow fit.
- `src/App.tsx`: panel wiring, `switchTrees` action (random tree species, a user action).

## Conventions
- Every file in `src/scene` <= 350 lines (largest is `Town.tsx` at 294). Repo-wide, 32 files are over 350 (architect finding 5).
- Order of work inside `useTownFrame.ts` matters: clock, gusts, wind uniforms, `setBuildingWind`, weather (`weather.update`), `setSnow`, lights and shadow fit, clouds, aircraft, smoke, leaves, traffic, walkers, signals, life, `audio.update`, then `clearLifeEvents()`. Do not reorder without reading the file.
- No per-frame allocation. Memo dependency arrays are exact; every created object is disposed.
- Leaves: `Town.tsx` emits falling leaves from broadleaf trees only (`NATURE_TYPES[].evergreen` filter). Memo deps `[layout, settings.seed]`, effect deps `[leaves, broadleaf]`.
- Tree field: `natureItems(layout, seed, overrides?)` in `src/streets/natureTrees.ts` scales every tree by the layout scale times `TREE_SCALE` (1.35) unless `treeScale` is overridden. Species overrides (`treeOverrides`) reach the city through `useNatureTrees` (`natureOverridesFor`). If the GLB load fails, `useNatureTrees` falls back to procedural `createTreeField` (scale 1.35, species applied) and logs the error.
- Quality tiers Low / Med / High.

## Budgets (`tests/budget.test.ts`)
Limits are in the tests, not in prose. Changing one needs a measured reason written here and Scene & QA approval.
- Main-pass triangles <= 1,900,000. Blocks (main) between 1,100,000 and 1,140,000.
- Shadow-pass triangles <= 605,000.
- Main + shadow triangles <= 2,300,000.
- Draw calls (main meshes + shadow meshes) <= 140. Do not raise this to pass a test.
- Detail meshes: at most one per seeded house block.
- Counting rule: shadow-only meshes (layer not 0) count in the shadow total only. Broadleaf leaves no longer use shadow copies, so this case is currently empty.
- Last measured (seed 1, default settings, dev commit with street trees at rate 0.44): main 1,581,859, shadow 592,339, main + shadow 2,174,198, draw calls 132 (100 main + 32 shadow).
- Measured with the 1-in-5 monument rule (default settings, no merges; 16 blocks, 3 monuments each, cathedral and City Hall present):
  - seed 1: main 1,416,737 (limit 1,900,000); shadow 575,513 (605,000); main + shadow 1,992,250 (2,300,000); draw calls 127 (95 + 32) (140); house-block main 955,231 (band 900,000-1,000,000).
  - seed 7: main 1,423,544; shadow 577,972; draw calls 128.
  - seed 1234: main 1,443,579; shadow 565,477; draw calls 128.
  - All within limits; no budget raised. The test counts every monument body as a shadow caster (`monumentShadowKinds` is only the cathedral in the real render), so the shadow figure is an upper bound.

## Traps
- A night "black block curtain": NaN from `pow(1-v, 1.7)` with v slightly above 1 -> clamp; the sanitize pass is a safety net. Headlight glow "dashes" had the same root cause.
- Stale Vite dev server shows "does not provide an export": kill the process on 5173 and restart; never truncate a source file with a shell redirect while HMR watches it.
- The pedestrian timing test ("600 walkers", `tests/people.test.ts` / `audioPeople`) is a flake under load.
- Runtime crashes can pass tsc and unit tests: load the page and read the console after wiring changes.
- Built-in browser pane cannot paint frames; verify scene graph, uniforms and shader compile instead.
- Tree lab: `computeBoundingSphere` TypeError when a cloned or merged geometry has no bounding sphere. Fixed by computing the sphere in `add()` when missing.

## Tree lab (`src/dev/treeCompare`, isolated clone)
- `labNatureTrees.ts` clones `src/streets/natureTrees.ts`. `labLoader.ts` clones `loadNatureAssets` from `useNatureTrees` without the React hook. `labLeaves.ts` wraps the city `LeafSystem` (`environment/leaves.ts`), so the lab runs the same leaf code.
- Shared modules the lab does not clone (`environment/trees.ts`, `environment/forest.ts`, `environment/leafVariety.ts`, `environment/wind.ts`, `shaders/wetSurface.ts`, `weather/*`) are imported. Edits there reach the city too.
- Decision: the lab stays a clone, not an import of city tree code, so city edits cannot break the lab page silently. Lab clones stay separate from the city until the user approves a merge.
- Not in the bundle (dev-only). `tree-compare.html` is a dev-server entry only; `vite.config.ts` has no multi-page input.

## Browser verification (run before any new work)
1. `list_connected_browsers` (Claude in Chrome). It must show one connected, local browser. If it is empty, stop and ask the user to connect Chrome. Do not fall back silently.
2. `tabs_context_mcp` with `createIfEmpty: true`, then navigate the tab to `http://localhost:5173/` (dev server must be running).
3. Wait about 6 s, then read console errors (`read_console_messages`, `onlyErrors: true`) and check `canvases >= 1` and WebGL available (`javascript_tool`).
4. Take a screenshot (`computer` screenshot, `save_to_disk: true`) and look at it. This is the only place a frame can be seen.
5. Close the tab when done unless the user wants it kept.

Last smoke test: passed on 2026-10-29 (page title MyWorld3D, one canvas, WebGL on, no console errors, Settings panel and town visible). The built-in pane in the app cannot paint frames: do not use it for visual checks.

## Process knowledge
- Run in this order before reporting: `npx tsc --noEmit`, `npx vitest run`, `npx vite build`. Print only failures and summaries.
- Commits only on the user's word, in English, with the attribution line from the current system reminder.

## Open items
- Real-window visual QA of the tree lab, autumn leaves and winter trees (scene graph and shader checks only so far).
- Rerun the pedestrian flake solo on every full vitest run. Consider a looser threshold or a fixed-time harness if it keeps failing.
- Round 6.5 optional backlog (tram, canal and boats, seasonal events).

## How to verify
`npx tsc --noEmit`, `npx vitest run` (rerun the pedestrian flake solo), `npx vite build`. Budget numbers: `tests/budget.test.ts`. Visual claims: connected Chrome only, and say what was not seen by eye.

## Public buildings pass (branch optimize_02)
- Monument shadows are OFF: `src/scene/useTownPieces.ts` sets `castShadow = false` on every mesh of a monument group after `buildMonument`. Houses, streets and trees keep their shadows. Reason: shadow headroom was 12.7k against about 5k per monument (see docs/agents/public-buildings-review.md, X1).
- `tests/budget.test.ts` builds every monument block of the seeded town (seed 1 has one: swimming-pool, about 4.9k shadow triangles) and counts ALL monument bodies as shadow casters, although the real render stops monster shadows in useTownPieces.ts. So the test is conservative for monuments: real shadow pass = test total minus the monuments that do not cast. Its numbers now: main 1,582,611; shadow 592,995; draw calls 132.
- Config split: `src/config/tuning/` (one file per section, `index.ts` re-exports). `tests/tuningParity.test.ts` reads the folder as one text (`source('src/config/tuning.ts')` maps to it).
- Pre-existing failures on dev 86f0c15, not from this work: three tests fail on dev too: blockMerge default-town hash, blockMerge invalid group, and the city streetTreeMultiplier superset at `tests/city.test.ts:106`. Do not attribute them to monuments or the config split.

## Film recorder P1 (branch feature_video_camera, 2026-11-04)
- `src/film/recorder.ts`: `startRecording` (canvas.captureStream + MediaRecorder, optional audio tracks), `downloadBlob`, `isRecordingSupported`. Pure helpers `mimeCandidates`, `pickMimeType`, `filmExtension`, `filmFileName` are unit-tested in `tests/film/recorder.test.ts`.
- MIME order: mp4 avc1 (+mp4a when audio), webm vp9, webm. Filename `myworld3d-film-<ISO>.mp4|webm`.
- Knob: `film.videoBitrate1080` (`src/config/tuning/film.ts`), the MediaRecorder bitrate. 4K was dropped by the user. fps is a caller argument.
- `startRecording` throws when canvas size differs from `width`/`height`. Size is driven by `src/film/resizeBridge.ts`: `applyFilmSize` sets the GL buffer (pixel ratio 1), camera aspect and composer; `restoreFilmSize` undoes it. PostFX registers the root via `registerFilmRoot`. Idempotent, HMR-disposed. `filmSession.ts` applies before recording and restores after the file is saved or on cancel.
- While filming, the bridge wraps `gl.setSize` / `gl.setPixelRatio` on the instance (guard). R3F's window-resize calls are held: the film buffer stays, the window size and pixel ratio are remembered and applied on restore. The canvas is letterboxed (`fitInside`) to the film aspect so the preview is not distorted.
- Bridge limits: pointer mapping uses R3F's window size, so clicks on the letterboxed view can be off (selection is locked while filming).
- Audio tracks are caller-owned and not stopped; only the canvas capture track is stopped on end.
- Open: bitrate values are first guesses; sharpness and file size check belong to P6. No real recording verified in the built-in pane.

## Update 2026-11-04 (lead): camera while filming, film path, aircraft slots

- **Camera while filming:** `CameraRig.tsx` centres the whole town during a film (no view offset) and restores the overview offset when the film ends. Filming hides the side panels, so the measured panel inset must not drive the picture.
- **Film frame aspect:** `PostFX.tsx` registers the camera with a duck-typed check (`'aspect' in camera`). The earlier `instanceof PerspectiveCamera` check could miss the scene camera; the film aspect was then never applied and the frame was squashed.
- **Resize bridge:** `resizeBridge.ts` passes a `SizeTarget` with `set()` to `gl.getSize`, as three.js requires. Test fakes must mirror this.
- **Overview direction:** `uiCamera.overviewDirection` is `[0, 2.45, 0.63]`, raised by the user. The opening flight derives its view from the same knob (`overviewView()`), not from the live camera.
- **Aircraft:** `SLOTS` is now 4 (was 3). Slower flights (22.4 to 50.4 m/s) last longer, so a slot is reused four windows later. The opening flight uses id -2 and `slotFlight` sentinel is `-Infinity`.
- **P2 (done, 157c706):** `src/film/autoPath.ts` holds the pure path (placeholder orbit), `autoFrameCount`, `gameMinutesPerFrame` and the FNV-1a `dryRun`. Tests in `tests/film/autoPath.test.ts`.
- **P3 (in progress):** auto encoder with `VideoEncoder` and a lazy `mp4-muxer` import. Owned by this agent. See the lead's notes for the assignment.

## Update 2026-11-04 (scene-qa): FilmRig mounted, auto film clock

- **Mount:** `App.tsx` renders `<FilmRig />` after `<CameraRig />` inside the Canvas. FilmRig's useFrame runs after CameraRig's, and CameraRig returns early while auto film runs, so FilmRig alone places the camera.
- **Activation:** FilmRig registers its source with `registerAutoFilmSource` (ui/filmSession.ts) on mount. The run snapshot (city, seed, sun, moon, fov) is taken when the source is called. Camera is written by autoRun via `setPose` (no useFrame). CameraRig yields while `autoFilmHoldsCamera()` is true. Flag clears when `toggles.filming` goes false.
- **Snapshot:** city layout, seed, sun and moon (`getSunDirection` / `getMoonDirection` at `settings.timeOfDay`) and the film camera fov are read once when the run starts. The path is built on that snapshot and kept until the film ends.
- **Clock:** `src/film/filmClock.ts` is owned by UI & Camera (filmSession). FilmRig reads `currentFilmTime()` from autoRun.ts instead.
- **Bird:** `createFilmBird()` is added to the scene at run start and removed and disposed at run end. One mesh, no shadow. Its pose comes from `birdPoseAt` with a sampler over `FilmPath.poseAt`.
- **Hand-off:** CameraRig sets `controls.enabled = false` while the film holds the camera. At film end the orbit target is set to the ground point the camera looks at, then orbit resumes.
- **Open:** no UI starts an auto film yet. Camera jump at film start (orbit pose to path start) is not checked in Chrome. Building the path runs in the first film frame and may hitch.

## Update 2026-11-06 (film frameloop)

- **Gotcha:** R3F 8.17 `configure()` runs on every `<Canvas>` render and does `if (state.frameloop !== frameloop) state.setFrameloop(frameloop)` from the prop (default `'always'`). An imperative `setFrameloop('never')` is undone by the next App re-render (filming hides UI, film resize). The auto film then ran on wall time (~5 min for 60 s), so cars and walkers moved ~5x too fast in the MP4 while camera and bird followed film time. In `'always'` mode `advance()` also uses `clock.getDelta()`, so the fixed steps added almost nothing.
- **Fix:** `src/film/loopHold.ts` is the one source of truth (`useFilmLoopHold.held`). `App.tsx` passes `frameloop={canvasFrameloop(held)}`. `holdFilmLoop` sets the flag and applies `'never'` at once, then reads the stepper start from the clock (setFrameloop resets `elapsedTime` to 0), so the first delta is exactly 1/fps. `releaseFilmLoop` restores `'always'` when filming ends.
- **Guard:** each fixed step throws (film fails with a message) if the loop is not `'never'` or the clock is off the film timeline. `useTownFrame` gives dt 0 to any real-time frame while the hold is on.
- **Start:** FilmRig takes the loop, camera hold and bird on the first `setPose`/`renderFrame`, not when the source is called, so a start that fails before the run (encoder open, size) leaves the loop and camera untouched.
- **Manual film:** unchanged; it never holds the loop, so the Canvas stays `'always'` (real time).
- Tests: `tests/film/loopHold.test.ts` (fake R3F root with configure, rAF and advance semantics).
- Follow-up: fountain water clock moved to `runtime.simTime`; building wind was already sim-driven. `Selection.tsx` pulse uses R3F clock (film time when held; selection locked while filming).

## Update 2026-11-06 (house type thumbnails)
- `scene/houseThumbs.ts` (store `useHouseThumbs`: `thumbs`, `requested`, `request()`; pure `frameThumbCamera`, `nextThumbPreset`, `flipAndUnpremultiply`) and `scene/HouseThumbRenderer.tsx` (mounted in the Canvas after FirstFrame) render one preset per frame after `request()`, into a 4x MSAA half-float target with their own warm key + hemisphere fill, then OutputPass (renderer tone mapping and colour space) into an 8-bit target, read back, flip, unpremultiply, PNG data URL. Restores render target, clear colour/alpha, autoClear and shadow needsUpdate. Skips while filming. A failed preset stores '' (placeholder stays, no per-frame retry). Shared building materials carry the current weather uniforms (wet/snow) into the picture. Knobs: `sceneQa.houseThumbs.*`. Tests: `tests/houseThumbs.test.ts`.
- 2026-11-06: glass-tower 7-floor minimum removed (`townBlocks.houseParamsFor`, mirror in `tests/helpers/cityBuild.ts`); every preset uses `ov.floors ?? lot.floors` (user decision).
- 2026-11-06: `houseParamsFor` gives a user-picked type (ov.preset, not as-block) its `presetDefaultShutter` when the lot style has none and the preset can carry shutters; untouched houses keep the lot look.
- 2026-11-06: `scene/cityStyle.ts` town shutters now read `SHUTTER_COLORS` (sage, blue, oxblood, cream, grey; same order) from `buildings` instead of hex literals (duplicate-value rule).
- 2026-11-06 (roof icons dropped): the Roof picker stays buttons with small icons; no roof pictures are rendered (`houseThumbs.ts` and `HouseThumbRenderer.tsx` are type-only again).

## Update 2026-11-06 (selection in store)
- `App.tsx` reads `selected` and `setSelected` from `useWorldStore` (no React state). `select()` and `onPointerMissed` write the store; CameraRig reads the same field for the orbit pivot. Transient, not persisted.
- Test: `tests/appSelection.test.ts` (store set/clear, App source reads the store).
