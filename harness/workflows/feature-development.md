# Feature development

Source: `harness/workflows/WORKFLOW.md`. Gates: `harness/config/quality-gates.json`. Approvals: `harness/config/policies.json`.

1. Record the task in `harness/tasks/active/` from `harness/tasks/TEMPLATE.md` (state: assigned). List files in scope.
   Write the brief from `harness/templates/brief.md` and claim the globs in `harness/state/claims.json` before work starts.
2. Read the owner handbook for the area (`docs/agents/README.md`).
3. Change the files in scope (state: in_progress). Knobs go to `src/config/tuning/`; no `Math.random` in layout code.
4. Run gates: `node harness/scripts/verify.mjs` (typecheck, lint, test, build). Print failures only.
5. Checkpoint: gate result, changed files, "uncommitted, working tree" (state: verifying).
6. Human checks from `harness/config/quality-gates.json` (visual, audio, console, perf). Record any not done as not verified.
7. Done only when the gate is green at the recorded commit (state: done). Otherwise in_progress or blocked.

Approval points: commit, push, merge, branch delete, `.claude/` changes, dependency changes, ADRs, config defaults, files outside the owner's files. Ask first; per action only.
