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

## Decisions
- Monuments are rigid except flags, bunting, parasol rims, tree crowns and planter foliage.
- Window lights: 0% before 17:00, 70% at 20:00, 85% at 21:00 to 22:00, 30% at midnight until 06:00-07:00; lanterns always lit.

## Open items
- H-4 glass flatness at golden hour; H-5 shop goods, door mats, bikes.

## Verify
`npx vitest run tests/geometry.test.ts tests/buildingsPolish.test.ts`, then the full suite and `npx vite build`.
