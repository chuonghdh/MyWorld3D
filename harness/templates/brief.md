# Brief template (delegation contract)

Every specialist brief uses this shape. The brief is written before work starts and stored in the task record under `harness/tasks/active/`. The specialist reads its handbook (`docs/agents/README.md`) first.

## Fields

- **Task id:** T-NNNN-slug (matches the task record file name)
- **Owner:** specialist name, as in `docs/agents/README.md`
- **Goal:** one or two sentences. What is true when this is done.
- **Files in scope:** glob list, for example `src/buildings/**`. Only these may change.
- **Files out of scope:** glob list and topics that must not change.
- **Reviewer:** <name, must differ from owner>
- **Claims:** the same globs as in the claims file (`harness/state/claims.json`). Claim before work, release at done or blocked.
- **Acceptance commands:** copied from `harness/config/quality-gates.json` for this change type (typecheck, lint, test, build; plus the human checks listed there).
- **Report format:** at most 8 lines, with these required fields:
  - files changed (path and line count before and after)
  - gate result (pass or fail per gate, failures only)
  - not verified (human checks not done, and why)

## Rules for the specialist

- Stay inside the claimed globs. A need outside them is a new claim or a question, not a silent edit.
- Do not commit, push, or run git reset, checkout or stash unless the brief says so and the human approved it.
- Do not weaken a guard test. Report a failing check in another owner's area; do not fix it.
