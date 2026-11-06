# Architecture

Reviewed 2026-11-06. Folder-by-folder detail is in `docs/REPO_MAP.md`. Owners are in `docs/agents/README.md`. Decisions are in `docs/adr/`.

## Layers

From bottom to top. A layer may import only the layers below it (enforced by `tests/layers.test.ts` and `tests/harness.test.ts`, ADR 0010).

| Layer | Folders | Role |
|---|---|---|
| Config | `src/config/tuning/` | Designer knobs, plain values. |
| Core | `src/core/` | Pure shared code: seeded RNG (`rng.ts`), shared types, runtime state, block ids, weather kinds. Imports only core. |
| Store | `src/store/` | Zustand settings (`model.ts`), JSON save and load with validation (`io.ts`), merges. Imports core and store. |
| Feature modules | `src/city/`, `streets/`, `buildings/`, `traffic/`, `life/`, `environment/`, `sky/`, `weather/`, `aircraft/`, `audio/`, `shaders/` | Build geometry, layouts and behaviour. Never import `scene` or `ui`. |
| Scene | `src/scene/` | Composes features into the R3F world: mounts the town (`Town.tsx`), per-frame update (`useTownFrame.ts`), camera rig, selection, post effects. |
| UI | `src/ui/`, `src/App.tsx`, `src/main.tsx` | React panels, time bar, help, boot. Top layer. |

`src/dev/treeCompare/` is a standalone tree lab (`tree-compare.html`). It is never imported by the city.

## Data flow

1. Settings: `WorldSettings` in `src/store/model.ts`. Changed by UI panels, loaded and saved as JSON.
2. Layout: pure functions of `settings` and `layout.seed` produce blocks, lots, avenues and streets (`src/city/`). Results are cached by `layoutKey` (`src/city/layoutKey.ts`).
3. Features: buildings, streets, traffic, life and environment build meshes and motion from the layout. Pieces are cached per block signature.
4. Scene: `Town.tsx` mounts the pieces; `useTownFrame.ts` runs the per-frame update order. Visual motion uses simulation time.
5. Output: the canvas. Audio is generated in `src/audio/` from the same simulation state.

## Determinism

- Same `settings` and `layout.seed` give the same town. Layout code uses the seeded RNG only (ADR 0004).
- No wall-clock time in layout code. Hashes in tests are the contract.
- A change to layout code needs a hash test or an explicit note in the handbook.

## Rendering budget

- Triangle, shadow and draw-call limits are guarded by `tests/budget.test.ts`. The values are not restated here; read the test and the Scene & QA handbook (`docs/agents/scene-qa.md`).
- Repeated parts use instanced meshes. New meshes count against the draw-call limit.
- Targets and asset rules: `docs/agents/architect.md` (performance standards, asset pipelines).
- Frame time and visual quality are checked by hand in connected Chrome (`docs/HARNESS.md`, known gaps).

## Links

- Map: `docs/REPO_MAP.md`
- Owners and handbooks: `docs/agents/README.md`, `docs/agents/architect.md`
- Tuning: `docs/TUNING.md`, `docs/adr/0003-tuning-knobs-in-config.md`
- Audio: `docs/AUDIO.md`
- Harness and guards: `docs/HARNESS.md`
- Coding rules: `docs/CODING_STANDARDS.md`
