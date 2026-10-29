# Scene & QA specialist

**Owns:** `src/scene/**` (everything not owned by UI & Camera or Audio), `src/core/**`, `src/App.tsx`, `src/main.tsx`, `tests/helpers/**`, budget and determinism tests, build health and project docs (`docs/BRD.md`, `PLAN.md`, `REVIEW-01.md`, `DESIGN-3D.md`).

## Key files
- `scene/Town.tsx` (267 lines): mounts everything. The per-frame work lives in `useTownFrame.ts`; other hooks: `useTownPieces`, `useTownGreenery`, `useTownTraffic`, `useTownAircraft`; helpers `townBlocks.ts`, `townShadow.ts`, `mergeBlock.ts`, `runtime.ts`.
- `scene/PostFX.tsx` composer: MSAA, bloom, sanitize pass, shadow fit.

## Conventions
- Every file in `src/scene` <= 350 lines. Order of work inside the frame hook matters: clock, gusts, wind uniforms, `setBuildingWind`, weather, lights and shadow fit, clouds, aircraft, smoke, leaves, traffic, walkers, signals, life, `audio.update`, then `clearLifeEvents()`.
- No per-frame allocation. Memo dependency arrays are exact; every created object is disposed.
- Perf budgets are tests (`budget.test.ts`): triangles and draw-call estimate. Quality tiers Low/Med/High.

## Traps
- A night "black block curtain": NaN from `pow(1-v, 1.7)` with v slightly above 1 -> clamp; the sanitize pass is a safety net. Headlight glow "dashes" had the same root cause.
- Stale Vite dev server shows "does not provide an export": kill the process on 5173 and restart; never truncate a source file with a shell redirect while HMR watches it.
- The pedestrian timing test is a flake under load.
- Runtime crashes can pass tsc and unit tests: load the page and read the console after wiring changes.
- Built-in browser pane cannot paint frames; verify scene graph, uniforms and shader compile instead.

## Process knowledge
- Run in this order before reporting: `npx tsc --noEmit`, `npx vitest run`, `npx vite build`.
- Commits only on the user's word, in English, with the attribution line from the current system reminder.

## Open items
- Round 6.5 optional backlog (tram, canal and boats, seasonal events); a real-window visual QA pass.
