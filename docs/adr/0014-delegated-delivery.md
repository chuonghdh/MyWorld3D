# ADR 0014: Delegated delivery; agents land work on dev through a pull request

Status: Accepted (2026-11-11)

Supersedes the commit rule of ADR 0008 ("commit only when the user asks"). The rest of ADR 0008 stands: English messages, the attribution line, `dev` as the integration branch, `master` by pull request when stable.

## Context
Every commit, push and merge needed a per-action yes from the human (ADR 0008). Nothing could land hands-off, so one request cost many approvals and the lead had to be told each step. The harness now has what makes an unattended landing safe: the gate (`npm run check`), claims, briefs, an independent review record, CI on pull requests, and a pull request checklist check.

## Decision
- One request is enough. The lead runs `harness/workflows/delivery.md`: intake, plan, delegate, verify, review, land.
- The agent may, with no further approval: create a task branch, commit on it, push it, open a pull request to `dev`, merge it when every land condition holds, and delete that task branch.
- Human-only: a pull request or merge to `master`; a direct commit to `dev` or `master`; a force push; deleting a branch the task did not create; a dependency change; a new or changed ADR; a change under .claude/ or .github/; weakening a guard. An item is approved when the human's request, or the task record's Spec under "Human decisions", names it. The approval covers that task only.
- The lists and the land conditions are data in `harness/config/policies.json` (`autonomy`). Other documents point there.
- Specialists never commit or push. The lead lands the work. A reviewer that did not write the change reads the diff first.
- Agent definitions (.claude/agents/), skills (.claude/skills/) and .claude/settings.json are tracked in git. The rest of .claude/ stays local.
- Two mechanical layers hold the git rules, enforced once the human applies them to .claude/settings.json (an agent may not edit its own settings): a PreToolUse hook on Bash that runs `harness/scripts/guard-git.mjs`, and a permission allow list for the pipeline's commands with a deny list for destructive git commands. Until then the rules are held by this policy and the workflow only.
- No schedule. The loop runs on demand (the deliver and improve skills).

## Consequences
- History on `dev` is one squash commit per task, each with a pull request, a task record and a review record.
- A wrong merge to `dev` is possible without a human look. Limits: the land conditions, CI, and `master` staying human-only. The human reviews at release (`harness/workflows/release.md`).
- Visual, audio and perf checks are not automated yet. Until the headless smoke task (T-0010) lands they are listed as not verified in the pull request; they block the release to `master`, not the merge to `dev`.
- The permission lists match command prefixes and cannot read a pull request's base. The guard hook does: it blocks a commit on `dev` or `master`, a push that is not a plain task branch, a pull request without `--base dev`, and a merge of a pull request whose base is not `dev`. It does not parse commands hidden in `bash -c`, eval or scripts, and `master` has no GitHub branch protection (a human action).
- The record is done in the landing commit, so `dev` sees done only at the merge. A task branch that cannot go green is corrected back to blocked before anything merges.
- Tracked hooks and settings reach CI and cloud sessions. A change to them is a reviewed change (CODEOWNERS covers .claude/).
- Guarded by `tests/delivery.test.ts`.
