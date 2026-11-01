# Technical Architect
Reviewed 2026-11-01 at 02b0cdc

**Owns:** cross-cutting structure, not feature code. Module boundaries, the asset pipeline, the performance budget, the build and test toolchain, and dependency hygiene. Writes no feature geometry; it reviews, proposes and sets standards that the specialists implement. Edits docs and budgets/guard tests only, and only when the owning specialist agrees.

## Role
- Keep the dependency direction clean: `core` and `store` at the bottom, `city` and `buildings`/`streets`/`traffic`/`environment` as feature modules, `scene` as the composition layer, `ui` at the top. Flag any feature module importing `scene` or `ui`.
- Keep layouts pure: anything generated from `settings` plus `layout.seed` is a pure function (no `Math.random`, no wall-clock time). Hashes in tests are the contract.
- Review each merge that crosses owners (for example block merging touched city, streets, traffic, buildings and scene). Check file ownership in `docs/agents/README.md` and `docs/REPO_MAP.md` before approving.
- Track size limits (`src/scene` files <= 350 lines) and split a file before it grows past the rule.

## Asset pipelines
- **Procedural first.** Geometry, textures, shader patches and all audio are generated in code from seeds. New binary assets need a reason and a budget line.
- **Binary assets (exception).** `public/models/` holds 56 GLB files (Quaternius and Kenney, CC0, `LICENSE.txt` in each folder), plus 5 PNG and 1 JPG. They are tracked in git and loaded at runtime by `scene/useNatureTrees.ts` and `streets/natureTrees.ts`; `tests/budget.test.ts` reads them. Do not gitignore them: a clean checkout would lose the city trees and fail the budget.
- **Geometry.** Repeated parts use instanced meshes (`MeshBuilder`, `placeMatrix`). A new mesh counts against the draw-call budget; prefer merging into an existing mesh of the same material.
- **Textures and shaders.** Shared canvas textures are created once and cached. Shader patches go through `onBeforeCompile` with a `customProgramCacheKey` that is versioned (e.g. `building-body-v4`, `person-rig-v3`). Chained patches append a suffix to the previous key (e.g. `|wx1` in `shaders/wetSurface.ts`). Shared patches live in `src/shaders/` (`cloudShade.ts`, `wetSurface.ts`). No GLSL identifier `patch` is used.
- **Audio.** Sound routing follows `docs/AUDIO.md`. The Audio specialist owns the bus and emitters.
- **Fonts, icons, UI assets.** Inline SVG in TSX or small CSS. No fetch, XHR or WebSocket in `src`; `localStorage` is used only in `src/ui/SoundMixer.tsx`.
- **Caching.** Anything that depends on layout is keyed by `layoutKey`. `cityLayoutKey` (`src/city/layoutKey.ts`) ignores `trafficMultiplier` and includes `blockMerges`. `createLayoutProvider` is single-entry; `retargetTraffic` changes only spawns. Pieces are cached per block signature (`useTownPieces`).
- **Save files.** JSON settings are the only persisted state. Every new field needs a default, validation in `io.ts`, and a migration note if old saves change meaning.

## Performance standards
- **Frame budget.** 60 fps target on a mid-range desktop GPU at the default quality tier; 30 fps floor on phones at the lowest tier. Frame time is measured, not guessed.
- **Draw calls and triangles.** The guard tests in `tests/budget.test.ts` are the limit (see Scene & QA handbook for current values). Raising a limit needs a measured reason written in the handbook and approval from Scene & QA.
- **Rebuild cost.** A user action that rebuilds the town has a time budget. Reference: 1x1 to 1x2 merge ~1 s, 1x2 to 2x2 ~2.4 s (accepted for now; speed-up is backlog). A new feature may not make these worse without a note.
- **Determinism.** Same seed and settings produce the same output. No `Math.random` in layout code (city, streets, buildings, traffic, environment, life, store). Exceptions: `App.tsx` `switchTrees` (user action, species saved with the layout, accepted) and audio (not layout).
- **No coplanar geometry.** Decals use distinct heights plus polygon offset.
- **Visual quality is not traded silently.** A cheaper path needs side-by-side evidence and a note.
- **Measurement.** Use the `__r3f` dev handle (draw calls, triangles) and `performance.now()` around layout builds. The built-in browser cannot paint frames; use the connected Chrome for visual or timing checks and say what was not seen.

## Traps
- Vite can serve a stale transform of a module after a multi-file edit. A `ReferenceError` in a module that looks correct means the server is stale: touch the file or restart the dev server, then recheck the served source.
- An error inside the R3F Canvas unmounts the whole React tree, which looks like a blank page. Boot screen and error boundary exist for this (`src/ui/boot.ts`, `src/ui/ErrorBoundary.tsx`).
- Node-only APIs (`node:fs`) in tests break `tsc` unless node types are configured. `tests/budget.test.ts` (line 88) builds the module name by string concatenation in a dynamic import; keep that pattern. Or use Vite `?raw` imports.
- `weatherUniforms` is shared by reference. Swap `.value` only, never replace the uniform object (`streets/index.ts`, `shaders/wetSurface.ts`).
- Lab clones: the tree-compare page (`src/dev/treeCompare`) reads clones only and is not imported by the city. Shared modules it does not clone are listed in `docs/agents/scene-qa.md` (Tree lab).

## Decisions
- Specialists own their directories; the architect does not edit feature code. Cross-owner changes go through the owner.
- Owners do not add feature code to the architect handbook. The architect records reviews and standards only.
- Budgets live in tests, not in prose, so they fail loudly.
- Lab clones stay separate from the city until the user approves a merge.

## Findings status (phase 2 review, verified at 02b0cdc)

| # | Finding | Status |
|---|---|---|
| 1 | Feature modules importing `scene` | Closed. No `../scene` imports in sky, aircraft, feature folders or store. `sky/SkyDome.tsx:7` uses `core/runtime`; `aircraft/schedule.ts` reads `uiCamera.maxDistance` from `config/tuning` (core/cameraLimits removed) |
| 2 | Store importing city and weather | Closed. No city or weather imports in `src/store`. `core/blockIds.ts` and `core/weatherKinds.ts` exist |
| 3 | Draw-call guard, dead 400 limit | Closed. No 400 limit in `tests/budget.test.ts`; cap 140 (line 308). Test comments disagree on the measured figure (130 at line 269, 132 at line 307); not re-measured here |
| 4 | Shader ownership split | Closed, committed in `6a89651`. `src/shaders/wetSurface.ts` and `src/shaders/cloudShade.ts` exist; `environment/cloudShade.ts` re-exports; `weather/wet.ts` imports `../shaders/wetSurface` |
| 5 | Files over 350 lines | Open. 32 files over 350 lines. `traffic/vehicles.ts` 314 (was 1794), `traffic/pedestrians.ts` 281 (was 1511). Largest: `buildings/facade/roof.ts` 1070, `ui/panels.css` 930, `life/birds.ts` 801, `audio/vehicles.ts` 770. Each owner splits its own files, no behaviour change |
| 6 | `Math.random` for tree species (`App.tsx`, `switchTrees`) | Accepted. Random on purpose; species travel with the exported layout (`exportLayout` / `importLayout` in `store/io.ts`) |
| 7 | Import version check strict equality (`store/io.ts:208`) | Open, low priority (UI & Camera). No migration path; only user-triggered export and import exist |
| 8 | Signature `JSON.stringify` per block | Open, unmeasured. `src/scene/useTownPieces.ts:50` stringifies `lots` and house overrides on every memo run. Measure with `performance.now()` before changing |

New finding (open): `src/core/runtime.ts:4` imports the type `GustEvent` from `environment/wind`. Type-only and erased at build, but `core` should not depend on feature modules. Move `GustEvent` to `core/types.ts`. Owner: Scene & QA.

## Open items
- Findings 5, 7 and 8 above, and the `core/runtime.ts` type import.
- Frame time and rebuild time still need measurement in connected Chrome.
- First full review of repository structure, asset patterns and budgets is done (this handbook). Re-run the module-graph grep after any cross-owner merge.

## How to verify
`npx tsc --noEmit`, `npx vitest run` (rerun the pedestrian flake alone), `npx vite build`. For structure claims: grep for `from '../scene` and `from '../ui` in feature folders and `src/store`; `wc -l` for the 350-line rule. For performance claims, measure in Chrome with the scene graph and draw-call counts, and state plainly what was not checked by eye.

## Session notes (2026-11-01)
- Build check at the first review pass: `tsc --noEmit` and `vite build` exited 0; index JS 1,650.63 kB (gzip 507.56 kB) is above Vite's 500 kB warning. Not re-run in the 02b0cdc review. Code-split or raise `chunkSizeWarningLimit` only with a measured reason.
- `tree-compare.html` is committed at the repo root as a dev-server-only entry (not built). `src/dev/treeCompare/` and `src/shaders/` are committed.

## Research notes (not adopted)
- Harness (revfactory/harness, meta-skill that generates agents and skills): adopt nothing wholesale. Adaptable pieces: a short cross-owner handoff checklist (files, acceptance, what must not change) and using the Explore agent for broad scans. Conflicts: generated team replaces our fixed roster, `/harness:evolve` rewrites owned files, and a change-history section in CLAUDE.md conflicts with the slim CLAUDE.md rule. No token-savings figures are published by the project. Revisit only with a measured pilot.
- Code graph tools (CodeGraph, Graphify; the "Graphity" repo URL returned 404): their token savings are self-reported and small-N. Our repo (166 TS/TSX files) is small enough that the hand-written REPO_MAP and handbooks route most lookups in one hop. Revisit only if a pilot on a cross-folder task shows 25% or more fewer tokens. No install, no pilot run.
