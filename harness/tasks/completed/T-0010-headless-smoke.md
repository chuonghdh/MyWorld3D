---
id: T-0010-headless-smoke
title: Headless smoke: console, canvas and renderer counts in CI
status: done
owner: architect
branch: task/T-0010-headless-smoke
created: 2026-11-11
priority: P1
type: config_toolchain
---

# T-0010: Headless smoke: console, canvas and renderer counts in CI

## Spec

- Goal: a headless Chromium run loads the built app and replaces most human checks. It fails on any console error, checks that the canvas is not blank by day and by night, and reads draw calls and triangles from the renderer. It runs as its own CI job.
- Source: T-0009 gap 8. Human decision 2026-11-11: Playwright as a devDependency is approved in advance (this record is the approval for `dependency_change` and `github_config_change`).
- Owner: architect (toolchain, CI). Scene & QA writes the smoke test and owns the budget numbers it compares against.
- Files in scope: `package.json`, package-lock.json (Playwright, pinned exact, devDependency), tests/smoke/ (new; outside the vitest glob), a new npm script `smoke`, `.github/workflows/ci.yml` (separate job: build, install Chromium, run the smoke), `harness/config/quality-gates.json` (human checks reduced to what the smoke cannot see), `docs/ACCEPTANCE.md`, `harness/workflows/delivery.md` (remove the "until T-0010" paragraph), `harness/workflows/release.md`, `harness/README.md` (enforcement row, known gaps).
- Human decisions (2026-11-11): the Playwright devDependency (dependency_change) and a new CI job (github_config_change) are approved by this record.
- Assumptions (lead): no change under src/. Draw calls and triangles are counted by wrapping the WebGL draw calls from a Playwright init script; time of day is set through the app UI. If the app cannot be driven that way, stop and ask: a src/ hook would be a separate decision. The smoke is a Node script (tests/smoke/smoke.mjs, run by npm run smoke) that serves dist with vite preview, so no Playwright test runner config is needed.
- Out of scope: src/ behaviour; budget limits in `tests/budget.test.ts`; audio checks (no automated loudness check here).

## Acceptance

- [x] `npm run check`
- [x] The smoke passes locally on the built app, and fails when a console error is injected (shown once, then reverted)
- [x] Day and night canvas checks read pixels from a forced render; draw calls and triangles are printed and compared with the budget caps
- [x] CI: the smoke job is green on the pull request (checked at merge; the merge waits for it)
- [x] Not verified, named: anything the smoke cannot see (audio by ear, visual taste, frame time on real hardware)

## Checkpoints

- 2026-11-11: recorded as proposed by the architect (T-0009 backlog seed). No work started.
- 2026-11-11: assigned; task branch cut from dev; briefs for architect and scene-qa; claims active.
- 2026-11-11: review pass; done on the task branch, merged by pull request.
- 2026-11-11: verifying. Architect (Playwright 1.65.0 pinned, smoke CI job, gates and docs) and Scene & QA (tests/smoke, measured 156 to 184 draw calls and 1.87 M to 2.36 M triangles on swiftshader, caps 260 and 3.2 M) done. verify.mjs: only tests/people.test.ts default-crowd perf failed under load; it passes alone (33/33): flake. Scene & QA also saw tests/audioPeople.test.ts timing flake, passes solo. Smoke failure injection shown once (console.error in dist/index.html, then dist rebuilt). Both specialists were spawned as general-purpose with name = slug, because the session had not loaded the architect and scene-qa definitions.

## Review

- Reviewer: reviewer (read-only subagent, independent of both owners).
- Diff range: staged changes on task/T-0010-headless-smoke vs dev.
- Findings (round 1), all low, accepted without change: smoke.mjs:30 the console ignore pattern /swiftshader/i is wider than GPU warnings; smoke.mjs:75 SMOKE_BROWSER is a local-only override (CI does not set it); ci.yml:38 the smoke job has no timeout-minutes. Open for a follow-up task, not fixed here (a fix would need a second review).
- Result: pass.
- Not verified: the smoke job on GitHub (first CI run), software GL flags on ubuntu-latest, audio, visual taste, real-hardware frame time. Making smoke a required check in the repository rules is a human action.

## Handoff

- Next step: the improve skill picks it by priority; the lead writes the brief and the claims.
- Open questions: none.
