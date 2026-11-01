# UI & Camera specialist

**Owns:** `src/ui/**` (except `SoundMixer.tsx`, owned by Audio), `src/store/**`, and in `src/scene/`: `CameraRig.tsx`, `cameraMath.ts`, `cameraDom.ts`, `Selection.tsx`, `selectionMath.ts`; tests `ui`, `cameraRig`, `selection`, `layoutKey` areas.

## Key files
- `ui/TimeBar.tsx` (pause, auto time, analog + digital clock, view switch, photo), `SettingsCity.tsx`, `controls.tsx`, `panels.css` (themed, collapsible panels, dark drop-downs).
- `store/model.ts` (`WorldSettings`, `DEFAULT_SETTINGS`), `io.ts` (JSON save/load; validates every field).
- `scene/CameraRig.tsx`: OrbitControls, zoom to cursor, `setViewOffset` for panel-aware framing, presets, drag-to-start street walk.

## Conventions
- UI is dark glass: tokens `--mw-*`. Drop-downs must be opaque (`.mw-select` uses solid background + `color-scheme: dark`), otherwise the browser draws the list white.
- Settings persist in JSON; a new setting needs a default, validation in `io.ts` and a test. Old saves migrate (`drizzle` -> `cloudy`).
- The time bar is centred on the screen width, not on the free area; folded state keeps the analog clock with AM/PM.

## Traps
- Camera: near/far tied to the target distance; `MAX_DISTANCE` 600 m (aircraft altitude band depends on it); `maxPolarAngle` PI/2.05.
- Overview rotates around the map centre; street view is entered by dragging the view switch onto the map (ray to y=0).
- Keep every file in `src/scene` <= 350 lines (`CameraRig.tsx` is at 344).

## Open items
- Mobile touch pass was done at 390 px; re-check after adding panels.

## Verify
`npx vitest run tests/ui.test.ts tests/cameraRig.test.ts tests/selection.test.ts tests/store*.test.ts`.

## Block merge UI (phase 2)
- Edit mode by camera height: `BLOCK_EDIT_HEIGHT_M = 200` and `editModeForHeight` in `scene/cameraMath.ts` (only place). `scene/BlockEditor.tsx` checks `camera.position.y` each frame and writes `store.editMode` only on change. `ui/useBlockEdit.ts` clears a selection that no longer fits the mode (house/tree in block mode, house block in house mode). Mode chip bottom centre (`EditModeChip`).
- Picking in block mode: one invisible plane at y = 150 m (above every roof, below any block-mode camera) over the town, mounted only in block mode and not while Move blocks is on. It stops the event (houses, trees, hover do not react), intersects the ray with y = 0 and picks the block by bounds (`scene/blockEditMath.ts`). Drags (`e.delta` > 6 px) are ignored.
- Ids: a house-block selection is `{ type: 'block', id: <slot id> }`; monuments keep their content id (as in house mode). Swapped blocks and blocks overridden to monuments cannot merge (`canMerge`).
- Suggestions: `mergeSuggestions(layout, id, eligible)` in `city/merge.ts` (owned by City & Streets, added with their consent): grow the current rectangle by one whole strip W/E/S/N, area <= 4, all added blocks free house blocks. `grownGroup` gives the full member list.
- Store: `mergeBlockGroup(group)` / `splitMergedBlock(mergedId)` commit settings.blockMerges together with a remapped `blockOrder`/`baseBlockOrder` (`store/merges.ts`, uses `getCityLayout` for the fresh ids), so Town's `setBlockOrder` effect never adds a second history step and undo/redo restore both. `swapBlocks` refuses merged blocks of different cell size.
- DOM icons: `ui/BlockEditOverlay.tsx` registers elements in fixed anchor slots (`scene/blockEditAnchors.ts`, slot 0 = +/-, 1..4 = suggestion chips); BlockEditor projects them each frame with one preallocated vector and writes `transform` only when moved > 0.5 px. Buttons are 44 px.
- Decals (selected, hovered, suggestions) use `depthTest: false` at y = 0.3 so they read over roofs like a map overlay.
- Help overlay (`ui/HelpOverlay.tsx`) has a "Block editing" group: mode by height, chip, +, −, save/undo.
- Phones: a block picked in block mode does not auto-open the full-screen panel (it would hide the map icons); Merge in the panel folds it so the suggestion boxes are visible.

### Traps
- Merge cost is the scene rebuild, not the layout (generateCity ~10 ms). `useTownPieces` used to drop its whole piece cache on every layout change (7.7 s per merge); the cache now survives layouts with the lots and bounds in the signature (file owned by Scene & QA, changed for this task). Measured (dev, warm): 1x1 -> 1x2 ~0.9-1.0 s, 1x2 -> 2x2 ~2.4 s; houses cost ~17 ms each (buildHouse + merge), streetscape ~170 ms. The edit runs after one paint so the chip shows "Updating blocks…".
- Vite HMR on hook-order changes throws "Should have a queue" in App/Town; reload the page, it is not a bug.

### Open items
- Merge time for 2x2 (~2.4 s) is still a visible pause; faster needs Buildings (house build cost) or an incremental streetscape.
- Traffic still uses removed street pieces logic per phase 1 (phase 3).

## Boot spinner and error screen
- `index.html` holds the boot screen inline (markup + CSS, dark body `#1c1816`) so it paints before JS. An inline script turns it into an error panel on `window` error / `unhandledrejection` (and module script `onerror`) while it is still visible.
- `scene/FirstFrame.tsx` (in the Canvas) calls `ui/boot.ts` `bootDone()` after the first frame: 0.45 s fade, then removed; no fade or spin under `prefers-reduced-motion`.
- `ui/ErrorBoundary.tsx` wraps `<App/>` in `main.tsx`; Canvas render errors reach it. Fallback reuses the `.mw-boot*` styles: title, message (max 400 chars), Reload. Tests: `tests/errorBoundary.test.ts` (renderToString, node env, no jsdom).
- Dev-only check: `?mwThrow=render` makes FirstFrame throw (gated by `import.meta.env.DEV`).
- Traps: errors in `useFrame` after the first frame are not render errors: the boundary does not see them and the boot screen is gone, so the scene just stops. In dev React also reports boundary-caught errors to `window`, so before the first frame both panels may show the same message.

## Layering (architect fix 3)
- `core` and `store` sit at the bottom. Store runtime imports stay in `core` and `store`; it must not import `city`, `weather`, `scene` or `ui`. `tests/layers.test.ts` checks this (type-only imports are erased and not checked).
- `core/blockIds.ts`: block id scheme (house and merged ids, parsers). Same scheme as `city/merge.ts`; the test checks they agree. `city/merge.ts` could re-export from core (City & Streets to decide).
- `core/weatherKinds.ts`: `WEATHER_KINDS`, `WeatherKind`; `weather/weatherState.ts` re-exports them.
- Store block-merge actions take `idsFor(blockMerges) => ids` from the UI (`ui/useBlockEdit.ts` uses `getCityLayout`) to remap the block order; the store never calls the city generator.

## Session 2026-11-01 (review, no source edits)
Traps:
- git autocrlf=true: "LF will be replaced by CRLF" warnings are benign; working copies are all CRLF, no mixed endings.
- ui/index.ts exports verified: all listed files exist; WALL_COLORS/SHUTTER_COLORS removed, no consumers left.
- CameraRig.tsx is 350 lines (at the cap).
Decisions:
- HousePanel base = houseBaseFor(layout, id) (scene/townBlocks.ts), so the panel shows real block values; DEFAULT_HOUSE_BASE only when the house is not in the layout.
- as-block removed from the Type choices (Original covers it).
Open items:
- HousePanel.tsx:91 an override saved with preset 'as-block' (still valid in io.ts) shows an empty Type select while the scene uses the block preset. Fix: map as-block to the block preset in the panel.
- HousePanel.tsx:71-76 "New look" writes a shutter override on houses with no shutters (base null, swatch hidden). Skip shutter when base is null.
UX (not implemented):
- Settings: group into Light and season / Weather and wind / Town and traffic / Trees and quality / Effects.
- House panel: Shape (type, floors, roof, style) and Colour (wall, shutter, New look) groups.
- Swatch names on hover (title attribute with the colour name).
- Camera reset button: push 'overview' to runtime.cameraPresetRequests.

## Session 2026-11-01 follow-up (fixes)
- Fixed HousePanel.tsx: 'as-block' override shows the block preset in the Type select (`shownPreset`); New look skips the shutter override when the block has no shutters (`hasShutters`, from base).
- Note: src/scene/CameraRig.tsx is 350 lines (at the cap). Not refactored; split before adding code.
- Open (Sky change pending): model.ts `leafAmount` default is 1, but leaves.ts reads it as percent of MAX_LEAVES (600), so the default shows 6 leaves. Proposed default after Sky's unit change: 100. model.ts untouched.
