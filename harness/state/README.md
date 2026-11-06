# State

What the harness keeps between sessions. Files only; chat history is not state.

- `harness/state/handoffs/`: one handoff per session that ends with work open. Name: `YYYY-MM-DD-<task-id>.md`, from `harness/state/handoffs/TEMPLATE.md`. The next session reads the newest one first (order in `harness/workflows/WORKFLOW.md`).
- `harness/runs/`: result file per `verify.mjs` run (gate status, exit codes, failure tails). Summary: `node harness/scripts/collect-evidence.mjs`.
- `harness/tasks/`: task records (`backlog`, `active`, `completed`). Validated by `node harness/scripts/validate-task.mjs`.

Git history holds the code. The records here say what was verified and what was not.
