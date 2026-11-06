# Acceptance criteria

One gate: **`npm run check`** (script in `package.json`). It runs `tsc --noEmit`, `npm run lint`, `vitest run` (includes the harness
guards in `tests/harness.test.ts` and `tests/tuningParity.test.ts`) and `vite build`. A change is accepted only when
the gate passes and the checks for its type are done. Print only failures.

Human checks (visual, audio, browser) cannot be automated here. When a human check is not done, report it as
**not verified**. Never write "verified" for it.

| Change type | Commands | Human checks (report as not verified if not done) |
|---|---|---|
| Feature code (`src/**` behaviour, visuals, sound) | `npm run check`; rerun a flaky test alone (`npx vitest run <file>`) | Visual: look in the built-in browser or connected Chrome, both day and night, the touched view. Audio: listen in the touched system. Browser: console has no new errors. Perf: no new frame-time drop on the seeded city. |
| Refactor (behaviour-neutral) | `npm run check`; compare a seeded hash or layout key before and after where the tests have one | Visual: one screenshot of the same view before and after, identical. |
| Docs only (`docs/**`, `CLAUDE.md`) | `npx vitest run tests/harness.test.ts` (docs links, ADR headings, ownership) | None. Check the handbook of the owner you edited. |
| Config and toolchain (`package.json`, `vite.config.*`, `tsconfig*`, lint) | `npm run check`; `npm run dev` starts | Browser: app loads at the dev URL with no console errors. Build output opens. |

## Rules

- A change of a tuned value needs its `docs/TUNING.md` row and a `tests/tuningParity.test.ts` entry (see `docs/HARNESS.md`).
- A new file over 350 lines fails the guard; split it, do not raise the limit.
- Decisions that change a rule get a new ADR under `docs/adr/` (Status, Context, Decision, Consequences).
- Commit and push only on the user's request (`docs/adr/0008-commit-and-branch-workflow.md`).
