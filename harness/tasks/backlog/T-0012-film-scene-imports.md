---
id: T-0012-film-scene-imports
title: Film module stops importing from scene
status: proposed
owner: ui-camera
branch: dev
created: 2026-11-11
priority: P2
type: refactor
---

# T-0012: Film module stops importing from scene

## Spec

- Goal: feature modules never import scene (CLAUDE.md). `src/film/autoPath.ts:8` imports `wholeMapFraming` from `src/scene/cameraMath.ts`; `src/film/autoRun.ts:8` imports the types FilmPath and FilmPose from `src/scene/filmPath.ts`. Move the shared pure pieces below both (for example into src/core/ or src/film/) and import them from there.
- Source: `docs/agents/README.md`, open item 2, and `harness/README.md` known gaps. User decision 2026-11-09: no guard for film. The guard stays as it is; only the code is fixed.
- Owner: UI & Camera (camera math, auto path). Scene & QA owns `src/scene/filmPath.ts` and reviews the move; one brief per owner.
- Files in scope: `src/film/autoPath.ts`, `src/film/autoRun.ts`, `src/scene/cameraMath.ts`, `src/scene/filmPath.ts`, the new shared file, their tests under tests/film/, `docs/REPO_MAP.md`, the two handbooks.
- Out of scope: film behaviour, path keyframes, `tests/harness.test.ts`.

## Acceptance

- [ ] `npm run check`
- [ ] No import from scene or ui anywhere under src/film (grep)
- [ ] Film path hashes in tests/film/ unchanged
- [ ] Human check: none (behaviour-neutral). One auto film run is not verified unless done.

## Checkpoints

- 2026-11-11: recorded as proposed by the architect (T-0009 backlog seed). No work started.

## Handoff

- Next step: the improve skill picks it by priority; the lead writes the brief and the claims.
- Open questions: none.
