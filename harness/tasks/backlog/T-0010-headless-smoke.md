---
id: T-0010-headless-smoke
title: Headless smoke: console, canvas and renderer counts in CI
status: proposed
owner: architect
branch: dev
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
- Out of scope: src/ behaviour; budget limits in `tests/budget.test.ts`; audio checks (no automated loudness check here).

## Acceptance

- [ ] `npm run check`
- [ ] The smoke passes locally on the built app, and fails when a console error is injected (shown once, then reverted)
- [ ] Day and night canvas checks read pixels from a forced render; draw calls and triangles are printed and compared with the budget caps
- [ ] CI: the smoke job is green on the pull request
- [ ] Not verified, named: anything the smoke cannot see (audio by ear, visual taste, frame time on real hardware)

## Checkpoints

- 2026-11-11: recorded as proposed by the architect (T-0009 backlog seed). No work started.

## Handoff

- Next step: the improve skill picks it by priority; the lead writes the brief and the claims.
- Open questions: none.
