# State

What the harness keeps between sessions. Files only; chat history is not state.

- `harness/state/handoffs/`: one handoff per session that ends with work open. Name: `YYYY-MM-DD-<task-id>.md`, from `harness/state/handoffs/TEMPLATE.md`. The next session reads the newest one first (order in `harness/workflows/WORKFLOW.md`).
- `harness/runs/`: result file per `verify.mjs` run (gate status, exit codes, failure tails). Summary: `node harness/scripts/collect-evidence.mjs`.
- `harness/tasks/`: task records (`backlog`, `active`, `completed`). Validated by `node harness/scripts/validate-task.mjs`.

Git history holds the code. The records here say what was verified and what was not.

## Claims (claims.json)

`harness/state/claims.json` lists which globs each active task is changing. It is the lock for parallel work (see `harness/workflows/WORKFLOW.md`, Parallel work).

Schema (one entry per task):

- `task`: task id, for example `T-0003-example`
- `owner`: specialist name, as in `docs/agents/README.md`
- `globs`: array of glob strings, for example `src/streets/**`
- `status`: `active` or `released`
- `date`: YYYY-MM-DD when the claim was made or released

Rules: a task writes its entry before work starts (status active). It sets status to released when the task is done. Released entries stay in the file as history, or are removed in the same change. Keep the file as valid JSON.
