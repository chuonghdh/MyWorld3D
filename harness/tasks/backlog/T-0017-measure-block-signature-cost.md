---
id: T-0017-measure-block-signature-cost
title: Measure the per-block signature stringify, fix only if it costs
status: proposed
owner: scene-qa
branch: dev
created: 2026-11-11
priority: P3
type: refactor
---

# T-0017: Measure the per-block signature stringify, fix only if it costs

## Spec

- Goal: `src/scene/useTownPieces.ts:51` builds each block signature with JSON.stringify over lots and house overrides on every memo run. Measure it with performance.now() on the default city and on the largest block merge. Replace it with a cheaper key only if the cost is above 1 ms per rebuild; otherwise close the finding with the numbers.
- Source: architect finding 8 (`docs/agents/architect.md`), `docs/agents/README.md` open item 5. Unmeasured since 2026-11-01.
- Files in scope: `src/scene/useTownPieces.ts`, a test for the key if it changes, `docs/agents/scene-qa.md`, `docs/agents/architect.md` (finding status).
- Out of scope: the piece cache design, block merge behaviour.

## Acceptance

- [ ] `npm run check`
- [ ] The measured numbers are written in the Scene & QA handbook
- [ ] If the key changes: same blocks give the same key, a changed lot gives a new key (test)
- [ ] Human check: none

## Checkpoints

- 2026-11-11: recorded as proposed by the architect (T-0009 backlog seed). No work started.

## Handoff

- Next step: the improve skill picks it by priority; the lead writes the brief and the claims.
- Open questions: none.
