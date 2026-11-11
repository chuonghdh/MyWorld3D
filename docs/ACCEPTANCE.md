# Acceptance criteria (human summary)

The machine-readable gate and acceptance rules are in `harness/config/quality-gates.json`. This page is the short human version.

One gate: `npm run check` (or `node harness/scripts/verify.mjs`). It runs tsc, lint, vitest (including the harness guards) and vite build. A change is accepted only when the gate passes and the checks for its type are done. Print only failures.

`npm run smoke` (headless Chromium, also CI job `smoke`; needs `npm run build` first) covers console errors, a non-blank canvas by day and night, and draw calls and triangles. Human checks that remain (audio by ear, visual taste, frame time on real hardware) cannot be automated here. When one is not done, report it as **not verified**. Never write "verified" for it.

| Change type | Commands | Human checks |
|---|---|---|
| Feature code | `npm run check`; rerun a flaky test alone | Audio; visual taste; frame time on real hardware |
| Refactor | `npm run check`; seeded hash or layout key before and after | One screenshot, identical |
| Docs only | `npx vitest run tests/harness.test.ts`, `node harness/scripts/validate-task.mjs` | None |
| Config and toolchain | `npm run check`; `npm run dev` starts | App loads at the dev URL with no console errors |

Rules: tuned values need their `docs/TUNING.md` row and a parity entry; a file over 350 lines fails the guard; rule changes need an ADR in `docs/adr/`; commits, pushes and merges follow `docs/adr/0014-delegated-delivery.md` (steps in `harness/workflows/delivery.md`).
