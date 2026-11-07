# Brief: T-0003 (scene-qa)

- **Task id:** T-0003-level4-closure
- **Owner:** scene-qa
- **Reviewer:** architect
- **Goal:** Update the harness guard test so it finds the moved harness files and checks the Level 4 rules (claims shape, brief fields, review section). Done when the harness guard file passes with the new paths and the new checks.
- **Files in scope:** `tests/harness.test.ts`
- **Files out of scope:** `harness/**` scripts and docs (architect owns them), `src/**`, `.claude/**`, harness/state/board.json (removed 2026-11-07)
- **Claims:** `tests/harness.test.ts`, status active, in `harness/state/claims.json`. Release (status released) when the task is done.
- **Acceptance commands:** `npx vitest run tests/harness.test.ts`; `npx tsc --noEmit`.
- **Report format:** at most 8 lines: files changed with line counts before and after; gate result per command (failures only); not verified (human checks not done, and why).

Retroactive note: this brief was written after the work. The claim existed from the start of T-0003, so the brief records it as it was.
