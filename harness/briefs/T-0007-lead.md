# Brief: T-0007 (lead)

- **Task id:** T-0007-remove-agent-office
- **Owner:** lead
- **Reviewer:** none (lead; user-directed change, not independently reviewed)
- **Goal:** Remove the Agent Office dashboard and the board mechanism (board.json, board scripts, board hooks in .claude/settings.local.json, dashboard/ folder, dashboard rules in docs and memory). Add the Weather icons in the Settings panel (src/ui/WeatherIcons.tsx, Segmented icon and grid options). Commit and open a PR dev -> master.
- **Files in scope:** every file listed in the T-0007-remove-agent-office claim in harness/state/claims.json.
- **Files out of scope:** all other source, tests and config.
- **Claims:** the globs listed in the T-0007-remove-agent-office claim, status active, in `harness/state/claims.json`. Release (status released) after the PR is merged.
- **Acceptance commands:** `npm run check` (exit 0); `node harness/scripts/check-claims.mjs` (exit 0); `node harness/scripts/drift-check.mjs` (known drift only: 8 dead-doc-links in archived briefs T-0003, T-0004, T-0006 and level4-pre-T0003 that name the removed board files; those records are kept as history).
- **Report format:** PR link, files changed, check result, not verified (manual test by user done before commit; GitHub CI not yet run).
