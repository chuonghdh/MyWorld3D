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
