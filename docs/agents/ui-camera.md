# UI & Camera specialist
Reviewed 2026-11-01 at 02b0cdc

**Owns:** `src/ui/**` (except `SoundMixer.tsx`, owned by Audio), `src/store/**`, and in `src/scene/`: `CameraRig.tsx`, `cameraInput.ts`, `cameraMath.ts`, `cameraDom.ts`, `Selection.tsx`, `selectionMath.ts`, and block edit (`BlockEditor.tsx`, `blockEditMath.ts`, `blockEditAnchors.ts`). Tests: `ui`, `cameraRig`, `selection`, `store*`, `errorBoundary`.

## Key files
- `ui/TimeBar.tsx` (pause, auto time, analog + digital clock, view switch, photo), `SettingsCity.tsx`, `controls.tsx`, `panels.css` (themed, collapsible panels, dark drop-downs).
- `store/model.ts` (`WorldSettings`, `DEFAULT_SETTINGS`), `store/index.ts` (zustand store; undo/redo removed), `store/merges.ts` (block merge actions), `store/io.ts` (`exportLayout` / `importLayout`, validates every field).
- `scene/CameraRig.tsx` (263 lines): OrbitControls, zoom to cursor, `setViewOffset` for panel-aware framing, presets, drag-to-start street walk. `scene/cameraInput.ts` holds `useCameraInput` and the `Tween` / `StreetState` types.

## Conventions
- Tunables (defaults, slider ranges, weather-lift rule, day length) live in `src/config/tuning.ts`, section `uiCamera`. Import them; do not add literals in `store/model.ts` or `ui/SettingsCity.tsx`.
- UI is dark glass: tokens `--mw-*`. Drop-downs must be opaque (`.mw-select` uses solid background + `color-scheme: dark`), otherwise the browser draws the list white.
- Settings persist in JSON. A new setting needs a default in `model.ts`, validation in `io.ts` and a test. Old saves migrate: `io.ts` maps the retired `drizzle` weather to `cloudy`.
- The time bar is centred on the screen width, not on the free area; folded state keeps the analog clock with AM/PM.

## Traps
- Camera: near/far tied to the target distance. Camera knobs (`maxDistance` 600 m, `minDistance`, `maxPolarAngle` PI/2.05, `blockEditHeightM`, walk speeds, look sensitivity) are in `src/config/tuning.ts` section `uiCamera`; `scene/cameraMath.ts` aliases them. The aircraft altitude band reads `maxDistance`.
- Overview rotates around the map centre; street view is entered by dragging the view switch onto the map (ray to y=0).
- Keep every file in `src/scene` <= 350 lines. Largest owned file today: `CameraRig.tsx` 263.
- Undo/redo was removed (not needed). Save/load (`io.ts`) stays; no UI control calls it yet.

## Block edit (phase 2)
- Edit mode by camera height: `BLOCK_EDIT_HEIGHT_M = 200` and `editModeForHeight` in `scene/cameraMath.ts` (only place). `scene/BlockEditor.tsx` checks `camera.position.y` each frame and writes `store.editMode` only on change. `ui/useBlockEdit.ts` clears a selection that no longer fits the mode (house or tree in block mode, house block in house mode). Mode chip bottom centre (`EditModeChip`).
- Picking in block mode: one invisible plane at `PICK_Y = 150` m (above every roof, below any block-mode camera), mounted only in block mode and not while Move blocks is on. It stops the event (houses, trees, hover do not react), intersects the ray with y = 0 and picks the block by bounds (`scene/blockEditMath.ts`). Drags with more than `TAP_SLOP_PX = 6` px movement are ignored.
- Ids: a house-block selection is `{ type: 'block', id: <slot id> }`; monuments keep their content id (as in house mode). Swapped blocks and blocks overridden to monuments cannot merge (`canMerge`).
- Suggestions: `mergeSuggestions(layout, id, eligible)` in `city/merge.ts` (owned by City & Streets). Grow the current rectangle by one whole strip W/E/S/N, total area and member count capped by `MERGE_MAX_BLOCKS = 4`, all added blocks free house blocks. `grownGroup` gives the full member list.
- Store: `mergeBlockGroup(group, idsFor)` / `splitMergedBlock(mergedId, idsFor)` commit `settings.blockMerges` together with a remapped `blockOrder` / `baseBlockOrder` (`store/merges.ts`). `idsFor` comes from the UI (`ui/useBlockEdit.ts` uses `getCityLayout`), so the store never calls the city generator. Both are committed in one store update. `swapBlocks` refuses merged blocks of different cell size.
- DOM icons: `ui/BlockEditOverlay.tsx` registers elements in fixed anchor slots (`scene/blockEditAnchors.ts`, `ANCHOR_SLOTS = 5`: slot 0 = +/-, 1..4 = suggestion chips). BlockEditor projects them each frame with one preallocated vector and writes `transform` only when moved > 0.5 px. Buttons are 44 px.
- Decals (selected, hovered, suggestions) use `depthTest: false` at `DECAL_Y = 0.3` so they read over roofs like a map overlay.
- Help overlay (`ui/HelpOverlay.tsx`) has a "Block editing" group: mode by height, chip, +, -.
- Phones: a block picked in block mode does not auto-open the full-screen panel (it would hide the map icons); Merge in the panel folds it so the suggestion boxes are visible.

### Block edit traps
- Merge cost is the scene rebuild, not the layout (`generateCity` ~10 ms). `useTownPieces` used to drop its whole piece cache on every layout change; the cache now survives layouts with the lots and bounds in the signature (file owned by Scene & QA). Measured earlier in dev, warm: 1x1 -> 1x2 ~0.9-1.0 s, 1x2 -> 2x2 ~2.4 s; houses ~17 ms each, streetscape ~170 ms. The edit runs after one paint so the chip shows "Updating blocks...".
- Vite HMR on hook-order changes throws "Should have a queue" in App/Town; reload the page, it is not a bug.

## Boot spinner and error screen
- `index.html` holds the boot screen inline (markup + CSS, dark body `#1c1816`) so it paints before JS. An inline script turns it into an error panel on `window` error / `unhandledrejection` (and module script `onerror`) while it is still visible.
- `scene/FirstFrame.tsx` (in the Canvas) calls `ui/boot.ts` `bootDone()` after the first frame: 450 ms fade (`FADE_MS`), then removed; no fade or spin under `prefers-reduced-motion`.
- `ui/ErrorBoundary.tsx` wraps `<App/>` in `main.tsx`; Canvas render errors reach it. Fallback reuses the `.mw-boot*` styles: title, message (max 400 chars), Reload. Tests: `tests/errorBoundary.test.ts` (renderToString, node env, no jsdom).
- Dev-only check: `?mwThrow=render` makes FirstFrame throw (gated by `import.meta.env.DEV`).
- Trap: errors in `useFrame` after the first frame are not render errors: the boundary does not see them and the boot screen is gone, so the scene just stops. In dev React also reports boundary-caught errors to `window`, so before the first frame both panels may show the same message.

## Layering
- `core` and `store` sit at the bottom. Store runtime imports stay in `core` and `store`; it must not import `city`, `weather`, `scene` or `ui`. `tests/layers.test.ts` checks this (type-only imports are erased and not checked).
- `core/blockIds.ts`: block id scheme (house and merged ids, parsers). `tests/layers.test.ts` checks it agrees with `city/merge.ts`.
- `core/weatherKinds.ts`: `WEATHER_KINDS`, `WeatherKind`; `weather/weatherState.ts` re-exports them.
- `ui/index.ts` exports the public UI modules. `WALL_COLORS` / `SHUTTER_COLORS` are not exported from `ui/`; `buildings/palette.ts` still defines them for buildings.

## Decisions (with reasons)
- House panel base = `houseBaseFor(layout, id)` (`scene/townBlocks.ts`), so the panel shows the real block values; `DEFAULT_HOUSE_BASE` only when the house is not in the layout.
- `as-block` is not offered in the Type choices ("Original" covers it). An override saved with `as-block` still shows the block preset in the Type select (`shownPreset` in `HousePanel.tsx`).
- "New look" skips the shutter override when the block has no shutters (`hasShutters`, from base).
- `leafAmount` is a 0-1 fraction (`leaves.ts` clamps 0-1; `SettingsCity` shows `round(v*100)%`). Default 1 = 100%.
- `CameraRig.tsx` input effects live in `scene/cameraInput.ts` to keep the file under the 350-line rule. Behaviour unchanged.

## Open items
- Save / load (`io.ts`) has no UI control yet. Undo/redo was removed on user request (no longer needed).
- `io.ts` `importLayout` rejects any `version` other than `LAYOUT_VERSION` (1). No migration step yet (architect finding 7, low priority). Add a migrate step before the next version bump.
- Mobile touch pass was done at 390 px; re-check after adding panels.
- UX, not implemented: group Settings into Light and season / Weather and wind / Town and traffic / Trees and quality / Effects; group House panel into Shape and Colour; swatch names on hover; camera reset button (push `'overview'` to `runtime.cameraPresetRequests`).

## How to verify
`npx vitest run tests/ui.test.ts tests/cameraRig.test.ts tests/selection.test.ts tests/store*.test.ts tests/errorBoundary.test.ts tests/layers.test.ts`, then `npx tsc --noEmit`. Visual checks in connected Chrome only (the built-in pane cannot paint frames).

## Session 2026-11-04 (film camera plan)
Plan only, no source edits, no commit. Status: proposed, not started. Owner decisions below are proposals for the lead to confirm.

### Decisions (proposed)
- **Camera button** goes in `ui/TimeBar.tsx` next to `PhotoButton` (desktop bar ~304-324, phone window `COUNT` at ~219). `TimeBar.tsx` is 325 lines: put the button and picker in a new `ui/FilmButton.tsx` and `ui/FilmPicker.tsx` so TimeBar stays under 350.
- **Film state is transient** (`UiToggles`-style in `store/model.ts` ~82-91, default in `DEFAULT_TOGGLES` ~130). Not saved, so `io.ts` needs no change. Shape: `film: { mode: 'off' | 'manual' | 'auto', recording: boolean, filmTime: number }`. Only a persisted quality preset would need a default in `DEFAULT_SETTINGS` and a check in `parseSettings` (`io.ts` ~93). Decision: keep quality transient in v1.
- **Film clock** lives in `core/runtime.ts` (`simTime` at ~27). While recording, the clock advances by a fixed step per rendered frame (`1 / filmFps`), not by wall time. `useTownFrame.ts:67-79` already computes `dt = paused ? 0 : frameDt`; add `film.recording ? filmStep : ...`. Then `simTime`, traffic, leaves and aircraft (`aircraft/schedule.ts`) run deterministically. `PostFX.tsx:103` uses its own `dt`; it must read the same clock or tilt-shift and bloom time drift.
- **Pause button** is disabled while recording (the film clock is separate from `toggles.paused`). Auto time (`autoTime`) is switched off for the flight and the sun direction is sampled once at start.
- **Manual film**: `CameraRig` stays in charge (OrbitControls, zoom to cursor, presets 1/2). While recording: block edit mode is locked (`BlockEditor.tsx`, `useBlockEdit.ts`), selection is cleared and blocked (`Selection.tsx`), and `Space` is ignored.
- **Auto film**: new pure module `scene/filmPath.ts` (no DOM, testable) and a driver `scene/FilmRig.tsx` (new file in `src/scene`, owned by Scene & QA under README rule 2; agree the claim with the lead). `CameraRig.useFrame` (151-247) skips its orbit branch (225-238) and clip update when `film.mode === 'auto'`, the same way street mode already does (213-224). Orbit controls are disabled during the flight and re-enabled through a tween (`TWEEN_SECONDS`) on exit, so `maxPolarAngle` and `maxDistance` do not snap the view.
- **Path**: `THREE.CatmullRomCurve3` (centripetal) for camera position and a second one for the look-at target. Arc-length sampling with `getPointAt`; speed profile is an ease-in-out on arc-length `u`, capped at `filmMaxSpeedMs`. Phases (fractions of `filmDurationS`): (1) high overview, (2) circle town, (3) circle cathedral (lot of `gothic-cathedral`, found the same way as `Town.tsx:163`), (4) descend along a deterministic street (`hashId(seed + 'film')` picks a segment from `StreetSegment[]` in `city/generate.ts` 348-367, filtered by length and clearance), (5) tilt up and fly toward the sun (`getSunDirection` `sun.ts:64`; `getNightMoonDirection` `sun.ts:82` at night), clamped inside `townBounds` (`generate.ts:203`), (6) return, (7) perch across from the cathedral entrance. Monument entrance faces +z (`buildings/monument.ts:3, 56`); the lot rotation must be applied (verify the field in `core/types.ts`).
- **Altitude and bounds**: after sampling, `y = max(y, floor(x,z) + clearanceM)` where `floor` comes from layout roof heights. Orbit-target distance stays within `maxDistance` (600) and camera polar angle within `maxPolarAngle` for any point that could be handed back to CameraRig.
- **Clip planes** in film: derive near from the distance to the nearest surface (camera height above ground for street passes), not from the look-at distance. `clipPlanes` (`cameraMath.ts` 47-53) uses the orbit target distance: near = 5% of it, so a 300 m look-at gives 15 m near and clips walls at the street. Far stays at least 1200 m.
- **Recording**: canvas capture only (the DOM REC chip and time bar are not in the file). Use `MediaRecorder` on `canvas.captureStream(0)` and call `track.requestFrame()` after each deterministic frame, so no frame is dropped or duplicated. Read the canvas in the same frame, as `ScreenshotRequest.tsx` 3-7, 27-30 does (`preserveDrawingBuffer` is false). No new dependency in v1. WebCodecs (`VideoEncoder`) is the option for exact MP4 later.
- **Input during auto film**: pointer, wheel and keys are ignored, and Esc / Stop ends the film and keeps the partial file. `visibilitychange` to hidden also stops it (the frame loop stops in a background tab).

### Tuning (new section `filmCamera` in `src/config/tuning/`, re-exported by `index.ts`)
Knobs only: `filmDurationS`, `filmFps`, quality presets (`{ bitrateBps, fps }` per draft / standard / high), `orbitAltitudeM`, `cathedralRadiusM`, `descentHeightM`, `cruiseHeightM`, `clearanceM`, `filmMaxSpeedMs`, `perchDistanceM`, phase weights. Geometry and the spline tension stay local. Each new knob: one line in `docs/TUNING.md` and an entry in `tests/tuningParity.test.ts` (fragment entries near lines 318-320).

### Tests (planned)
`tests/filmPath.test.ts` (vitest, node): no NaN for many seeds; endpoints equal the waypoints; every sample inside `townBounds` minus margin; `y >= floor + clearance`; step between samples <= `filmMaxSpeedMs * dt`; tangent continuity at waypoints; same seed and time give identical samples; sun below horizon picks the moon. `tests/cameraRig.test.ts` gets the film clip-plane case. `tests/store*.test.ts`: film state is not in `exportLayout`.

### Open items
- Scene & QA must agree to own `FilmRig.tsx`, `filmPath.ts`, and the `useTownFrame` and `PostFX` clock change.
- Monument lookup when the cathedral was swapped or merged away: fall back to the largest monument, or to the centre?
- Roof heights are not in the layout data; the clearance floor needs a height source (buildings or city).
- Output resolution: canvas size is fixed during film; presets change only bitrate and fps unless a resize is accepted.
- Phones: quality auto-lowers below 600 px; `MediaRecorder` support on iOS Safari to verify. Phone window needs `COUNT` 6.
- Film duration default (proposal 90 s) and whether the file auto-downloads or asks.

## Update 2026-11-04 (lead): picker, filming, overview

- **Manual film picker:** `FilmPicker.tsx` (length 1 to 60 s, default 30 s; Full HD 1920x1080 or window size; Start). Start reads `startManualFilm`, which shows any failure in the picker; a thrown error in the bridge used to show nothing (fixed: `getSize` target).
- **Hidden while filming:** `film.css` hides the top bar, side panels, block edit and help. Only the 3D view and the REC chip stay. Restored on stop.
- **Overview:** `uiCamera.overviewDirection` raised to `[0, 2.45, 0.63]` at the user's request. Same angle, larger distance.
- **Film centre:** while filming, the whole town is centred (no view offset). The offset returns after the film.

## Update 2026-11-04 (ui-camera)

- **Auto option in the picker:** `FilmPicker.tsx` has Manual and Auto. Auto is fixed length (`film.autoSeconds`) at 1920 x 1080. Auto support is probed on open (`autoEncodeSupport()` in `film/autoRun.ts`, no encoder opened); a missing WebCodecs or H.264 config shows the reason and disables Auto. No silent fallback.
- **Driver:** `src/film/autoRun.ts` `startAutoRun(session, inputs)`. Frame i at film time i / fps, `inputs.setPose(path.poseAt(t))`, `inputs.renderFrame()`, then `createImageBitmap(canvas)` in the same task (the drawing buffer is cleared after the task, so a live canvas would go black when the encoder queue waits) and `encodeFrame(bitmap, i)`. `done` resolves the MP4 via `finish()`. `stop()` ends after the frame in progress and keeps the file; `cancel()` closes the encoder, saves nothing.
- **Film clock:** `currentFilmTime()` returns the film seconds of the frame being rendered (0 when idle). For the `FilmRig` `filmTime` prop.
- **Session:** `filmSession.ts` `startAutoFilm()` checks support, applies 1920 x 1080 via `applyFilmSize`, opens the encoder, then runs. `cancelFilm` / `stopFilm` / HMR dispose handle the auto run. `restoreFilmSize` runs on every end path. Save: `downloadBlob(blob, filmFileName('video/mp4', now))`.
- **Scene input seam:** `registerAutoFilmSource(() => AutoFilmInputs | null)` in `filmSession.ts`. Scene & QA registers `{ path, canvas, setPose, renderFrame }` while mounted. Until then Auto reports "The 3D view is not ready for an auto film".
- **Video only:** `AutoEncoderSession` has no audio input. `renderFilmAudio` is not called. Audio mux needs an encoder API from the Audio agent (via lead). The picker says "No sound yet".
- **Not done:** no dry-run snapshot recorder in the UI path yet (Audio agent); no shared pose setter (Scene & QA decides whether `FilmRig` drives the camera via `useFrame` or `setPose` is used); Esc in auto mode is not bound.
- **Tests:** `tests/film/autoRun.test.ts` (frame order, stop, cancel, WebCodecs-missing reason).
- **Clock (follow-up):** `startAutoFilm` calls `startAutoFilmClock()` right before `setToggle('filming', true)`; `settleAuto` (done or failed) and `cancelFilm` call `stopAutoFilmClock()` after clearing filming. Manual film does not touch the clock.
