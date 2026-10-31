# Buildings specialist

**Owns:** `src/buildings/**` (facade, shaders, signs, monuments, materials, palette) and its tests.

## Key files
- `house.ts`, `facade/*` (ground, upper, roof, rear, parts, layers, mesh, polish): the lot-fitted house builder.
- `geometry.ts` (`ColorBatch`), `materials.ts` (shared body, glass and sign materials, night uniforms), `shaders/*` (surface, glass, wind).
- `monuments/*` with `kit.ts`: ten European landmark blocks.
- `facade/polish.ts`: pure helpers shared with GLSL (window on/off schedule, wind amplitude).

## Conventions
- Merged block meshes keep only the shared materials; per-vertex data rides in `uv` (wind id, weight) and in the lit-glass seed.
- JS helpers that mirror GLSL (`windowOnAt`, `windAmplitude`) are changed together with the shader and tested for equality.
- Random streams are separated (`rngDetail`) so adding a feature does not shift existing houses (determinism hashes in tests).

## Traps
- **uv is shared.** Box texture coordinates in `uv` were read by the body shader as (wind id, weight): monument walls with `uv.x` near 1 behaved like flags. `ColorBatch.add` now writes zero uv; only `Kit.withWind(code, weight, fn)` makes a piece flexible.
- **GLSL reserved words:** `patch` is reserved. Check new shader variable names.
- Wind amplitude must be visible from the city camera (several cm is invisible); cloth moves ~0.3 m at 5 m/s.
- Coplanar faces and inverted winding: run the geometry audits (`tests/geometry.test.ts`, slow, ~2 min).
- Material program cache keys are versioned (`building-body-v4`): bump when the patched shader changes.

- **Merged blocks keep the old lot logic.** A merged block is one bigger perimeter ring (`perimeterLots` on the union
  bounds), so there are no seams or orphan corners; what changes is the scale: one dominant style all round and a
  shared courtyard 2-4x larger in which the backs are seen from far away.
- Pre-existing audit gaps outside the test matrix (not caused by merges): canal step-gable, 5 floors, front-only,
  11x15 lot: 1 see-through ray of ~29k near the gable top; nordic 2 floors, 16 m wide, front+left: one 0.002 m2
  roof overlap at 1.1 cm. The shared-courtyard audit therefore uses floors 2/4/8 and an 11x15 lot.

## Decisions
- `HouseParams.sharedCourtyard` (merged blocks only; absent = byte-identical output): rear gets ~85% of the front
  window columns (not 55%), larger windows, 2-4 balconies on 90% of 3+ floor houses, back extensions on 65%,
  washing lines on 45%. Same `rngRear` stream; costs about +8% triangles on those houses only.
- Style rhythm on merged blocks lives in `src/scene/townBlocks.ts` (Scene & QA): the dominant style key changes every
  5 lots along the ring (`styleKeyFor`), and `houseParamsFor` sets `sharedCourtyard` for `merged-*` blocks.
- Monuments are rigid except flags, bunting, parasol rims, tree crowns and planter foliage.
- Window lights: 0% before 17:00, 70% at 20:00, 85% at 21:00 to 22:00, 30% at midnight until 06:00-07:00; lanterns always lit.

## Open items
- Crosswalks of a removed junction stay on the outer street and lead to a continuous house wall (City & Streets; seen on merged-2-0-3-1 north side).
- H-4 glass flatness at golden hour; H-5 shop goods, door mats, bikes.

## Verify
`npx vitest run tests/geometry.test.ts tests/buildingsPolish.test.ts`, then the full suite and `npx vite build`.
