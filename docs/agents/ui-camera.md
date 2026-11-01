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
