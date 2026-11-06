# Coding standards

Reviewed 2026-11-06. Each rule below is either enforced by a guard or checked by grep at the review date. Rules marked "by hand" are not machine-checked.

## TypeScript

- `strict`, `noUnusedLocals`, `noUnusedParameters` are on (`tsconfig.json`). Check: `npx tsc --noEmit`.
- No `any` (`: any` or `as any`): enforced by ESLint `@typescript-eslint/no-explicit-any` (error, ADR 0012). No `@ts-ignore` or `@ts-expect-error` in `src` or `tests`: checked by grep on 2026-11-06, none found.
- Rules of hooks and hook dependencies: ESLint `react-hooks/rules-of-hooks` (error) and `react-hooks/exhaustive-deps` (error). Run `npm run lint`.

## Lint (ESLint, `eslint.config.js`, ADR 0012)

- `npm run lint` = `eslint src tests --max-warnings 0`. It is part of `npm run check`, after `tsc`.
- Only rules the repo passes are errors. Rules with existing violations are off in the config, with their counts written next to them. Turn a rule on only when its count is zero, in the same change that fixes the violations.
- Counts on 2026-11-06, for owners to fix: `react-hooks/exhaustive-deps` 3 (`src/App.tsx` 1, `src/scene/Town.tsx` 1, `src/sky/SkyDome.tsx` 1; Scene & QA and Sky & Environment). Unused `eslint-disable` directive 2 (`src/scene/CameraRig.tsx`: UI & Camera; `tests/budget.test.ts`: Scene & QA). Remove the directive when the hook it silences is fixed.
- Off, pending fixes: `no-unused-vars` and `@typescript-eslint/no-unused-vars` 5 (buildings 1, tests 4), `prefer-const` 4 (buildings 1, life 1, tests 2), `no-useless-assignment` 12 (audio 1, buildings 1, life 3, traffic 1, ui 2, tests 4), `@typescript-eslint/no-unused-expressions` 1 (`src/dev/treeCompare`).
- Relative imports only inside a layer; cross-layer rules are in ADR 0010 and `tests/layers.test.ts`.
- Type-only imports from `scene` or `ui` into feature code are also forbidden (`tests/harness.test.ts`).

## Naming

- React components: PascalCase `.tsx` files (`TimeBar.tsx`, `HousePanel.tsx`). Older lowercase `.tsx` files exist (`controls.tsx`, `roofIcons.tsx`, `main.tsx`); do not rename them as part of unrelated work.
- Hooks: `use` prefix (`useTownFrame.ts`).
- Other modules: camelCase file names (`layoutKey.ts`, `blockIds.ts`).
- Tests: `tests/`, one file per area (ADR 0009).

## File size

- Maximum 350 lines per `.ts` or `.tsx` file. Enforced as a ratchet (ADR 0007, `tests/harness.test.ts`).
- Split by responsibility, not by line count alone. Do not raise a recorded number.

## Knobs and constants

- A knob (a value a designer may change) lives only in `src/config/tuning/` and is imported (ADR 0003). Add a doc line, a `tests/tuningParity.test.ts` entry and a `docs/TUNING.md` row together.
- Geometry, shader and algorithm constants stay local to their module.
- No duplicated values. Lab copies live only in `src/dev/treeCompare/labTuning.ts`.

## Geometry

- No coplanar geometry: do not place two faces at the same plane. Use a small offset (by hand review; not machine-checked).
- Repeated parts use instanced meshes (`MeshBuilder`, `placeMatrix`) or merge into an existing mesh with the same material.

## Shaders

- Shader patches go through `onBeforeCompile` with a versioned `customProgramCacheKey`, for example `building-body-v11` (`src/buildings/materials.ts`) or `leaf-near-fade-v1` (`src/environment/leafShapes.ts`). A changed patch bumps its version.
- A chained patch appends a suffix to the previous key (`|cs1` in `src/environment/trees.ts`).
- Shared patches live in `src/shaders/`.
- The GLSL identifier `patch` is reserved and must not be used (`CLAUDE.md`).

## Determinism

- Layout code uses the seeded RNG, never `Math.random` or wall-clock time (ADR 0004; guarded for core, store, city, streets, buildings, traffic, life and environment).
- No `fetch`, XHR or WebSocket in `src` (ADR 0005; guarded).
- `localStorage` only in the files listed in `tests/harness.test.ts` (ADR 0006; guarded).

## Comments and language

- Code comments, docs and commit messages are in English (`CLAUDE.md`). Checked by grep 2026-11-06: no Vietnamese diacritics in `src` or `docs`.
- Comments say why, not what. Layout modules state their determinism rule in the header comment (for example `src/life/spots.ts`).

## Dependencies

- New dependencies need user approval and are pinned exact (for example `mp4-muxer` 5.2.2, architect handbook, 2026-11-04).

## Verification

- `npm run check` runs `tsc --noEmit`, `vitest run` and `vite build`. Rerun a flaky pedestrian test alone before reporting it as a failure (`CLAUDE.md`).
