# Brief: T-0010 (scene-qa)

- **Task id:** T-0010-headless-smoke
- **Owner:** scene-qa
- **Reviewer:** reviewer (read-only subagent, different from the owner)
- **Goal:** `npm run smoke` runs a headless Chromium against the built app (dist, served by `vite preview`) and fails on any console error or page error, on a blank canvas by day or by night, and on draw calls or triangles above the caps. It prints one summary line with the numbers.
- **Files in scope:** tests/smoke/** (new; the main file is smoke.mjs; each file under 350 lines), docs/agents/scene-qa.md.
- **Files out of scope:** src/ (no hook, no behaviour change), package.json, package-lock.json and CI (architect), tests outside tests/smoke/, the caps in tests/budget.test.ts (read them, do not edit).
- **Claims:** scene-qa entry for T-0010-headless-smoke in harness/state/claims.json (already active).
- **Acceptance commands:** `npx tsc --noEmit`; `npm run lint`; `npx vitest run` (full); `npx vite build`; `npm run smoke` passes. Show once that an injected console error makes the smoke fail, then revert the injection (it must not stay in any file).
- **Report format:** at most 10 lines: files changed (lines), gate result (failures only), measured numbers, not verified.

## Human decisions (2026-11-11)

The task record (Spec) approves Playwright as a devDependency and a CI job; the architect installs it (poll for `node_modules/playwright`; write the script meanwhile). No commit, push or PR.

## Design (decided by the lead; change only with a reason in your report)

- No src/ change. Count draw calls and triangles with a Playwright `page.addInitScript` that wraps the WebGL1 and WebGL2 draw methods (drawArrays, drawElements, drawArraysInstanced, drawElementsInstanced, drawRangeElements) and tallies calls and triangles per frame (triangles from mode and count; instanced calls multiply by the instance count). Report the maximum or median over a few frames, whichever is stable.
- Headless WebGL: launch Chromium with software GL flags that work in CI (for example `--use-angle=swiftshader --enable-unsafe-swiftshader`; check what works on this Windows machine and on ubuntu-latest).
- Day and night: set the time of day through the app UI (the time control; find it in src/ui/). Night, then day. Canvas not blank: take a page screenshot or read pixels, check the image is not a single flat colour (enough distinct values or a minimum luminance spread), and that the day frame is brighter than the night frame.
- Caps: compare with the caps in tests/budget.test.ts, scaled where the live scene has moving actors the static estimate excludes; write the numbers and the reason in the script header. Thresholds sit a little above the measured values.
- Console: fail on console.error, pageerror and failed requests for app files. Ignore only what you can justify in a comment (for example a software-renderer GPU warning).
- If the app cannot be driven this way, stop and report; do not edit src/.

## Traps

- `tests/harness.test.ts` limits file size and checks paths in docs. tests/smoke/ must not be picked up by vitest (check its include glob), must pass `npm run lint` (eslint covers tests) and tsc (tsconfig includes tests; a plain .mjs is not type-checked unless allowJs).
- Visuals cannot be judged here by eye; say so under not verified.
- Append what you learned to docs/agents/scene-qa.md at the end.
