# Brief: T-0004 (architect)

- **Task id:** T-0004-enforcement
- **Owner:** architect
- **Reviewer:** independent-reviewer
- **Goal:** Make the enforcement pieces of Level 4 real: a brief file for every claim, the board updated by hooks at the start and end of each user request, and an export of the board for the artifact. Done when check-claims lists no unclaimed file on the working tree, the hooks run, and the export matches board.json.
- **Files in scope:** `harness/briefs/**`, `harness/scripts/board-set.mjs`, `harness/scripts/board-export.mjs`, `harness/state/board-export.json`, `.claude/settings.json` (hooks only; human approval required before commit).
- **Files out of scope:** `tests/**`, `src/**`, `harness/state/claims.json` (lead edits claims), `harness/state/board.json` (changed only by board-set), any other `.claude/` file.
- **Claims:** the globs above, status active, in `harness/state/claims.json`. Release (status released) when the task is done.
- **Acceptance commands:** `node harness/scripts/check-claims.mjs` (exit 0 on a tree whose changes are all claimed); `node harness/scripts/board-set.mjs` checks (invalid value exits 1); `npx vitest run tests/harness.test.ts` (run by the lead before commit).
- **Report format:** at most 8 lines: files changed with line counts before and after; gate result per command (failures only); not verified (human checks not done, and why).

Note: the hooks change `.claude/settings.json`. WORKFLOW requires the human to approve changes to `.claude/`. The lead must surface this to the human before commit.
