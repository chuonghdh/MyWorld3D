# ADR 0010: Dependency layers; core and store at the bottom, scene composes, ui on top

Status: Accepted (2026-11-01)

## Context
Feature modules importing the scene or UI create cycles and make layout code depend on React and rendering.

## Decision
- `core` and `store` sit at the bottom. `core` imports only `core`. `store` imports only `core`, `store` and `src/config`.
- Feature modules (`city`, `streets`, `buildings`, `traffic`, `life`, `environment`, `sky`, `weather`, `aircraft`, `audio`, `shaders`) never import `scene` or `ui`.
- `scene` composes features into the R3F world. `ui` is at the top.
- Guarded by `tests/layers.test.ts` (runtime imports of core and store) and `tests/harness.test.ts` (feature, core and store must not import scene or ui, type imports included).

## Consequences
- Logic that a feature and the UI both need goes into `core` or `store`.
- `tests/layers.test.ts` does not check type-only imports in `core` and `store`.
