# Buildings specialist

Reviewed 2026-11-01 at 02b0cdc

**Owns:** `src/buildings/**` (facade, shaders, signs, monuments, materials, palette) and its tests.

## Key files
- `house.ts`, `facade/*` (ground, upper, roof, rear, parts, layers, mesh, polish, presets): the lot-fitted house builder.
- `geometry.ts` (`ColorBatch`), `materials.ts` (shared body, glass and sign materials, night uniforms), `palette.ts` (`BRICK_PALETTE`, `BRICK_LIKE_WALLS`), `shaders/*` (surface, glass, wind). The shared cloud-shade and wet-surface patches live in `src/shaders/` (neutral, used by buildings, weather, streets and environment).
- `monuments/*` with `kit.ts`: ten European landmark blocks.
- `facade/polish.ts`: pure helpers shared with GLSL (`windowOnAt`, `windAmplitude`, night clock).
- Merged-block house parameters: `houseParamsFor` and `styleKeyFor` in `src/scene/townBlocks.ts` (Scene & QA owns the file).

## Conventions
- Merged block meshes keep only the shared materials; per-vertex data rides in `uv` (wind id, anchor weight) and in the lit-glass seed.
- JS helpers that mirror GLSL (`windowOnAt`, `windAmplitude`) are changed together with the shader and tested for equality.
- Random streams are separated (`rngDetail`, `rngRear`) so adding a feature does not shift existing houses (determinism hashes in tests).
- Lowercase hex only in swatch lists and in `BRICK_LIKE_WALLS` checks.
- Tunables live in `src/config/tuning.ts` (`buildings` section): lit-window shares, night emissive, lit colour, sign emissive, floors, preset and monument lists. Do not add new knob literals here.

## Traps
- **uv is shared.** The body shader reads `uv` as (wind id, anchor weight), and lit glass reads `uv.x` as its window seed. `ColorBatch.add` writes zero uv unless the piece is emitted inside `Kit.withWind(code, weight, fn)` or it is lit glass. A monument wall with a box uv near 1 would otherwise flutter like a flag.
- **GLSL reserved words:** `patch` is reserved. Check new shader variable names.
- Wind amplitude must be visible from the city camera (several cm is invisible); cloth moves ~0.3 m at 5 m/s.
- Coplanar faces and inverted winding: run the geometry audits (`tests/geometry.test.ts`, slow, ~2 min).
- Material program cache keys are versioned (`building-body-v4` in `materials.ts`): bump when the patched shader changes.
- Brick flag is an exact match on `BRICK_LIKE_WALLS` with `wallHex.toLowerCase()` (`house.ts:157`). New brick-like swatches must be added to that list or they get stone bases.
- A new mesh in the main pass can break the city draw budget even when its geometry is fine (see `tests/budget.test.ts`, owned by City & Streets).

## Decisions
- Merged blocks keep the lot logic: a merged block is one bigger perimeter ring (`perimeterLots` on the union bounds), so no seams or orphan corners. What changes is scale: one dominant style all round and a shared courtyard 2-4x larger in which the backs are seen from far away.
- `HouseParams.sharedCourtyard` (merged blocks only; absent = byte-identical output): rear gets more window columns, larger windows, 2-4 balconies on most 3+ floor houses, back extensions and washing lines. Uses the same `rngRear` stream.
- Style rhythm on merged blocks: the dominant style key changes every 5 lots along the ring (`styleKeyFor`), and `houseParamsFor` sets `sharedCourtyard` for `merged-*` blocks (`src/scene/townBlocks.ts`).
- Monuments are rigid except flags, bunting, parasol rims, tree crowns and planter foliage.
- Window lights (`facade/polish.ts`): 0% before 17:00, 70% at 20:00, 85% at 21:00 to 22:00, falling to 30% at midnight and held until 06:00-07:00. Lanterns always lit.
- Swatch lists (`HOUSE_WALL_OPTIONS`, `HOUSE_SHUTTER_OPTIONS`, `facade/presets.ts`) derive from `SPECS`, so new presets reach `HousePanel` without edits there.

## Open items
- H-4 glass flatness at golden hour: no test or measurement proves it. Needs a visual check.
- H-5 shop goods, door mats, bikes.
- Merged-block crosswalks: code now drops a crosswalk whose far end lands on no sidewalk corner (`src/city/generate.ts:372`). Confirm by eye on merged-2-0-3-1 (north side) that no crosswalk ends in a house wall.
- Eol warning (CRLF/LF) on `facade/presets.ts` and `index.ts`: normalisation only, not a code defect.

## Verify
`npx vitest run tests/geometry.test.ts tests/buildingsPolish.test.ts`, then the full buildings suite (`buildings`, `buildingsPolish`, `materials`, `monuments`, `geometry`), then `npx tsc --noEmit` and `npx vite build`.

## Phase 2 (commit 720941d, dev)
- No `src/buildings` source changed in phase 2 (commits 720941d, 8f96b8e, c14349b, ccce5cf, 02b0cdc). Winter bare trees, the conifer rule, the fountain reservation and the shadow budget live in Environment, Streets and Scene.
- Trap: the budget test's main count excludes shadow-only meshes, and park crowns sit in their own mesh (cap 4). A house or monument that adds a mesh to the main pass can break the budget even if its own geometry is fine.
- Fixed: brick flag uses `BRICK_LIKE_WALLS` (`palette.ts`: brick palette plus `#6e3a2c`, `#7d4a36`, `#b5533c`) with `wallHex.toLowerCase()`. Side effect: nordic default `#b5533c` now gets a brick base.
- Last recorded run: five-file buildings suite 283/283 (about 6 min; geometry is the slow part). Not re-run in this review.

## Public buildings pass (branch optimize_02, see docs/agents/public-buildings-review.md)
- Monument kinds are 12 now (`city-hall`, `school` added).
- Monument selection is seeded in the layout now (`src/city/generate.ts`, `chooseMonuments`): 1 in 5 buildable blocks, exactly one `gothic-cathedral` and one `city-hall` per seed, other kinds by seed. `Block.monument` carries the kind; `monumentBaseFor(block)` (`src/scene/townBlocks.ts`) reads it. The old hash-into-12 pick is gone. Block overrides still win.
- Shared helpers in `monuments/kit.ts`: `waterBasin(k, {w, d, coping}, depth, colour)` (recessed water with coping; draws 0.05 below its floor, so the floor must stay at y >= 0.05 or the basin lifts the monument); `notchedBox(...)` with `bayOpenings` (recessed bay doors, used by the fire station).
- Trap: a monument whose body sits below y = 0 is lifted by `monument.ts` (`lift`), which moves the whole monument. Keep sinks above the ground plane.
- Decision: monument bodies do NOT cast shadows. Set in `src/scene/useTownPieces.ts` (Scene & QA file), not in `buildings`. Reason: shadow headroom was 12.7k against about 5k per monument. Houses, streets and trees keep their shadows.
- Decision: dinosaur pond is raised on a stone base, not sunk, because the lawn sits at 0.08 m and a sunk pond would cut the lawn. Deviation from the review plan.
- RNG stream shift: cathedral, open-air theatre, dinosaur park and pool changed their builder call order (new features draw from the same kit RNG), so their random colours, lit windows and crowds differ from before. Do not expect old screenshots to match.
- Knobs: 18 monument knobs in `buildings` (civic, leisure, culture odds and crowds) plus the City Hall and School knobs. Each has a parity entry in `tests/tuningParity.test.ts` and a row in `docs/TUNING.md`.
- Open: circus body sag not done; no close, medium or night look was checked by eye for the new kinds.

- 2026-11-06 (scene-qa): building wind already follows sim time (`useTownFrame` calls `setBuildingWind(runtime.simTime, ...)` every frame; the `performance.now()` fallback in `tickBuildingWind` only runs before that). Locked by `tests/film/simClockVisuals.test.ts`.
- 2026-11-06 (buildings): `src/buildings/preview.ts` (exported from `index.ts`): `buildHousePreview(preset, floors = 3)` builds one free-standing house via `buildHouse` + `defaultHouseParams(preset, 'classic')` (preset roof, wall, shutter, lot width/depth, ground floor use), facades on all four sides, seed 1, base y = 0, front +Z. `housePreviewBounds` = `Box3.setFromObject`. `disposeHousePreview` disposes geometries only; meshes use the shared body/glass/glassLit/sign materials, whose patches read module-level uniforms, so they render outside the town. Glass tower previews at 3 floors (town forces >= 7 unless floors are overridden). `PREVIEW_FLOORS`/`PREVIEW_SEED` are local contract constants, not in `tuning.ts` yet. Tests: `tests/housePreview.test.ts`.
- 2026-11-06 (scene-qa): `presetHasShutters` / `presetDefaultShutter` added in `house.ts` (exported from `buildings`); shutter-less kinds now come from one `NO_SHUTTER_KINDS` list, which the `hasShutters` check uses too (output unchanged). Tests: `tests/houseShutters.test.ts`.
- 2026-11-06 (buildings review): `presetHasShutters`/`presetDefaultShutter` (Scene & QA, `house.ts`) reviewed: matches SPECS kinds, `hasShutters` unchanged in output. Added optional `PresetSpec.fillShutter` (canal sage, brownstone grey, nordic cream, from `SHUTTER_COLORS`) used only by `presetDefaultShutter`; `defaultShutter` stays null for those three, so `defaultHouseParams`, `HOUSE_SHUTTER_OPTIONS` and town output are unchanged.
- 2026-11-06 (buildings): `buildHousePreview` now uses `presetDefaultShutter` when the classic default shutter is null and `presetHasShutters` is true (canal, brownstone, nordic), so thumbnails match a type picked on a bare town lot. Other presets unchanged. Thumbnails are cached per session by Scene & QA: reload the page to regenerate.
- 2026-11-06 (buildings): shutter palette extended to 14 (`SHUTTER_COLORS`, `palette.ts`): original five first and in order (sage, blue, oxblood, cream, grey), then deep green, olive, navy, duck-egg, burgundy, ochre, white, charcoal, wood. Stays in `palette.ts` (colour swatch data, like `WALL_COLORS`; not a knob per CLAUDE.md, so no tuning/parity entry). Town lot shutters come from a separate literal list in `src/scene/cityStyle.ts` (Scene & QA), so town output is unchanged.
- 2026-11-06 (buildings): glass tower may go to 12 floors. Knob `buildings.glassTowerMaxFloors: 12` (`src/config/tuning/buildings.ts`, parity entry and `docs/TUNING.md` row). `maxFloorsFor(preset)` (`facade/layout.ts`, exported from `buildings`) returns it for `glass-tower` and `MAX_FLOORS` (8) for every other preset; `computeLayout` and the roof-free preview clamp use it. Town lots are unchanged (`townBlocks` still forces at least 7 floors). Tests: `tests/floorClamp.test.ts`, `tests/buildings.test.ts` (clamp per preset).
- 2026-11-06 (buildings): flat roofs. Self-critique: flat tops were one flat colour (`deck` #8d8a84, surface PLAIN), with no gravel, tar, seams, scuffs or per-house tone; edges read as cartoon. Option chosen: shader-only membrane pattern on the existing cap, no new geometry, no new materials. Added `SURFACE.ROOF_FLAT` (12) and `patRoofFlat` (6 cm gravel speckle, 1.4 m tar blotches, 3 m membrane seams, faint drainage scuffs along object y). Applied to the top cap of `flat`, `parapet`, `cornice` and `terrace` roofs (`isFlatRoof`, `house.ts` `buildCore`). Per-house deck tone: seeded +-0.04 lightness on flat tops from a separate `roofTone` stream (other houses unchanged). Material cache key `building-body-v7`. Not done: edge wear and scupper drainage geometry (no shader access to parapet edges), extra HVAC variety (rooftop items already vary). Terrace decks take the gravel pattern too (no paver pattern yet). Budget unchanged (main 1,428,818, shadow 576,406, calls 127): no geometry or meshes added. Tests: `tests/roofFlat.test.ts`. Visual check in Chrome still needed (GLSL compiles only in the browser).
- 2026-11-06 (buildings): house roof moss and lichen. The cathedral's moss is now the shared `roofMossLayer` (`shaders/surface.ts`) with the same arithmetic (`ageRoof` unchanged, 0.55 strength, 12-18 m eave band). Houses use `patRoofMoss`: eave band 8-16 m (ridges of ordinary houses stay clean), north side and lichen noise, strength `uRoofMoss` = `buildings.roofMossAmount` (0.45) times a surface share (tile and slate 1.0, zinc 0.35, membrane 0.5). Applied to `ROOF_MOSS_SURFACES` (`surface.ts`): tile, slate, zinc, membrane. Parapet copings now take `ROOF_FLAT`. Variation per house comes from the object-position noise, not from a seed attribute (merged-block positions differ per house). Not done: cornice ledges (wall decoration, PLAIN); crevice moss in tile grooves. Material cache key `building-body-v8`.
- 2026-11-06 (buildings): roof moss check and house wall weathering. Roof moss: routing confirmed (mansard and zinc use `ROOF_MOSS_SURFACES` at 0.6 share); the wall head is packed into the id fraction (`roofSurfaceId`, `vSurfCode` in the shader) so each house's eave band sits at its own wall head; strength default 0.45 -> 0.9 (`buildings.roofMossAmount`). Walls: `patWallWeather` (shaders/surface.ts) on brick, timber, stucco, stone and concrete (`WALL_WEATHER_SURFACES`): ground-band grime and splash (0-1.4 m), rain streaks, damp and efflorescence near the base, chipped patches and a facade sun fade, strength `uWallWeather` = `buildings.wallWeatheringAmount` (0.6) times a surface share. Glass tower curtain (PLAIN) and cathedral ids (9-11) are untouched. Rain streaks are vertical everywhere, not tied to sills. Body material cache key `building-body-v10`. Tests: `tests/wallWeather.test.ts`, `tests/roofMoss.test.ts`.
- 2026-11-06 (buildings): window trims aged. New `SURFACE.TRIM_AGED` (13) on the classic window sill, moulded surround and lintel hood (`facade/upper.ts`, `windowUnit`). Shader `patTrimAged`: mould and blotch patches, rain streaks, and upward faces (nrm.y > 0.6) darkened by `uTrimTop` (rain pools). Knobs `buildings.trimAgeAmount` (0.6) and `buildings.trimTopDarken` (0.3), uniforms `uTrimAge` and `uTrimTop` (materials.ts). Not covered: flat-hood cornice and ground-floor trims (ground.ts). Cache key `building-body-v11`. Budget unchanged. Tests: `tests/trimAge.test.ts`.
- 2026-11-06 (buildings): `buildings.trimAgeAmount` default 0.6 -> 0.84 (40% stronger). Shader mix and stain terms are unclamped, so the knob scales the effect directly (peak mould weight about 0.76, below 1). `trimTopDarken` (0.3) unchanged and separate from the age amount.
- 2026-11-06 (buildings): `buildings.trimTopDarken` default 0.3 -> 0.6 (top faces of window trims 60% darker than vertical faces). Shader uses it as a multiplier `r * (1.0 - top * up)`, not a clamped mix, so the value maps directly to the darkening (0.4x brightness at full top). Mould and stain terms unchanged.
- 2026-11-06 (buildings): brick size 2.25x original. `patBrick` (shaders/surface.ts) now uses 0.48375 x 0.14625 m (was 0.3225 x 0.0975 m, then 0.215 x 0.065 m), 4 mm joints unchanged in metres. Shader constant, not a knob; used only by `SURFACE.BRICK` (canal, brownstone, house chimneys). Cathedral and other surfaces untouched. Bricks are not aligned to window edges before or after the change (no new mismatch). Test: `tests/brickScale.test.ts`.
