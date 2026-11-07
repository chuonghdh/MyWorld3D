# Brief: T-0005 (scene-qa)

- **Task id:** T-0005-level5-observability-evals
- **Owner:** scene-qa
- **Reviewer:** independent-reviewer
- **Goal:** Continuous evaluation, part 1: a list of regression evals (the existing tests that protect determinism, tuning parity and budgets), each with the file it runs, and a guard that every listed file exists and is a real test. Done when `harness/evals/regression/cases.json` lists the evals and the guard passes.
- **Files in scope:** `harness/evals/**`, `tests/harness.test.ts` (eval guards only).
- **Files out of scope:** `harness/scripts/**`, `.github/**`, `src/**`, other tests, `.claude/**`, `harness/state/**`.
- **Claims:** the globs above, status active, in `harness/state/claims.json`. Release (status released) when the task is done.
- **Acceptance commands:** `npx vitest run tests/harness.test.ts` (run by the lead before commit).
- **Report format:** at most 8 lines: files changed with line counts before and after; gate result per command (failures only); not verified (human checks not done, and why).
