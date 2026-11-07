# Evals

Evals are continuous checks: each case in `regression/cases.json` points at one vitest file under `tests/` that guards a
behaviour (determinism, tuning, budget, layers, harness). Run them with `node harness/scripts/run-evals.mjs`.
`test-cases/` holds scenario inputs for later evals (empty for now).
The nightly workflow runs the evals and uploads the record as a run artifact (`harness/runs/`).
Add a case only when its file exists under `tests/` and has at least one test.
