# Brief: T-0006 (scene-qa)

- **Task id:** T-0006-level5-security-pr-drift
- **Owner:** scene-qa
- **Reviewer:** independent-reviewer
- **Goal:** Guards for part 2: the PR template has the checklist items; the drift-check script exists and its report shape is correct (it is run by the Architect); the evals workflow and the new workflows exist and parse as YAML. Done when the guards pass.
- **Files in scope:** `tests/harness.test.ts` (T-0006 guards only).
- **Files out of scope:** everything else.
- **Claims:** the globs above, status active, in `harness/state/claims.json`. Release (status released) when the task is done.
- **Acceptance commands:** `npx vitest run tests/harness.test.ts` (run by the lead before commit).
- **Report format:** at most 6 lines: files changed with line counts before and after; gate result (failures only); not verified and why.
