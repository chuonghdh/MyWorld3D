---
id: T-0011-seed-leaf-drop-random
title: Leaf drop position: seed it or record the exception
status: proposed
owner: scene-qa
branch: dev
created: 2026-11-11
priority: P2
type: refactor
---

# T-0011: Leaf drop position: seed it or record the exception

## Spec

- Goal: `src/scene/useTownFrame.ts:115` and line 116 call Math.random for the leaf devil position. The determinism rule (CLAUDE.md) says seeds only; the guard list does not cover src/scene. Either draw the position from a seeded generator advanced per request, or record a reasoned exception next to the guard.
- Source: `docs/agents/README.md`, open item 1 (2026-11-09). Checked 2026-11-11: the scene call is still there; `src/ui/HousePanel.tsx` no longer calls Math.random (closed, no record).
- Files in scope: `src/scene/useTownFrame.ts`; `tests/harness.test.ts` only to add scene to the determinism list or to record the exception (Scene & QA owns it); `docs/agents/scene-qa.md`.
- Out of scope: leaf visuals and counts; `src/environment/**`.

## Acceptance

- [ ] `npm run check`
- [ ] No Math.random call in src/scene, or the exception is written in the guard file with its reason
- [ ] Human check: the leaf drop button still drops leaves at varied places. Mark as not verified if not done.

## Checkpoints

- 2026-11-11: recorded as proposed by the architect (T-0009 backlog seed). No work started.

## Handoff

- Next step: the improve skill picks it by priority; the lead writes the brief and the claims.
- Open questions: none.
