# Brief: Level 4 pre-T-0003 (architect), retroactive

- **Task id:** level4-pre-T0003 (recorded retroactively: edits made before claims existed)
- **Owner:** architect
- **Reviewer:** independent-reviewer
- **Goal:** Retroactive brief. This was written after the work, to record the scope of the Level 4 edits made before the claims file existed: AGENTS.md pointer, board script, state README, and the bug-fix and feature-development workflow steps. Done when the claim in `harness/state/claims.json` matches the files that were changed.
- **Files in scope:** `AGENTS.md`, `harness/scripts/board.mjs`, `harness/state/README.md`, `harness/workflows/bug-fix.md`, `harness/workflows/feature-development.md`
- **Files out of scope:** all other files, including `src/**`, `tests/**`, `.claude/**`
- **Claims:** the same globs, status active, in `harness/state/claims.json` (recorded retroactively, 2026-11-07).
- **Acceptance commands:** `npx vitest run tests/harness.test.ts`; `node harness/scripts/check-claims.mjs`.
- **Report format:** at most 8 lines: files changed with line counts; gate result per command (failures only); not verified (human checks not done, and why).
