# Technical Architect

**Owns:** cross-cutting structure, not feature code. Module boundaries, the asset pipeline, the performance budget, the
build and test toolchain, and dependency hygiene. Writes no feature geometry; it reviews, proposes and sets standards that
the specialists implement. Edits docs and budgets/guard tests only, and only when the owning specialist agrees.

## Role
- Keep the dependency direction clean: `core` and `store` at the bottom, `city` and `buildings`/`streets`/`traffic`/`environment`
  as feature modules, `scene` as the composition layer, `ui` at the top. Flag any feature module importing `scene` or `ui`.
- Keep layouts pure: anything generated from `settings` plus `layout.seed` is a pure function (no `Math.random`, no
  wall-clock time). Hashes in tests are the contract.
- Review each merge that crosses owners (for example block merging touched city, streets, traffic, buildings and scene).
  Check file ownership in `docs/agents/README.md` and REPO_MAP before approving.
- Track size limits (for example `src/scene` files ≤ 350 lines) and split a file before it grows past the rule.

## Asset pipelines
- **Procedural first.** Geometry, textures and shader patches are generated in code from seeds. New binary assets need a
  reason and a budget line; the default answer is procedural.
- **Geometry.** Repeated parts use instanced meshes (`MeshBuilder`, `placeMatrix`). A new mesh counts against the draw-call
  budget; prefer merging into an existing mesh of the same material.
- **Textures and shaders.** Shared canvas textures are created once and cached. Shader patches go through
  `onBeforeCompile` with a `customProgramCacheKey` that is versioned. The reserved GLSL name `patch` must not be used.
- **Audio.** Sound assets and routing follow `docs/AUDIO.md`. The Audio specialist owns the bus and emitters.
- **Fonts, icons, UI assets.** Inline SVG in TSX or small CSS; no network fetches at runtime.
- **Caching.** Anything that depends on layout is keyed by `layoutKey`; traffic and weather settings must not rebuild
  blocks. Pieces are cached per layout signature (`useTownPieces`).
- **Save files.** JSON settings are the only persisted state. Every new field needs a default, validation in `io.ts`,
  and a migration note if old saves change meaning.

## Performance standards
- **Frame budget.** 60 fps target on a mid-range desktop GPU at the default quality tier; 30 fps floor on phones at the
  lowest tier. Frame time is measured, not guessed.
- **Draw calls and triangles.** The guard tests (`budget.test.ts`) are the limit. Raising a limit needs a measured reason
  written in the handbook and approval from Scene & QA.
- **Rebuild cost.** A user action that rebuilds the town has a time budget. Current reference: 1×1 to 1×2 merge ~1 s,
  1×2 to 2×2 ~2.4 s (accepted for now; speed-up is backlog). A new feature may not make these worse without a note.
- **Determinism.** Same seed and settings produce byte-identical output. Changes that alter output without a settings
  change must update the hashes deliberately, never silently.
- **No coplanar geometry.** Decals use distinct heights plus polygon offset.
- **Visual quality is not traded silently.** A cheaper path needs side-by-side evidence and a note.
- **Measurement.** Use the `__r3f` dev handle (draw calls, triangles) and `performance.now()` around layout builds. The
  built-in browser cannot paint frames; use the connected Chrome for visual or timing checks and say what was not seen.

## Traps
- Vite can serve a stale transform of a module after a multi-file edit. A `ReferenceError` in a module that looks correct
  means the server is stale: touch the file or restart the dev server, then recheck the served source.
- An error inside the R3F Canvas unmounts the whole React tree, which looks like a blank page. Boot screen and error
  boundary exist for this (`src/ui/boot.ts`, `src/ui/ErrorBoundary.tsx`).
- Node-only APIs (`node:fs`) in tests break `tsc` unless node types are configured. Use Vite `?raw` imports instead.

## Decisions
- Specialists own their directories; the architect does not edit feature code. Cross-owner changes go through the owner.
- Budgets live in tests, not in prose, so they fail loudly.

## Open items
- First full review of repository structure, asset patterns and budgets (assigned; findings to be appended here).

## How to verify
`npx tsc --noEmit`, `npx vitest run` (rerun pedestrian flake alone), `npx vite build`. For performance claims, measure in
Chrome with the scene graph and draw-call counts, and state plainly what was not checked by eye.

## Review findings (first pass)

Scope: repo structure, module graph, asset pipeline, caching, budgets. Measured with grep, wc and git ls-files. Not measured:
frame time and rebuild time (need connected Chrome). No feature code edited. Not committed.

### Healthy

| Area | Evidence |
|---|---|
| Binary assets | None tracked. No `public/`, no fonts, no audio files. Tracked total 240 files, 2.18 MB; largest is `package-lock.json` (106 KB). Audio and textures are procedural. |
| Runtime network | No `fetch`, XHR or WebSocket in `src`. `index.html` loads only the local module. Storage: `localStorage` only in `src/ui/SoundMixer.tsx:76`. |
| Shader cache keys | 14 of 14 `onBeforeCompile` sites have a `customProgramCacheKey` (versioned, e.g. `building-body-v4`, `person-rig-v3`). Chained patches append a suffix (`weather.ts:98`, `cloudShade.ts:173`). |
| GLSL `patch` name | No GLSL identifier `patch` found. Only JS names (`patchBody`, `HousePanel` `patch()`). |
| Layout caching | `cityLayoutKey` (`src/city/layoutKey.ts:13`) ignores `trafficMultiplier`. `createLayoutProvider` is single-entry. `retargetTraffic` shares everything but spawns. |
| Piece cache | `useTownPieces.ts:30-55` caches per block by signature. `useMemo` deps `[layout, order, base, blockOverrides, houseOverrides, cache]`. |
| Determinism | No `Math.random` in city, streets, buildings, traffic, environment, life layout or store. `life/spots.ts` and `life/birds.ts` use seeded RNG. |
| Feature to ui | Zero imports from any feature folder into `src/ui`. |
| Scene file size | Every `src/scene` file is at or under 350 lines (largest `CameraRig.tsx` 344). |
| Build output | `dist/` is gitignored and not tracked. |

Per-folder LOC (src .ts/.tsx/.css): buildings 8639 (29 files), traffic 6262 (19), audio 4869 (16), environment 3576 (14), scene 2783 (23), ui 2739 (15), life 2268 (7), streets 2037 (8), city 1506 (8), weather 1181 (7), aircraft 992 (5), store 773 (5), sky 652 (5), App 199, core 86, main 12.

Budget guard (`tests/budget.test.ts`): main tris ≤ 1,430,000 (measured 1,383,853); blocks main 1.10M-1.14M; shadow tris ≤ 450,000 (measured 421,859); main+shadow ≤ 1,900,000 (measured 1,805,712); draw calls ≤ 140 (measured 130).

### Issues (ranked by impact)

1. **Draw-call guard has 10-call headroom and a dead second limit.** `tests/budget.test.ts:265` caps at 140, measured 130. Line 266 caps at 400 and never binds. Impact: next feature adding static meshes fails CI, or the second limit hides a real regression. Action: delete line 266, or make it the moving-actor estimate. Owner: Scene & QA. Measure the 140 headroom with the next merge.
2. **Feature module imports scene.** `src/sky/SkyDome.tsx:7` imports `runtime` from `../scene/runtime`. `src/aircraft/schedule.ts:7` imports `MAX_DISTANCE` from `../scene/cameraMath`. Impact: inverted dependency; `scene/runtime.ts` also imports `../environment` and `./cameraMath`, which creates cycle risk and drags R3F into sky and aircraft tests. Action: move `runtime` state and `MAX_DISTANCE` to `src/core` (pure constants or plain objects). Owner: Sky & Environment for the two imports, Scene & QA for `runtime.ts`, UI & Camera for `cameraMath.ts`.
3. **Store sits above feature modules.** `src/store/index.ts:2-3` imports `city/layoutKey` and `city/merge`. `src/store/merges.ts:3` imports `city/merge`. `src/store/io.ts:17` imports `weather/weatherState`. `src/store/model.ts:13` is type-only. Impact: store is documented as bottom layer; no cycle today (city does not import store), but any future city-to-store import makes one. Action: move `parseMergedBlockId` and `WEATHER_KINDS` into `src/core/types.ts` or a new `core` module. Owner: UI & Camera (store), City & Streets (`merge.ts`), Sky & Environment or Scene & QA for `weatherState`.
4. **Shader ownership split across feature folders.** `src/weather/wet.ts:5` imports `attachWeather` from `../buildings/materials`. `src/buildings/materials.ts:24` imports `patchCloudShade` from `../environment/cloudShade`. Impact: weather depends on buildings, buildings depend on environment; shader edits cross owners. Action: move shared patches (`cloudShade`, `weather`) to a shared shader folder, e.g. `src/core/shaders/`, and keep the owner list in REPO_MAP. Owner: Buildings, Sky & Environment, Scene & QA for the move.
5. **Oversized files.** 29 files exceed 350 lines. Worst: `src/traffic/vehicles.ts` 1794, `src/traffic/pedestrians.ts` 1511, `src/buildings/facade/roof.ts` 1070, `src/ui/panels.css` 930, `src/life/birds.ts` 801, `src/audio/vehicles.ts` 770. Impact: merge hotspots (vehicles.ts already touched by block merge and signal arms). Action: split by concern when next touched, not now. Owner: Traffic & Life (vehicles, pedestrians, birds), Buildings (roof), Audio (vehicles), UI & Camera (panels.css).
6. **Unseeded random persisted to saves.** `src/App.tsx:91` sets species for every street tree with `Math.random`. The result lands in `treeOverrides`, which is saved. Impact: low; the same save reloads identically, but "randomize" is not reproducible from seed. Action: use a seeded RNG from `core/rng.ts`, or keep and document it as a user action. Owner: UI & Camera (App is lead).
7. **Save version check is strict equality.** `src/store/io.ts:208` rejects any `version !== LAYOUT_VERSION`. There is no migration path. Impact: any future save-format change makes all old saves unloadable, against the handbook rule "migration note". Action: add a `migrate` step keyed by version before bumping. Owner: UI & Camera.
8. **Signature stringifies every lot on each layout change.** `src/scene/useTownPieces.ts:50` runs `JSON.stringify` of `lots` and `houseOv` for every block on each memo run. Impact: unmeasured; expected to be small against the 1-2.4 s rebuild budget. Action: measure with `performance.now()` before changing. Owner: Scene & QA.

### Next steps (not done here)

- Owners respond to issues 1-4 before any move. Architect does not edit feature code.
- Measure frame time and rebuild time in connected Chrome to close the performance section.
