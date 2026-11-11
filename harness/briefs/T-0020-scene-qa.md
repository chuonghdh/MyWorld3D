# Brief: T-0020 (scene-qa)

- **Task id:** T-0020-ped-closeup-baseline
- **Owner:** scene-qa
- **Reviewer:** reviewer (read-only subagent)
- **Goal:** `npm run smoke` can also save close-up PNGs of walkers and prints a baseline of people cost; a baseline table is recorded in the Graphics & Character handbook. No src/ change. See the task record.
- **Files in scope:** `tests/smoke/**` (new helper files allowed, keep each under 350 lines), `package.json` (a script such as `smoke:closeup` only; no dependency), `docs/agents/graphics-character.md` (baseline table), `docs/agents/scene-qa.md` (update section), `harness/briefs/T-0020-scene-qa.md`.
- **Files out of scope:** `src/**`, `tests/*.test.ts`, `.github/`, other handbooks, dependencies.
- **Claims:** scene-qa entry for T-0020 in harness/state/claims.json (active). Note: the task record says "docs/agents/traffic-life.md" for the baseline table; the people handbook is now `docs/agents/graphics-character.md`, use that.
- **Acceptance commands:** `npx tsc --noEmit`; `npm run lint`; `npx vitest run tests/harness.test.ts tests/delivery.test.ts`; `npx vite build` then `npm run smoke` (and the new closeup script). Failures only.
- **Report format:** at most 10 lines: files changed, gate result (failures only), baseline numbers, not verified.

## Steps

1. Find a no-src-hook way to place the camera near a walker: the R3F root (`window.__r3f.get()` per docs/agents/README.md), the camera store in `src/store/`, or the UI camera presets. Walkers are simulated, so find one by reading the pedestrian render list is NOT possible without a hook; instead pick the instance matrices of the `pedestrians-adult` etc. meshes from the scene graph (`scene.getObjectByName('pedestrians-adult')`, `.instanceMatrix`, `.count`) in `page.evaluate`, and aim the camera at instance 0 of each age group at distances 3 m, 8 m, 25 m. Same for `dogs`. Day (12:00) and night (00:00) via `#light`; rain only if a UI control exists.
2. Save PNGs to `harness/runs/closeup/` (check it is git-ignored; if not, use the OS temp dir and print the path). Read pixels the way `tests/smoke/pixels.mjs` does (software GL cannot `page.screenshot`).
3. Baseline: per age group, triangles per person (geometry index/position count), instance counts per mesh, draw calls and triangles per frame (reuse `counters.mjs`), and the share of the frame triangles that belong to people (sum over people meshes of triangles x instances x passes if you can tell passes; else state the assumption).
4. Write the baseline table into `docs/agents/graphics-character.md` as a dated section, and an update section in `docs/agents/scene-qa.md` (3 to 6 lines, traps: swiftshader speed, how the camera was placed).
5. Keep the existing `npm run smoke` behaviour and runtime unchanged (the closeup is a separate script).

## Traps

- Docs path guard: backtick a path only when the file exists at the end.
- Software GL draws a frame in 5 to 10 s; wait by frame count.
- `SMOKE_BROWSER` env var may be needed locally (see scene-qa handbook).
