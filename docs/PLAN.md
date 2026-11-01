# MyWorld3D – Plan status

Reviewed 2026-11-01 at 02b0cdc

Status as of 2026-11-01, branch `dev`, HEAD `02b0cdc`. Source of truth: git log and the code. Earlier rounds (0 to 6) and the block merge track are in git history only.

## Phase 1 – done

Commit `d95a663`.
- Autumn and winter nature: broadleaf autumn palette, evergreen pines stay green, snow on bark, crowns and needles in winter.
- Only broadleaf trees shed leaves; `leafAmount` is a 0-1 fraction.
- House panel reads each house's real values.
- Headlights per vehicle, staggered over dusk; vehicle roof snow and windscreen frost.
- Wheel-track mask keeps snow off tyre tracks.
- Traffic lights and snow; "Monument" renamed to "Public building".

## Phase 2 – done

Commits `720941d`, `ccce5cf`, `c14349b`, `8f96b8e`.
- Winter: broadleaf street trees bare, conifers stay green, pine snow via weather shader.
- Conifers: about 8.8% of city trees [not verified], only on border street, plaza and courtyards.
- Fountain reserved on every seed.
- Shadow copies of broadleaf trees at half density; budgets: main 1.9M tris, shadow 605k, draw calls <= 140.
- Falling autumn leaves: crown spawn, pool of 160, 10 s rest, culling by frustum and 100 m focus radius.
- Leaves rest on sidewalk tops (`streets/pavementSurfaces.ts`).
- Tree lab `tree-compare.html` / `src/dev/treeCompare`, on cloned code only.
- Architecture (commit `6a89651`, which sits before `d95a663` in history): `src/core` layer, `src/shaders` for shared patches, traffic split into `vehicles/` and `walkers/`, store free of city and weather imports, sky and aircraft free of scene imports.

## Phase 2 – open

- Car-roof leaf landing: `src/traffic/vehicleSurfaces.ts` is exported but not called. Leaves do not rest on cars.
- Leaf-rest test for `pavementSurfaces` is not written.
- Real-window visual QA of the tree lab, autumn leaves and fountain reservation is not done (scene graph and shader checks only).
- Lab scale parity: the lab uses `TREE_SCALE` 1.35 (`labNatureTrees.ts`); city `natureItems` applies `t.scale` only. Check by eye before any merge.
- `src/App.tsx` still sets tree species with `Math.random`, saved in `treeOverrides`. Not reproducible from seed.
- Save version check is strict equality (`src/store/io.ts`); no migration path.
- Files over 350 lines: `traffic/vehicles.ts` is now 314 lines. Others (`buildings/facade/roof.ts` 1070, `life/birds.ts` 801, `audio/vehicles.ts` 770) to split when next touched.
- Flaky timing test "600 walkers" in `tests/people.test.ts`: rerun solo before calling it a failure.
- Draw-call headroom: measured 132 vs limit 140. Do not raise the limit to pass a test.

## Next

- Close the open items above in order of visual impact, then decide the next phase with the user.
