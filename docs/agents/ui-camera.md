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
