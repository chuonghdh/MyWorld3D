# Brief: T-0003 (architect)

- **Task id:** T-0003-level4-closure
- **Owner:** architect
- **Reviewer:** independent-reviewer
- **Goal:** Close Level 4 enforcement for the harness: check-claims script with its type declaration, WORKFLOW.md parallel-work and release rules, and the brief template reviewer line. Done when the claim check runs, tsc passes, and the WORKFLOW and brief text match the rules.
- **Files in scope:** `harness/scripts/check-claims.mjs`, `harness/scripts/check-claims.d.mts`, `harness/workflows/WORKFLOW.md`, `harness/templates/brief.md`
- **Files out of scope:** `tests/**`, `src/**`, `harness/state/claims.json` (lead edits claims), harness/state/board.json (removed 2026-11-07), `.claude/**`
- **Claims:** the globs above, status active, in `harness/state/claims.json`. Release (status released) when the task is done.
- **Acceptance commands:** `npx tsc --noEmit`; `node harness/scripts/check-claims.mjs` (exit 0 on a tree whose changes are all claimed); `npx vitest run tests/harness.test.ts` (run by the lead before commit).
- **Report format:** at most 8 lines: files changed with line counts before and after; gate result per command (failures only); not verified (human checks not done, and why).

Retroactive note: this brief was written after the work. The claims existed from the start of T-0003, so the brief records them as they were.
