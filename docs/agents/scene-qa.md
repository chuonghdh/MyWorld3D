# Scene & QA specialist
Reviewed 2026-11-01 at 02b0cdc

**Owns:** `src/scene/**` (everything not owned by UI & Camera or Audio), `src/core/**`, `src/App.tsx`, `src/main.tsx`, `src/dev/treeCompare/**` (tree lab, dev only), `tree-compare.html`, `dashboard/`, `public/models/**` (Quaternius and Kenney GLB, CC0), `tests/helpers/**`, budget and determinism tests, build health and project docs (`docs/BRD.md`, `REVIEW-01.md`, `DESIGN-3D.md`).

## Key files
- `scene/Town.tsx` (294 lines): mounts everything. The per-frame work lives in `useTownFrame.ts`; other hooks: `useTownPieces`, `useTownGreenery`, `useTownTraffic`, `useTownAircraft`, `useNatureTrees`; helpers `townBlocks.ts`, `townShadow.ts`, `mergeBlock.ts`. `runtime.ts` is a re-export of `core/runtime.ts`.
- `scene/PostFX.tsx` composer: MSAA, bloom, sanitize pass, shadow fit.
- `src/App.tsx`: panel wiring, `switchTrees` action (random tree species, a user action).

## Conventions
- Every file in `src/scene` <= 350 lines (largest is `Town.tsx` at 294). Repo-wide, 32 files are over 350 (architect finding 5).
- Order of work inside `useTownFrame.ts` matters: clock, gusts, wind uniforms, `setBuildingWind`, weather (`weather.update`), `setSnow`, lights and shadow fit, clouds, aircraft, smoke, leaves, traffic, walkers, signals, life, `audio.update`, then `clearLifeEvents()`. Do not reorder without reading the file.
- No per-frame allocation. Memo dependency arrays are exact; every created object is disposed.
- Leaves: `Town.tsx` emits falling leaves from broadleaf trees only (`NATURE_TYPES[].evergreen` filter). Memo deps `[layout, settings.seed]`, effect deps `[leaves, broadleaf]`.
- Tree field: `natureItems(layout, seed, overrides?)` in `src/streets/natureTrees.ts` scales every tree by the layout scale times `TREE_SCALE` (1.35) unless `treeScale` is overridden. Species overrides (`treeOverrides`) reach the city through `useNatureTrees` (`natureOverridesFor`). If the GLB load fails, `useNatureTrees` falls back to procedural `createTreeField` (scale 1.35, species applied) and logs the error.
- Quality tiers Low / Med / High.

## Budgets (`tests/budget.test.ts`)
Limits are in the tests, not in prose. Changing one needs a measured reason written here and Scene & QA approval.
- Main-pass triangles <= 1,900,000. Blocks (main) between 1,100,000 and 1,140,000.
- Shadow-pass triangles <= 605,000 (and <= 40% of the pre-diet shadow level).
- Main + shadow triangles <= 2,300,000.
- Draw calls (main meshes + shadow meshes) <= 140. Do not raise this to pass a test.
- Detail meshes: at most one per seeded house block.
- Counting rule: shadow-only copies of meshes (broadleaf leaf copies on layer 1) are counted in the shadow total, not the main total. Keep this split when adding casters. The main-count test must skip shadow-only meshes.
- Figures in the test comments (seed 1, default settings): main 1,539,195, shadow 549,627, draw calls 132 (100 main + 32 shadow). Other numbers in the test comments are stale (e.g. "130" at line 269, "98 main" there). Not re-measured in this review.

## Traps
- A night "black block curtain": NaN from `pow(1-v, 1.7)` with v slightly above 1 -> clamp; the sanitize pass is a safety net. Headlight glow "dashes" had the same root cause.
- Stale Vite dev server shows "does not provide an export": kill the process on 5173 and restart; never truncate a source file with a shell redirect while HMR watches it.
- The pedestrian timing test ("600 walkers", `tests/people.test.ts` / `audioPeople`) is a flake under load.
- Runtime crashes can pass tsc and unit tests: load the page and read the console after wiring changes.
- Built-in browser pane cannot paint frames; verify scene graph, uniforms and shader compile instead.
- Tree lab: `computeBoundingSphere` TypeError when a cloned or merged geometry has no bounding sphere. Fixed by computing the sphere in `add()` when missing.

## Tree lab (`src/dev/treeCompare`, isolated clone)
- `labNatureTrees.ts` clones `src/streets/natureTrees.ts`. `labLoader.ts` clones `loadNatureAssets` from `useNatureTrees` without the React hook. `labLeaves.ts` wraps the city `LeafSystem` (`environment/leaves.ts`), so the lab runs the same leaf code.
- Shared modules the lab does not clone (`environment/trees.ts`, `environment/forest.ts`, `environment/leafVariety.ts`, `environment/wind.ts`, `shaders/wetSurface.ts`, `weather/*`) are imported. Edits there reach the city too.
- Decision: the lab stays a clone, not an import of city tree code, so city edits cannot break the lab page silently. Lab clones stay separate from the city until the user approves a merge.
- Not in the bundle (dev-only). `tree-compare.html` is a dev-server entry only; `vite.config.ts` has no multi-page input.

## Browser verification (run before any new work)
1. `list_connected_browsers` (Claude in Chrome). It must show one connected, local browser. If it is empty, stop and ask the user to connect Chrome. Do not fall back silently.
2. `tabs_context_mcp` with `createIfEmpty: true`, then navigate the tab to `http://localhost:5173/` (dev server must be running).
3. Wait about 6 s, then read console errors (`read_console_messages`, `onlyErrors: true`) and check `canvases >= 1` and WebGL available (`javascript_tool`).
4. Take a screenshot (`computer` screenshot, `save_to_disk: true`) and look at it. This is the only place a frame can be seen.
5. Close the tab when done unless the user wants it kept.

Last smoke test: passed on 2026-10-29 (page title MyWorld3D, one canvas, WebGL on, no console errors, Settings panel and town visible). The built-in pane in the app cannot paint frames: do not use it for visual checks.

## Process knowledge
- Run in this order before reporting: `npx tsc --noEmit`, `npx vitest run`, `npx vite build`. Print only failures and summaries.
- Commits only on the user's word, in English, with the attribution line from the current system reminder.

## Open items
- Real-window visual QA of the tree lab, autumn leaves and winter trees (scene graph and shader checks only so far).
- Rerun the pedestrian flake solo on every full vitest run. Consider a looser threshold or a fixed-time harness if it keeps failing.
- Round 6.5 optional backlog (tram, canal and boats, seasonal events).

## How to verify
`npx tsc --noEmit`, `npx vitest run` (rerun the pedestrian flake solo), `npx vite build`. Budget numbers: `tests/budget.test.ts`. Visual claims: connected Chrome only, and say what was not seen by eye.
