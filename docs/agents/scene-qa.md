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

## Browser verification (run before any new work)
1. `list_connected_browsers` (Claude in Chrome). It must show one connected, local browser. If it is empty, stop and ask the user to connect Chrome. Do not fall back silently.
2. `tabs_context_mcp` with `createIfEmpty: true`, then navigate the tab to `http://localhost:5173/` (dev server must be running).
3. Wait about 6 s, then read console errors (`read_console_messages`, `onlyErrors: true`) and check `canvases >= 1` and WebGL available (`javascript_tool`).
4. Take a screenshot (`computer` screenshot, `save_to_disk: true`) and look at it. This is the only place a frame can be seen.
5. Close the tab when done unless the user wants it kept.

Last smoke test: passed on 2026-10-29 (page title MyWorld3D, one canvas, WebGL on, no console errors, Settings panel and town visible). The built-in pane in the app cannot paint frames: do not use it for visual checks.

## Process knowledge
- Run in this order before reporting: `npx tsc --noEmit`, `npx vitest run`, `npx vite build`.
- Commits only on the user's word, in English, with the attribution line from the current system reminder.

## Open items
- Round 6.5 optional backlog (tram, canal and boats, seasonal events); a real-window visual QA pass.

## Session 2026-11-01
- Review of uncommitted scene, budget and layoutKey edits. `tsc --noEmit` clean; `budget` + `layoutKey` tests pass (16/16).
- Decision: Town.tsx leaf emitters use broadleaf only (`NATURE_TYPES[].evergreen` filter). Memo deps `[layout, settings.seed]` and effect deps `[leaves, broadleaf]` are exact.
- Decision: `houseBaseFor` (townBlocks.ts) returns null for unknown house ids. `layout.lots` is a required array, so no null-lots guard needed.
- Decision: budget thresholds raised to Quaternius numbers. Comment figures (1,539,195 etc.) are not re-checked against a log.
- Trap: `natureItems` (src/streets/natureTrees.ts:94) uses `t.scale` only. The old path used `t.scale * TREE_SCALE` (1.35). City trees are about 26% smaller now. `src/dev/treeCompare/main.ts:25` still claims parity with TREE_SCALE.
- Trap: tree species overrides (`treeOverrides`, App.tsx:91-95) no longer change the rendered city trees. `useNatureTrees` takes no overrides (src/scene/useNatureTrees.ts:50-54).
- Open: restore scale or confirm GLB scale is intended. Decide whether overrides apply in `natureItems` or the UI is dropped.
- Open: `useNatureTrees` load failure only logs `console.error`; the trees vanish with no fallback.
- Open: `useNatureTrees` `empty` memo omits `season` from deps (no eslint config in package.json, so no lint warning).
- Fix: useNatureTrees takes `treeOverrides` (passed from useTownGreenery) and calls `natureItems(layout, seed, treeOverrides)`. Needs City's optional third parameter in src/streets/natureTrees.ts; tsc fails until it lands.
- Fix: on GLB load failure, useNatureTrees falls back to procedural `createTreeField` (scale 1.35, species overrides applied). Error still logged.
- Verified: budget comments match a live log (main 1,539,195; shadow 549,627; draw calls 132).
- src/dev/treeCompare/main.ts:25 already uses TREE_SCALE 1.35; left untouched (outside owned paths).
- Wiring: App.tsx and useTownGreenery pass `treeOverrides` into useNatureTrees. `natureOverridesFor` maps species to NATURE_TYPES indices (type chosen by hashId(treeId)); `treeScale` left to the default. Compiles against City's `NatureOverrides`.
- Fallback on GLB load failure: procedural createTreeField, scale 1.35, species applied.

## Session 2026-11-01 (lead tasks a-d)
- (a) Courtyard tree obstacles: `courtyardTreeObstacles` (city/streetscape.ts) already feeds `createCourtyardGreenery` via `useTownGreenery.ts`. No Sky consumer exists in `src/sky`. Town.tsx and useNatureTrees.ts unchanged: a tree field is not greenery.
- (b) `useNatureTrees` empty memo now `[season]`.
- (c) Dead `<= 400` assertion removed from budget.test.ts; draw-call guard is `<= 140`. Measured 132 (100 main + 32 shadow).
- (d) `#c9b48e` is not in code (grep clean). Hemisphere ground is `nightGround`: `#b9bcb6` lerped to `#3a4668` by nightness. Sky-environment handbook entry is stale.
- Open: `tests/streetDecor.test.ts` "puts the fountain in free courtyard space" fails solo. Likely from City's uncommitted streetscape.ts edit (footprint uses courtyardTreeObstacles). Not my file; not fixed.

## Phase 2 (branch dev)
- Draw-call guard: `budget.test.ts` `<= 140`, measured 132 (100 main + 32 shadow). Dead `<= 400` assertion removed. Do not raise draw calls to pass a test.
- Counting rule: shadow-only copies of meshes are counted in the shadow total, not the main total. Keep this split when adding casters.
- Courtyard obstacles: `courtyardTreeObstacles` (city/streetscape.ts) feeds `createCourtyardGreenery` through `useTownGreenery.ts`. No Sky consumer in `src/sky`. Town.tsx and useNatureTrees.ts are unchanged for this.
- `useNatureTrees` empty memo deps now `[season]`.
- streetDecor fountain test ("free courtyard space") failed after City's streetscape edit. It passes now (11/11 solo). Fix landed outside my files.
- Hemisphere ground `#c9b48e` is not in code. Ground is `nightGround` (`#b9bcb6` to `#3a4668` by nightness). Sky-environment handbook entry is stale.
- Open: real-window visual QA; optional Round 6.5 backlog; `useNatureTrees` load failure still console-only (fallback exists).
