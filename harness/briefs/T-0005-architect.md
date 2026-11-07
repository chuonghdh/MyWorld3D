# Brief: T-0005 (architect)

- **Task id:** T-0005-level5-observability-evals
- **Owner:** architect
- **Reviewer:** independent-reviewer
- **Goal:** Observability and continuous evaluation, part 1. Every `verify` run writes one run record with commit, branch, gate results and durations; `collect-evidence` summarises the latest record; a scheduled workflow runs the regression evals and uploads the run record. Done when `node harness/scripts/verify.mjs` writes a record that includes commit and branch, `collect-evidence` prints one summary line, and the workflow file parses.
- **Files in scope:** `harness/scripts/verify.mjs`, `harness/scripts/collect-evidence.mjs`, `harness/scripts/run-evals.mjs`, `harness/runs/.gitkeep`, `.gitignore` (only the rule for `harness/runs/*.json`), `.github/workflows/evals.yml`.
- **Files out of scope:** `harness/evals/**` (Scene & QA), `tests/**`, `src/**`, `.claude/**`, `harness/state/**`, `package.json`.
- **Claims:** the globs above, status active, in `harness/state/claims.json`. Release (status released) when the task is done.
- **Acceptance commands:** `node harness/scripts/verify.mjs` (writes a run file; prints failures only); `node harness/scripts/collect-evidence.mjs` (one summary line); `npx vitest run tests/harness.test.ts` (run by the lead before commit).
- **Report format:** at most 8 lines: files changed with line counts before and after; gate result per command (failures only); not verified (human checks not done, and why).
