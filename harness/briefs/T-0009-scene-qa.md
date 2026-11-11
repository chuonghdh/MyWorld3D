# Brief: T-0009 (scene-qa)

- **Task id:** T-0009-delegated-delivery
- **Owner:** scene-qa
- **Reviewer:** reviewer (read-only subagent, different from the owner)
- **Goal:** Guard the delegated delivery pipeline so it cannot drift: a new test file checks the contract in harness/briefs/T-0009-architect.md (items C1 to C10). The architect builds those files in parallel; write the guards from the contract, then run the full gate when the lead says the architect is finished.
- **Files in scope:** `tests/delivery.test.ts` (new), `harness/evals/regression/cases.json` (one new case for it), `docs/agents/scene-qa.md` (update section).
- **Files out of scope:** `tests/harness.test.ts` and every other test, src/, everything in the architect's claim. A contract item that cannot be guarded as written is reported, not changed.
- **Claims:** scene-qa entry for T-0009-delegated-delivery in harness/state/claims.json (already active).
- **Acceptance commands:** phase 1: `npx tsc --noEmit`, `npm run lint`. Phase 2 (after the architect finishes): `npm run check`, `node harness/scripts/validate-task.mjs`, `node harness/scripts/check-claims.mjs`, `node harness/scripts/drift-check.mjs`, `node harness/scripts/run-evals.mjs`.
- **Report format:** at most 8 lines: files changed, gate result (failures only), contract items not guarded and why, not verified.

## Guards to write (tests/delivery.test.ts)

Same style as `tests/harness.test.ts` (import.meta.glob with `?raw`, problems array, `expect(problems).toEqual([])`). Glob dot folders by explicit path, as the settings.json guard does.

1. Agent definitions (C1): every handbook slug linked from the ownership table in `docs/agents/README.md`, plus reviewer, has .claude/agents/SLUG.md; front matter `name` equals the slug and `description` is not empty; each specialist body names its handbook path; reviewer has a `tools` line without Edit or Write.
2. Skills (C2): deliver and improve SKILL.md exist, have `name` and `description`, and name the delivery workflow file.
3. Delivery workflow (C3): the file has the eight sections Intake, Plan, Delegate, Verify, Review, Land, Escalate, Improve.
4. Policy (C4): `harness/config/policies.json` has `autonomy` with the six agentMay ids and the nine humanOnly ids from the contract, a non-empty landConditions list, and `adr` naming an ADR file that exists.
5. Permissions (C5): .claude/settings.json has a non-empty `permissions.allow`; `permissions.deny` covers force push, push to master, reset --hard and stash; no allow rule permits a push to master or a force push.
6. Backlog (C6): every record in harness/tasks/backlog/ has the base front matter, status proposed, `priority` in P1 to P3, `type` in the five change types, and the four sections. Zero records is valid.
7. Git ignore (C10): `.gitignore` does not ignore .claude/agents/, .claude/skills/ or .claude/settings.json, and still ignores settings.local.json.
8. Failure feedback (C9): drift.yml and evals.yml each contain `issues: write` and an issue-create step.

Guards 1, 2 and 5 must not be skipped when files are missing: after this task `.claude/` is tracked, so absence is a failure.
