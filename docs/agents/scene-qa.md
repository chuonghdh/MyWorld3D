# Scene & QA specialist
Reviewed 2026-11-01 at 02b0cdc

**Owns:** `src/scene/**` (everything not owned by UI & Camera or Audio), `src/core/**`, `src/App.tsx`, `src/main.tsx`, `src/dev/treeCompare/**` (tree lab, dev only), `tree-compare.html`, `public/models/**` (Quaternius and Kenney GLB, CC0), `tests/helpers/**`, budget and determinism tests, build health and project docs (`docs/BRD.md`, `REVIEW-01.md`, `DESIGN-3D.md`).

## Key files
- `scene/Town.tsx` (295 lines): mounts everything. The per-frame work lives in `useTownFrame.ts`; other hooks: `useTownPieces`, `useTownGreenery`, `useTownTraffic`, `useTownAircraft`, `useNatureTrees`; helpers `townBlocks.ts`, `townShadow.ts`, `mergeBlock.ts`. `runtime.ts` is a re-export of `core/runtime.ts`.
- `scene/PostFX.tsx` composer: MSAA, bloom, sanitize pass, shadow fit.
- `src/App.tsx`: panel wiring, `switchTrees` action (random tree species, a user action).

## Conventions
- Every file in `src/scene` <= 350 lines (largest is `Town.tsx` at 295). Repo-wide: no file in `src/` is over 350 (`OVERSIZED` in `tests/harness.test.ts:128` is `{}`; checked 2026-11-09).
- Order of work inside `useTownFrame.ts` matters: clock, gusts, wind uniforms, `setBuildingWind`, weather (`weather.update`), `setSnow`, lights and shadow fit, clouds, aircraft, smoke, leaves, traffic, walkers, signals, life, `audio.update`, then `clearLifeEvents()`. Do not reorder without reading the file.
- No per-frame allocation. Memo dependency arrays are exact; every created object is disposed.
- Leaves: `Town.tsx` emits falling leaves from broadleaf trees only (`NATURE_TYPES[].evergreen` filter). Memo deps `[layout, settings.seed]`, effect deps `[leaves, broadleaf]`.
- Tree field: `natureItems(layout, seed, overrides?)` is defined in `src/streets/natureLayout.ts:50` and imported by `Town.tsx` from `src/streets/natureTrees.ts`. It scales every tree by the layout scale times `TREE_SCALE` (1.35, `src/config/tuning/cityStreets.ts:40`, re-exported by `src/streets/natureTypes.ts:50`) unless `treeScale` is overridden. Species overrides (`treeOverrides`) reach the city through `useNatureTrees` (`natureOverridesFor`). If the GLB load fails, `useNatureTrees` falls back to procedural `createTreeField` (scale 1.35, species applied) and logs the error.
- Quality tiers Low / Med / High.

## Budgets (`tests/budget.test.ts`)
Limits are in the tests, not in prose. Changing one needs a measured reason written here and Scene & QA approval.
- Main-pass triangles <= 1,900,000. Blocks (main) between 900,000 and 1,000,000 (`tests/budget.test.ts:275-276`).
- Shadow-pass triangles <= 605,000.
- Main + shadow triangles <= 2,300,000.
- Draw calls (main meshes + shadow meshes) <= 140. Do not raise this to pass a test.
- Detail meshes: at most one per seeded house block.
- Counting rule: shadow-only meshes (layer not 0) count in the shadow total only. Broadleaf leaves no longer use shadow copies, so this case is currently empty.
- UNVERIFIED (stale per Review 2026-11-08; the test comments at `tests/budget.test.ts:258-262` quote different numbers; re-measure before use). Last measured (seed 1, default settings, dev commit with street trees at rate 0.44): main 1,581,859, shadow 592,339, main + shadow 2,174,198, draw calls 132 (100 main + 32 shadow).
- Measured with the 1-in-5 monument rule (default settings, no merges; 16 blocks, 3 monuments each, cathedral and City Hall present):
  - seed 1: main 1,416,737 (limit 1,900,000); shadow 575,513 (605,000); main + shadow 1,992,250 (2,300,000); draw calls 127 (95 + 32) (140); house-block main 955,231 (band 900,000-1,000,000).
  - seed 7: main 1,423,544; shadow 577,972; draw calls 128.
  - seed 1234: main 1,443,579; shadow 565,477; draw calls 128.
  - All within limits; no budget raised. The test counts every monument body as a shadow caster (`monumentShadowKinds` is only the cathedral in the real render), so the shadow figure is an upper bound.

## Traps
- A night "black block curtain": NaN from `pow(1-v, 1.7)` with v slightly above 1 -> clamp; the sanitize pass is a safety net. Headlight glow "dashes" had the same root cause.
- Stale Vite dev server shows "does not provide an export": kill the process on 5173 and restart; never truncate a source file with a shell redirect while HMR watches it.
- The pedestrian timing test (`tests/people.test.ts:655`, "simulates the default crowd fast enough", 385 walkers) is a flake under load. `tests/audioPeople.test.ts:233` ("steps faster") also flaked once solo (2026-11-09 review).
- Runtime crashes can pass tsc and unit tests: load the page and read the console after wiring changes.
- Built-in browser pane cannot paint frames; verify scene graph, uniforms and shader compile instead.
- Tree lab: `computeBoundingSphere` TypeError when a cloned or merged geometry has no bounding sphere. Fixed by computing the sphere in `add()` when missing.

## Tree lab (`src/dev/treeCompare`, isolated clone)
- `labNatureTrees.ts` is a 14-line re-export barrel over `labNature*.ts` (split 2026-11-06). The lab code clones city tree code in those files. `labLoader.ts` clones `loadNatureAssets` from `useNatureTrees` without the React hook. `labLeaves.ts` wraps the city `LeafSystem` (`environment/leaves.ts`), so the lab runs the same leaf code.
- Shared modules the lab does not clone (`environment/trees.ts`, `environment/forest.ts`, `environment/leafVariety.ts`, `environment/wind.ts`, `shaders/wetSurface.ts`, `weather/*`) are imported. Edits there reach the city too.
- Decision: the lab stays a clone, not an import of city tree code, so city edits cannot break the lab page silently. Lab clones stay separate from the city until the user approves a merge.
- Not dev-only: `vite.config.ts:8` lists `index.html`, `tree-compare.html` and `agent-room.html` as build inputs, so the tree lab is in the production build.

## Browser verification (run before any new work)
1. `list_connected_browsers` (Claude in Chrome). It must show one connected, local browser. If it is empty, stop and ask the user to connect Chrome. Do not fall back silently.
2. `tabs_context_mcp` with `createIfEmpty: true`, then navigate the tab to `http://localhost:5173/` (dev server must be running).
3. Wait about 6 s, then read console errors (`read_console_messages`, `onlyErrors: true`) and check `canvases >= 1` and WebGL available (`javascript_tool`).
4. Take a screenshot (`computer` screenshot, `save_to_disk: true`) and look at it. This is the only place a frame can be seen.
5. Close the tab when done unless the user wants it kept.

Last smoke test: passed on 2026-10-29 (page title MyWorld3D, one canvas, WebGL on, no console errors, Settings panel and town visible). The built-in pane in the app cannot paint frames: do not use it for visual checks.

## Process knowledge
- Run `npm run check` before reporting (`package.json:10`: tsc, lint, vitest, vite build). Print only failures and summaries.
- Commits only on the user's word, in English, with the attribution line from the current system reminder. (Superseded 2026-11-11 by ADR 0014, `docs/adr/0014-delegated-delivery.md`: the lead commits on a task branch and lands through a pull request to `dev`, see `harness/workflows/delivery.md`. Specialists never commit or push.)

## Open items
- Real-window visual QA of the tree lab, autumn leaves and winter trees (scene graph and shader checks only so far).
- Rerun the pedestrian flake (385-walker default crowd) solo on every full vitest run. Consider a looser threshold or a fixed-time harness if it keeps failing.
- Round 6.5 optional backlog (tram, canal and boats, seasonal events).
- Decision (2026-11-09): `Math.random` at `src/scene/useTownFrame.ts:93-94` picks the spawn point of a leaf devil (user-triggered transient leaf burst). Visual only: not layout, not stored, not saved state, not in the guard dirs. Kept as is. Caveat: a film run can differ in where a devil spawns; if film reproducibility matters, switch to a seeded rng from a request counter.
- Lab mirror (2026-11-09): removed conifer and broadleaf leaf-snow geometry (`snowLeaves`, `snowLeafMat`) from `src/dev/treeCompare/labNatureAsset.ts`, `labNatureField.ts`, `labNatureTypes.ts`, matching the city change (City & Streets). Conifer snow comes from the weather shader on the leaf material; bark snow stays.

## How to verify
`npx tsc --noEmit`, `npx vitest run` (rerun the pedestrian flake solo), `npx vite build`. Budget numbers: `tests/budget.test.ts`. Visual claims: connected Chrome only, and say what was not seen by eye.

## Public buildings pass (branch optimize_02)
- Monument shadows are OFF except kinds in `buildings.monumentShadowKinds` (currently `['gothic-cathedral']`, `src/config/tuning/buildings.ts:114`): `src/scene/useTownPieces.ts:66-69` sets `castShadow = false` for the other monument kinds. Houses, streets and trees keep their shadows. Reason: shadow headroom was 12.7k against about 5k per monument (see docs/agents/public-buildings-review.md, X1).
- `tests/budget.test.ts` builds every monument block of the seeded town (seed 1 has one: swimming-pool, about 4.9k shadow triangles) and counts ALL monument bodies as shadow casters, although the real render stops monster shadows in useTownPieces.ts. So the test is conservative for monuments: real shadow pass = test total minus the monuments that do not cast. Its numbers now: main 1,582,611; shadow 592,995; draw calls 132.
- Config split: `src/config/tuning/` (one file per section, `index.ts` re-exports). `tests/tuningParity.test.ts` reads the folder as one text; its virtual name for that folder stands for the folder.
- Pre-existing failures on dev 86f0c15, not from this work: three tests fail on dev too: blockMerge default-town hash, blockMerge invalid group, and a city streetTree test (name unverified; `tests/city.test.ts:106` is now "plants trees in every setting"). Blockmerge tests are at `tests/blockMerge.test.ts:98,166,186`. None fail on the 2026-11-09 full check. Do not attribute them to monuments or the config split.

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

## Update 2026-11-06 (test fixes after child gait and building shader change)
- `tests/clouds.test.ts`: building cache key expectation is now `building-body-v11` (shader key from `buildings/materials.ts`). Cloud-shadow splice check unchanged.
- `tests/traffic.determinism.test.ts`: pedestrian baseline re-captured to `63333cfb` for the child gait change (d47180a). Verified: with child gait knobs reset to pre-change values the hash returns to `a8684131`, so only children changed. Vehicle baseline unchanged.
- `tests/people.test.ts` "600 walkers" timing: passes alone; left as is (known load flake).

## Harness refactor (2026-11-06)
- `src/dev/treeCompare/labNatureTrees.ts` (692 lines) split, code unchanged: `labNatureTypes.ts` (types, slots, items), `labNatureGeometry.ts` (islands, clusters, thinning, foliage, snow caps), `labNatureVariety.ts` (leaf colour shader), `labNatureAsset.ts` (GLB to asset), `labNatureField.ts` (instanced field).
- `labNatureTrees.ts` is now a re-export barrel, so `labLoader.ts` and `main.ts` imports are unchanged.
- Lab stays independent of the city. No knob or geometry change.

## Update 2026-11-08 (T-0008 phase 1, agent room guards)
- `vite.config.ts`: build.rollupOptions.input lists index.html, `tree-compare.html`, agent-room.html (ADR 0013).
- `tests/layers.test.ts`: new block "agentRoom layers". src/agentRoom imports only itself, src/config and packages (relative specifiers resolved). model/ and engine/ import no react, react-dom, three or @react-three, type and dynamic imports included. Empty glob keeps it green when the folder is absent.
- `tests/harness.test.ts`: agentRoom in LAYOUT_DIRS; network pattern now bans EventSource; one reasoned exception (ADR 0013) lets src/agentRoom/bridgeClient/ use EventSource and fetch only (XHR, WebSocket still banned there).
- `docs/REPO_MAP.md`: row for src/agentRoom, owner Technical Architect.

## Review 2026-11-08 (Scene & QA)

Static check only (Grep, Glob, Read, wc, git ls-files). No tests, no `npm run check` run. Runtime claims are marked unverified.

### Corrections to this handbook (stale or wrong)
- Line 12 "32 files over 350": stale. No file in `src/` is over 350 now (largest: `environment/leaves.ts` 321, `Town.tsx` 295). `OVERSIZED` in `tests/harness.test.ts:128` is `{}`. Tests over 350 exist (e.g. `tests/helpers/geometryAudit.ts` 832, `tests/people.test.ts` 691) but ratchet scope was not verified.
- Line 15/Key files: `Town.tsx` is 295 lines, not 294.
- Line 16: `natureItems` is in `src/streets/natureLayout.ts:50`, not `natureTrees.ts`. `TREE_SCALE` 1.35 is `src/config/tuning/cityStreets.ts:40` (re-exported by `src/streets/natureTypes.ts:50`). `FALLBACK_TREE_SCALE` 1.35 in `useNatureTrees.ts:34` is valid.
- Line 21 "Blocks (main) between 1,100,000 and 1,140,000": wrong. `tests/budget.test.ts:275-276` expects 900,000 to 1,000,000. Line 29 already has the right band.
- Line 27 and line 71 measured numbers: unverified. They differ from the test comments at `tests/budget.test.ts:258-290` (main 1,539,195; shadow 549,627). Re-measure or mark as dated.
- Line 43: `labNatureTrees.ts` is now a 14-line re-export barrel (see the 2026-11-06 update). The "clones natureTrees.ts" wording is stale.
- Line 46 and "Not in the bundle (dev-only)": INVALID. `vite.config.ts:9` sets `build.rollupOptions.input` to `index.html`, `tree-compare.html`, `agent-room.html`. Tree lab is in the production build input.
- Line 70 "Monument shadows are OFF": partly stale. `src/scene/useTownPieces.ts:66-69` keeps shadows for kinds in `buildings.monumentShadowKinds`, which is `['gothic-cathedral']` (`src/config/tuning/buildings.ts:114`).
- Line 73 "streetTreeMultiplier superset at tests/city.test.ts:106": location wrong. Line 106 is "plants trees in every setting". No "superset" test exists in `tests/city.test.ts`. The `blockMerge` default-town and invalid-group tests exist (`tests/blockMerge.test.ts:98,166,186`); failure status unverified.
- Line 58 process list (`tsc`, `vitest`, `vite build`) omits lint. CLAUDE.md QA gate includes `npm run lint` (`package.json:10`). Align with `npm run check`.

### Verified valid
- `tests/budget.test.ts` limits: main <= 1,900,000 (L272), shadow <= 605,000 (L280), main+shadow <= 2,300,000 (L291), draw calls <= 140 (L296), house-block band (L275-276).
- Files exist: `src/scene/*` listed (useTownFrame, useTownPieces, useTownGreenery, useTownTraffic, useTownAircraft, useNatureTrees, townBlocks, townShadow, mergeBlock, runtime), `src/core/runtime.ts`, `PostFX.tsx`, `App.tsx`, `environment/leaves.ts`, `environment/{trees,forest,leafVariety,wind}.ts`, `shaders/wetSurface.ts`, `weather/`, film files, `tests/film/*`, `tests/houseThumbs.test.ts`, `tests/appSelection.test.ts`, `tests/clouds.test.ts` (`building-body-v11` at L283), `tests/traffic.determinism.test.ts`, `docs/agents/public-buildings-review.md`, `docs/BRD.md`, `docs/REVIEW-01.md`, `docs/DESIGN-3D.md`.
- Pedestrian timing test "600 walkers" exists: `tests/people.test.ts:655`.
- Tree lab bounding-sphere fix present in `add()`: `src/dev/treeCompare/labNatureField.ts:36-37`.
- Evergreen filter: `src/scene/Town.tsx:77`. `SLOTS` = 4: `src/aircraft/schedule.ts:31`. `uiCamera.overviewDirection` = `[0, 2.45, 0.63]`: `src/config/tuning/uiCamera.ts:116`. `film.videoBitrate1080`: `src/config/tuning/film.ts:20`. `sceneQa.houseThumbs`: `src/config/tuning/sceneQa.ts:34`. `__r3f` snapshot in `onCreated` (DEV): `src/App.tsx:154,168`. `FilmRig` after `CameraRig`: `src/App.tsx:171-172`. `registerFilmRoot`: `src/film/resizeBridge.ts:200`, used by `PostFX.tsx:105`. `registerAutoFilmSource`: `src/ui/filmSession.ts`, used by `FilmRig.tsx:56`. Tuning parity virtual name (the config folder): `tests/tuningParity.test.ts:15,28`.
- `npm run check` composition (`package.json:10`) matches CLAUDE.md.

### Rules I believe are invalid or stale (for the lead)
- CLAUDE.md QA line "Edit hook runs tsc": hook content is valid (`.claude/settings.json`, matcher `Edit|Write`, runs `npx tsc --noEmit` on `src|tests` `.ts/.tsx`). But `.claude/` is gitignored (`.gitignore:5`) and `git ls-files .claude` is empty. The hook is local-only and does not reach CI. The harness README "Enforcement" row implies it is shared.
- `harness/README.md` guard "No network" (no fetch, XHR, WebSocket in `src`): stale. `tests/harness.test.ts:97-105` now allows `fetch` and `EventSource` in `src/agentRoom/bridgeClient/` (ADR 0013).
- `harness/README.md` CI row: `.github/workflows/ci.yml` now also runs `npm audit` (gating on prod deps) and a separate gitleaks job. The `npm run check` step is still there.
- `harness/README.md` "CSS": `src/ui/panels.css` is recorded as 1247 lines. It is now 12 lines, and `carousel.css` and `film.css` exist. Re-check the note.
- CLAUDE.md "Terminal rule: suppress success logs": process rule only, not enforced by any guard. Unverifiable here.

### Unverified
- Browser checks (`list_connected_browsers`, Chrome smoke test 2026-10-29), frame paint, and the "Last measured" budget numbers. No tests run in this review.
- Blockmerge and pedestrian flake status on the current tree.

## QA 2026-11-08 (night-sky fix + agent room guest removal)
- `npm run check`: tsc, lint, build green; vitest 106 files, 1764 passed, 1 skipped. No timing flake this run.
- Runtime via connected Claude in Chrome, real screenshots looked at. Time set with `useWorldStore.getState().setTimeOfDay(h)` from a dynamic import of `/src/store/index.ts`; sun read from `/src/environment/sun.ts`; lights from `window.__r3f.scene`.
- Fresh dev server (5174, new `.vite` prebundle `suncalc.js?v=a0b38ad3`): 00:00 alt -68.82 deg, phase night, directional lights 0.935 #c5d4f5 + 0.272 #a0afd4 (dark blue sky, lamps lit). 12:00 alt 68.79, phase day, sun 3.91 #fffdfb. No console errors.
- Stale server: a vite process started before `npm install` still held 5173 (`suncalc.js?v=461bd168`). There 00:00 gave alt -1.21 (radians read as degrees), phase dusk: the user's bug. Restart of that server is required; code is correct.
- agent-room.html: 1 canvas, roster "Agents 9" (Lead + 8 specialists), no "guest" in DOM text or HTML, 8 desks, no console errors. `__r3f` not exposed on that page, so the Three scene graph was not inspected; guest absence in the 3D scene is by screenshot only.
- Blind spots: console capture began after load on the main page; night look judged on one top-down view only; animation and frame-to-frame motion not checked.

## QA 2026-11-09 (night sky: skyHorizon/skyZenith, night darkening)
- Full `npm run check` on current code: tsc, lint, build green. vitest 106 files, 1767 passed, 1 skipped, 1 failed: `tests/people.test.ts` "600 walkers" timing (0.52 ms vs < 0.5 ms) under full-run load. Solo rerun passes (known load flake, not a code defect).
- `tests/audioPeople.test.ts` "steps faster" failed once solo (expected 3 > 3) and passed on two solo reruns: timing flake.
- Runtime on fresh 5173 server (cache cleared), connected Chrome, real screenshots taken and looked at:
  - 00:00: alt -68.82, phase night, stars uStars 0.762, moonFill 0.35, ambient 0.08 (raw 0.16), dir lights 0.595 #c5d4f5 + 0.272 #a0afd4. Dark, bluish-grey ground and sky. Lamps and lit windows visible as orange dots along streets; top-down view shows no visible stars.
  - 12:00: alt 68.79, phase day, sun 3.91 #fffdfb, hemi 1.95, stars 0, moonFill 0. Bright day, same as before the night change.
  - 18:30 (shown as 06:30 PM): alt -5.58, phase dusk, moonFill 0.157, stars 0.007. Lamps on, sky blue-grey.
- Served code contains skyHorizon #0d0f16 and skyZenith #050608; sun.ts reads night.skyHorizon, night.ambientIntensity, night.moonFillFactor.
- Stale server: not the issue this run. Vite cache cleared and server restarted before checks.
- Not verified: 00:04 was set via setTimeOfDay(4/60) (store accepts fractional hours; slider step not used). Moon disc and star visibility not confirmed by eye at night (top-down camera). No frame-to-frame or animation check.

## QA 2026-11-09 (deep night re-darkened: skyHorizon #060709, skyZenith #030304, ambient 0.1, moonFillFactor 0.2)
- Full `npm run check`: tsc, lint, build green. vitest 1767 passed, 1 skipped, 1 failed: `tests/people.test.ts` "600 walkers" timing (0.89 ms vs < 0.5 ms) under full-run load. Solo rerun: see report.
- Runtime, fresh 5173 server (cache cleared): 00:00 alt -68.82, phase night, ambient 0.1 (dir light 0.34 #c5d4f5, 0.272 #a0afd4, hemi 0.3), moonFill 0.2, stars 0.762. Screenshot: near-black ground, lamps and lit windows visible. 12:00 alt 68.79, day, sun 3.91, hemi 1.95, moonFill 0, unchanged.
- Blind spots: stars and moon disc not confirmed by eye (top-down camera); 00:04 not checked this round; no motion check.

## Update 2026-11-09 (scene-qa): people perf test at default crowd
- Change under test: `tests/people.test.ts` perf test now runs at default crowd (385 walkers, not 600); `docs/agents/traffic-life.md` updated by Traffic & Life.
- `npm run check`: exit 0. tsc, lint, vitest and vite build all green. vitest 106 files, 1768 passed, 1 skipped, 0 failed.
- Flake status: no failure this run, so no solo rerun was needed. The people perf timing test passed inside the full run. Still treat it as load-sensitive: rerun solo if it fails in a later full run.
- Handbook wording updated: Traps and Open items now say 385 walkers (was "600 walkers"). Test names in the 2026-11-06 entry above are historical.

## Update 2026-11-11 (T-0009 phase 1, delivery guards)
- `tests/delivery.test.ts` (new) guards the delegated delivery contract (ADR 0014; items C1 to C6, C9, C10 of the T-0009 architect brief). Eight guards: agent definitions, skills, delivery workflow sections, autonomy policy, permissions, backlog records, tracked config in `.gitignore`, failure-to-issue steps in drift.yml and evals.yml.
- Absent files fail, never skip: `.claude/` agents, skills and settings.json are tracked from this task on. The older settings.json hook guard in `tests/harness.test.ts` still uses `skipIf`; the new file covers both hooks without a skip.
- Stricter than the brief, on purpose: `agentMay` ids are an exact set (a new agent permission needs an edit in the guard); every allow rule with `git push` must name `task/` and must not name master or a force flag; a wildcard rule that covers all of `git push` fails; deny must cover all seven commands of C5.
- `.gitignore` has no extension, so `?raw` cannot import it: read with `node:fs` through `process.getBuiltinModule` (no @types/node, same as `tests/depsSync.test.ts`). The guard has its own small matcher for git ignore rules (later rule wins, an ignored folder hides its content), with a self-test. It reads the root `.gitignore` only.
- Not guarded (C7, C8, C11): the next-task script output, ADR text and doc wording. ADR shape and script existence are already in `tests/harness.test.ts`.
- Eval case `delivery-guards` added to `harness/evals/regression/cases.json`.
- Phase 2 gate (2026-11-11): tsc, lint, vite build green. vitest 109 files, 1863 passed, 1 skipped, 1 failed: `tests/delivery.test.ts` permissions (C5), because `permissions` in `.claude/settings.json` waits for the human. The evals run fails on the same case only. Task, claims and drift scripts exit 0. Backlog guard green on T-0010 to T-0019. No pedestrian flake this run.
- Phase 3 (2026-11-11, after review): `tests/guardGit.test.ts` (new) unit-tests `decideGit` from `harness/scripts/guard-git.mjs` (commit, push, pull request, switch, chained lines, quoted text). Eval case `git-guard`. `tests/delivery.test.ts` also requires: a PreToolUse Bash hook running the guard, deny rules for push to dev and for `src:dst` refspecs, `--base dev` in every `gh pr create` allow rule, `disable-model-invocation: true` in both skills, `baseRefName` in the Land section, "Never commit or push" in each specialist definition, and `failure()` on the `if:` line of the issue step itself.
- Guard limits found by probing, reported to the lead, not patched and not in the tests: a command word before `git` hides it (`command`, `time`, `env`, `!`, `{`, `then`, a backtick, a full path to git); `git checkout dev && git commit` and `git switch - && git commit` are not tracked as a branch change; merge, cherry-pick and revert on dev are not commits to the guard; `gh api` can merge a pull request. A redirect after a push (`2>&1`, `> file`) is blocked by mistake.
- Trap: `import.meta.glob` options must be an object literal in each call; a shared const fails at transform time.
- Phase 4 (2026-11-11): the architect fixed the guard limits above; `tests/guardGit.test.ts` has a regression block for each (prefix words, checkout and `switch -`, merge and pull on dev, branch and update-ref moves, gh api writes, unknown branch, redirects and pipes, heredoc bodies and comments). Second probe found more, reported to the lead and not in the tests: arithmetic `$((1<<2))` read as a heredoc, backslash-newline inside a command, `gh pr edit --base master && gh pr merge` on one line, gh api graphql and contents writes, a heredoc delimiter with a space.
- Phase 5 (2026-11-11): second-probe findings fixed by the architect; regression block added in `tests/guardGit.test.ts` (line continuation, `gh pr edit --base`, gh api writes all blocked by lead decision, arithmetic shift, heredoc delimiter with a space). Known limits, recorded in the script header and not tested: `bash -c`, `eval`, a variable as program, `sudo -u git`, other worktrees, local ref moves.
