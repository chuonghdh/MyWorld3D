# Brief: T-0007 (lead)

- **Task id:** T-0007-remove-agent-office
- **Owner:** lead
- **Reviewer:** independent-reviewer (read-only subagent, different from the owner)
- **Goal:** Remove the Agent Office dashboard and the board mechanism (board.json, board scripts, board hooks in .claude/settings.local.json, dashboard/ folder, dashboard rules in docs and memory). Add the Weather icons in the Settings panel (src/ui/WeatherIcons.tsx, Segmented icon and grid options). Commit and open a PR dev -> master.
- **Files in scope:** every file listed in the T-0007-remove-agent-office claim in harness/state/claims.json.
- **Files out of scope:** all other source, tests and config.
- **Claims:** the globs listed in the T-0007-remove-agent-office claim, status active, in `harness/state/claims.json`. Release (status released) in the same commit as the task record, once the review passes.
- **Acceptance commands:** `npm run check` (exit 0); `node harness/scripts/check-claims.mjs` (exit 0); `node harness/scripts/drift-check.mjs` (exit 0).
- **Report format:** PR link, files changed, check result, not verified (manual test by user done before commit; GitHub CI not yet run).
