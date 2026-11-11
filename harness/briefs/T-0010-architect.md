# Brief: T-0010 (architect)

- **Task id:** T-0010-headless-smoke
- **Owner:** architect
- **Reviewer:** reviewer (read-only subagent, different from the owner)
- **Goal:** Playwright is a pinned devDependency, `npm run smoke` exists, CI runs the smoke as its own job, and the docs and gates say what the smoke now covers. Scene & QA writes the smoke script in parallel; you do the toolchain around it.
- **Files in scope:** package.json, package-lock.json, .github/workflows/ci.yml, harness/config/quality-gates.json, docs/ACCEPTANCE.md, harness/workflows/delivery.md, harness/workflows/release.md, harness/README.md, docs/agents/architect.md.
- **Files out of scope:** src/, tests/ (including tests/smoke/), other .github/ files, other docs and handbooks, ADRs.
- **Claims:** architect entry for T-0010-headless-smoke in harness/state/claims.json (already active).
- **Acceptance commands:** `npx tsc --noEmit`; `npm run lint`; `npx vitest run tests/harness.test.ts tests/delivery.test.ts`; `node harness/scripts/validate-task.mjs`; `node harness/scripts/check-claims.mjs`; `node harness/scripts/drift-check.mjs`. All exit 0. Do not run the full `npm run check`; Scene & QA runs it.
- **Report format:** at most 10 lines: files changed, gate result (failures only), not verified.

## Human decisions (2026-11-11)

The task record (Spec) approves the Playwright devDependency and the new CI job. No commit, push or PR in this task.

## Steps

1. FIRST, quickly, because Scene & QA waits for it: `npm install --save-dev --save-exact playwright` (exact pin). Add the npm script `"smoke": "node tests/smoke/smoke.mjs"`. Install the browser locally: `npx playwright install chromium`. Scene & QA polls for `node_modules/playwright`; no message needed.
2. `.github/workflows/ci.yml`: add a job `smoke` next to `check` and `secrets`. Same triggers and `permissions: contents: read`. Steps: checkout, setup-node (same versions as `check`), `npm ci`, `npx playwright install --with-deps chromium`, `npm run build`, `npm run smoke`. Keep `check` and `secrets` unchanged. No tabs. Do not make the job required in the repository rules (human action; say so in the report).
3. `harness/config/quality-gates.json`: human checks drop what the smoke covers (console errors, blank canvas day and night, draw calls and triangles). Keep: audio by ear, visual taste, frame time on real hardware. Leave the verify gates list as is (the smoke needs a browser) and say so.
4. `docs/ACCEPTANCE.md`, `harness/README.md` (enforcement row, known gaps), `harness/workflows/release.md`: describe the smoke in one place each. `harness/workflows/delivery.md`: remove the "Until T-0010 ..." paragraph and replace it with one line saying the smoke runs in CI and the remaining human checks are audio, taste and real-hardware frame time. Point, do not repeat.
5. `docs/agents/architect.md`: an "Update 2026-11-11 (T-0010)" section, 3 to 6 lines.

## Traps

- `tests/harness.test.ts` and drift-check: write a backticked path only when the file exists at the end. tests/smoke/smoke.mjs will exist when Scene & QA is done; mention it in backticks only after you see it.
- `tests/delivery.test.ts` guards delivery.md and policies; run it after editing delivery.md.
- Windows host: use `node` and `npm` only; no bash-only tooling in package scripts.
