---
id: T-0007-remove-agent-office
title: Remove Agent Office dashboard; add weather icons to Settings
status: done
owner: lead
branch: dev
created: 2026-11-07
---

# T-0007: Remove Agent Office dashboard; add weather icons to Settings

## Spec

- Goal: the Agent Office dashboard and the board mechanism are gone; the Settings weather picker shows a small icon before each label in a 3x2 grid.
- Files in scope: the T-0007-remove-agent-office claim in `harness/state/claims.json` (the brief is `harness/briefs/T-0007-lead.md`).
- Out of scope: other source, tests and config.

## Acceptance

- [x] `npm run check` (tsc, lint, vitest 90 files, vite build): exit 0.
- [x] `node harness/scripts/check-claims.mjs`: 0 unclaimed.
- [x] `node harness/scripts/drift-check.mjs`: exit 0.
- [x] Weather icons checked by the user on dev before the commit.
- [x] GitHub CI on the PR: merged via PR #8 (merge commit 1b2ce9e on master).

## Checkpoints

- 2026-11-07: commit 426fe6f (dashboard removal, weather icons) pushed to dev; PR #8 opened.
- 2026-11-07: commit 14b8c5b (settings.json guard skips when the gitignored file is absent) pushed to dev; PR checklist body updated.
- 2026-11-07: review round 1 (changes requested) and round 2 (pass), see Review below; fixes committed with this record.

## Review

- Reviewer: independent-reviewer (read-only subagent, not the owner)
- Diff range: 8c2bfe0..HEAD plus the working-tree fix set committed with this record
- Findings, round 1 (result: changes requested):
  - Severity high: weekly drift workflow would fail on 8 dead-doc-links in archived briefs. Fixed: removed-path tokens in `harness/briefs/*.md` are plain text with "(removed 2026-11-07)".
  - Severity medium: reviewer gate not met (brief said "Reviewer: none", no task record). Fixed: brief names independent-reviewer; this record.
  - Severity low: stale "Dashboard:" working rule in `docs/agents/README.md`. Fixed: line removed.
  - Not confirmed: memory index still lists the dashboard memory. Checked: no dashboard line in the memory index.
- Findings, round 2 (result: pass): no blocking issues. Non-blocking: awkward wording in `harness/briefs/T-0004-architect.md` (fixed); CRLF warning on the brief (cosmetic). Memory note on the removed dashboard reworded (fixed).
- Result: pass

## Handoff

- Next step: none. Merged in PR #8 (1b2ce9e). Claim released and record moved to completed/ in the follow-up commit.
- Open questions: none.
