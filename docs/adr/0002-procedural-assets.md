# ADR 0002: Procedural assets; GLB files are the only binary exception

Status: Accepted (2026-11-01)

## Context
The app must run from a clean checkout with no asset pipeline. Geometry, textures, shader patches and all audio can be generated in code from seeds.

## Decision
- Geometry, textures, shader patches and audio are generated in code. No new binary asset without a stated reason and a budget line.
- The exception is `public/models/` (glTF/GLB nature models, CC0, with a `LICENSE.txt` per folder), loaded at runtime by `src/scene/useNatureTrees.ts` and `src/streets/natureTrees.ts`. They stay tracked in git and must not be gitignored.
- Repeated parts use instanced meshes; new meshes count against the draw-call budget.

## Consequences
- Code size grows instead of asset size; generation runs at load.
- `tests/budget.test.ts` reads the GLB files, so removing them breaks the budget test.
