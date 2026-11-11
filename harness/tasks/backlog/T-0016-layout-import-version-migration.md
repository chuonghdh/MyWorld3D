---
id: T-0016-layout-import-version-migration
title: Layout import accepts older versions through a migration step
status: proposed
owner: ui-camera
branch: dev
created: 2026-11-11
priority: P3
type: feature
---

# T-0016: Layout import accepts older versions through a migration step

## Spec

- Goal: `src/store/io.ts:208` rejects any layout file whose version is not exactly LAYOUT_VERSION (now 1). Add a migration table (version to version) so a future version bump does not orphan saved layouts; unknown or newer versions still fail with a clear error.
- Source: architect finding 7 (`docs/agents/architect.md`), `docs/agents/README.md` open item 5. Low priority: only one version exists today.
- Files in scope: `src/store/io.ts` (split if it nears 350 lines), its tests, `docs/agents/ui-camera.md`.
- Out of scope: the layout format itself, a version bump.

## Acceptance

- [ ] `npm run check`
- [ ] Tests: a version 1 file imports unchanged; a newer version fails with the error text; the migration table is exercised by a synthetic older version
- [ ] Human check: none

## Checkpoints

- 2026-11-11: recorded as proposed by the architect (T-0009 backlog seed). No work started.

## Handoff

- Next step: the improve skill picks it by priority; the lead writes the brief and the claims.
- Open questions: none.
