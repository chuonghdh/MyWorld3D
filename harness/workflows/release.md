# Release (merge to master)

Source: `harness/workflows/WORKFLOW.md`. Gates: `harness/config/quality-gates.json`. Approvals: `harness/config/policies.json`.

1. Confirm the task records in `harness/tasks/` are done or blocked with a reason. No record is in_progress without a plan.
2. Run `node harness/scripts/verify.mjs`. Gate must be green on `dev` at the commit to release.
3. Run `node harness/scripts/collect-evidence.mjs` and record the one-line result in the release task record.
4. Human checks from `harness/config/quality-gates.json` that apply to the release. Checks listed as not verified in the merged pull requests to `dev` are done here: they block the release. Record any still not done as not verified and stop.
5. The CI job `smoke` (headless Chromium, `npm run smoke`) must be green; it replaces the human console, blank-canvas and renderer-count checks. Audio, visual taste and real-hardware frame time stay human.
6. CI on GitHub (`.github/workflows/ci.yml`) must pass after push. Until it has run, record "CI not verified".
7. `master` is human-only (`harness/config/policies.json`, `autonomy.humanOnly`): stop and ask the human before opening or merging a pull request to `master`. Work reaches `dev` through `harness/workflows/delivery.md`.
