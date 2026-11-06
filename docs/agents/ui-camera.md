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

## Update 2026-11-06 (ui-camera): simpler film picker
- `FilmPicker.tsx`: mode labels "Follow You" (manual) and "Follow a Bird" (auto); internal mode names unchanged. Headings and description text removed; Auto shows only the toggle. Primary button "Record" (was Start).
- Disable reasons: one line (`.mw-film-error`, nowrap + ellipsis, full text in `title`), only when the current mode cannot record. The Auto toggle carries its reason as a tooltip when disabled.
- Known: "Window size" option reads the first `<canvas>` in the DOM and showed 300 x 150 in Chrome (not the 3D canvas). Not fixed here.
- Auto film verified 2026-11-06: simTime - filmTime constant through the run, frameloop 'never'. `window.__r3f` is a frozen snapshot; read `window.__r3f.get().frameloop`.
- 2026-11-06 follow-up: Follow a Bird shows the same Length and Output rows read-only (`film.autoSeconds`, Full HD only, fieldset `.is-fixed` at opacity 0.7), so the picker keeps the same height (measured 257.7 px in both modes).
- 2026-11-06 fix: "Window size 300 x 150" bug. Root cause: `FilmPicker.windowSize()` and `filmSession.startManualFilm` used `document.querySelector('canvas')`, which can return a non-3D canvas. Both now use `film/resizeBridge.ts` `filmCanvas()` / `filmViewSize()` (the renderer `domElement` registered by PostFX). Tests in `tests/film/resizeBridge.test.ts`. Live Chrome check pending (extension was disconnected).
- 2026-11-06 Settings panel: removed the Gust, Leaf devil and Whole map buttons, their `CityAction` members and their `App.tsx` cases. The features stay: `runtime.gustRequests` / `leafDevilRequests` / `wholeMapRequests` and their consumers in useTownFrame and CameraRig are unchanged (no UI trigger now). The remaining buttons (Tilt-shift, Golden Hour, Switch trees, Move blocks, Reset blocks, Reset houses) sit at the top of the panel.
- 2026-11-06 Sound and Music are checkboxes (`CheckToggle`, `.mw-check`) at the top of the Sound section, above SoundMixer. Same behaviour as before.
- 2026-11-06 Sections Atmosphere / Town / Quality / Sound collapse (`Section` in controls.tsx: header button with chevron and aria-expanded, default open). Closed ids are stored in localStorage `mw.settings.sections` through `ui/sectionState.ts` (try/catch, works without storage). Test: `tests/sectionState.test.ts`.
- 2026-11-06 Golden Hour button (after Tilt-shift): `ui/goldenHour.ts` `applyGoldenHour` sets `timeOfDay = uiCamera.goldenHourTime` (18) and `autoTime = false`, using the TimeBar's store actions. `paused` is untouched. Knob in uiCamera.ts, parity test entry, docs/TUNING.md row. Test: `tests/goldenHour.test.ts`.
- 2026-11-06 Section headers are tinted bars (`.mw-section-head`, rounded 8 px, `--mw-btn` when closed). An open section gets a 12% accent tint (`color-mix`), a 3 px accent left edge and fg-coloured text. Hover and focus-visible make the tint stronger.
- 2026-11-06 Panel glide: in overview the view offset target is `viewShiftTarget(left, right) = (right - left) / 2`, so the town centres between the side panels. The left panel is measured through `data-mw-left-panel` (App.tsx) and `measureLeftInset` / `leftPanelInset`. CameraRig moves the shift with `stepViewShift` (exact critically damped spring, no overshoot, smooth retarget) on real frame dt (capped at 0.1 s), over `uiCamera.panelShiftSeconds` (1.5). Filming and the auto film clear the offset at once. When overview ends, the shift glides to 0 before the offset is cleared. A changed w/h re-applies the offset. Tests: `panel view shift glide` in tests/cameraRig.test.ts. The live check was blind: Chrome ran the tab at about 1 fps.
- 2026-11-06 Slide panels: `ui/slide.ts` `useSlide` + `.mw-slide` (grid-rows 0fr/1fr, opacity, visibility after close) for Panel and Section. Open `uiCamera.panelAnimSeconds` 0.3 s ease-out, close `panelCloseSeconds` 0.22 s ease-in, passed to CSS as `--mw-slide-open/close`. A panel that mounts open slides in; the collapsed card shape (`is-collapsed`) applies only after the close. Panel sets `data-open` at once and cameraDom reads it, so the glide target does not wait for the slide. `ui/panelCue.ts` calls audio `uiCue` on header clicks only. The slides always run, even under prefers-reduced-motion (user's choice, 2026-11-06; the user's Windows has animations off). Test: tests/slide.test.ts.
- 2026-11-06 Left panel exit: `ui/PanelExit.tsx` (App wraps the left panel) keeps the last panel mounted with `PanelExitContext` = true, so it slides closed for `panelCloseSeconds` and then unmounts. A close cue plays if it was open. A new selection mid-exit takes over the same instance (no flash). While filming it unmounts at once with no cue.
- 2026-11-06 Time bar fold slides: `TimeBarSliding` keeps both shapes mounted. The controls and the folded analog clock are `.mw-hslide` (grid columns 0fr/1fr, opacity, visibility) with the panel timings via `slideVars`, so the bar width animates around its centre. The gap lives in `.mw-hslide-row` padding, so a closed part is 0 px wide. The fold button plays `panelCue` on click. It always animates (user's choice). Measured in Chrome: open 565 px, folded 119 px.
- 2026-11-06 Left panel open cue: PanelExit plays `panelCue(true)` when the panel appears after a user selection (absent or leaving -> present, panel active). It stays silent on first mount, while filming, when one selection replaces another in an open panel, and when the panel arrives folded.
- 2026-11-06 Selection tick: App passes `selectionId` to PanelExit. When it changes while the left panel stays present and active, `selectionTickCue` plays audio `uiCue('tick')` (no tick on first open, same id, filming or restore).
- 2026-11-06 House Type carousel: `ui/PresetCarousel.tsx` + `ui/carousel.css` replace the Type select in HousePanel. Radio cards (80 px thumb from `scene/houseThumbs` `useHouseThumbs`, requested on mount, fades in over the HouseGlyph placeholder). Arrows overlay the strip edges and hide at the ends. Also: mouse drag (6 px slop, no click after a drag), touch swipe with scroll-snap, vertical wheel to horizontal, Left/Right/Home/End with roving tabindex. The current card is centred (instant on open, smooth after). `uiCue('tick')` plays on a pick. The panel is 300 px wide, so about 2.5 cards show.
- 2026-11-06 House roof sync: `ui/houseRoof.ts` resolves the panel roof like `houseParamsFor`: an override roof wins, else a preset or style override gives `defaultHouseParams(preset, ov.style ?? 'classic').roof`, else the base roof. A Type pick patches `{ preset, roof: type default }` (replaces the old roof, floors untouched, the same type does nothing). Test: tests/houseRoof.test.ts.
- 2026-11-06 Shutters follow the type: `houseRoof.ts` `shownShutter(override, baseShutter, preset)` returns null when `presetHasShutters(preset)` is false (row hidden), else override, then base, then `presetDefaultShutter` (what the scene gives a picked type). newLook picks a shutter only when the row shows. Vite serving checked with curl.
- 2026-11-06 (lead): Shutter row follows the house type (`presetHasShutters`); `shownShutter` in src/ui/houseRoof.ts returns {show, value}; value null = house renders no shutters, header shows "None", picking a swatch adds shutters (scene fills via override shutterColor).
- 2026-11-06 Swatches: `.mw-swatches` is a 7-column grid (1fr cells, square, gap 8 px), so the 14 shutter colours form 2 even rows of 7. Wall swatches use the same grid. The selected ring and the None header are unchanged.
- 2026-11-06 Compact colour fields: `ui/Swatches.tsx` (re-exported by controls). A 38 px bar (label, colour pill or hatched None, hex, chevron) slides open the 7-column grid (useSlide, open/close cue). A pick applies, ticks and folds after 150 ms. Esc closes; arrows/Home/End move inside the grid (radiogroup, roving tabindex). `SwatchGroup` keeps one field open (HousePanel Wall + Shutter). There are no recent-colour dots (kept clean); no other panel uses Swatches.

- 2026-11-06 Roof chips: the Roof control is the chip grid again (the carousel was dropped after review). Each chip has a 16 px profile icon (`ui/roofIcons.tsx`, inline SVG, currentColor). No roof-thumb fetch on panel open.
- 2026-11-06 Floors range: the House Floors slider takes its max from `maxFloorsFor(shownPreset)` (buildings; Glass tower up to 12, others 8) and its min from `MIN_FLOORS`. The shown value is clamped to the type's max, but stored floors change only when the user moves the slider (switching from Glass tower to a type with max 8 keeps the stored value until then).
