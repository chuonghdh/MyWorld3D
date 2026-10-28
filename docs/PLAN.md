# MyWorld3D – Agent plan

Six roles in total. Agent 0 goes first, agents 1–4 run in parallel once the skeleton exists, and agent 5 goes last.

| # | Role | File scope (file ownership) | Depends on |
|---|---|---|---|
| 0 | Scaffold | `package.json`, `vite.config.ts`, `tsconfig*.json`, `src/main.tsx`, `src/App.tsx`, `src/core/*` (types, seeded RNG) | – |
| 1 | City generator | `src/city/*` (roads, block grid, lots, street trees, vehicle waypoints) | 0 |
| 2 | Buildings and monuments | `src/buildings/*` (house presets, roofs, Classic/Modern, 10 monument blocks) | 0 |
| 3 | Environment | `src/environment/*` (sky, sun, clouds, wind, tree and leaf shaders, leaf devil) | 0 |
| 4 | UI, state and audio | `src/ui/*`, `src/store/*`, `src/audio/*` (panels, zustand, JSON, undo/redo, Web Audio) | 0 |
| 5 | Traffic and QA | `src/traffic/*`, `tests/*` (vehicles, traffic lights, pedestrians; tests; fps and console checks) | 1, 2, 3, 4 |

## Rules for parallel work
- Each agent edits only files inside its own scope. If another file needs a change, report it instead of editing it.
- Shared types (`src/core/types.ts`) are defined first by agent 0. Other agents only add fields, they never rename existing ones.
- The store (`src/store`) is the single source of truth for layout and settings. The scene only reads from it.

## Order
1. Agent 0: scaffold, a building project, an empty scene with a top-down camera.
2. Agents 1–4: run in parallel.
3. Agent 5: integrate traffic, run the tests, check the build and the console.
