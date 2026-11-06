# Release (merge to master)

Source: `harness/workflows/WORKFLOW.md`. Gates: `harness/config/quality-gates.json`. Approvals: `harness/config/policies.json`.

1. Confirm the task records in `harness/tasks/` are done or blocked with a reason. No record is in_progress without a plan.
2. Run `node harness/scripts/verify.mjs`. Gate must be green on `dev` at the commit to release.
3. Run `node harness/scripts/collect-evidence.mjs` and record the one-line result in the release task record.
4. Human checks from `harness/config/quality-gates.json` that apply to the release. Record any not done as not verified.
5. CI on GitHub (`.github/workflows/ci.yml`) must pass after push. Until it has run, record "CI not verified".
6. Stop and ask the human before: commit, push, merge to dev, opening or merging a pull request to master, branch delete. Each is a separate approval.
