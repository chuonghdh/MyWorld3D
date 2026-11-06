# ADR 0009: Rules are enforced by guards, hooks and CI, not by prose alone

Status: Accepted (2026-11-06)

## Context
Rules that exist only in prose drift. Agents forget them between sessions.

## Decision
- Each rule that can be checked mechanically has a guard test: `tests/layers.test.ts`, `tests/harness.test.ts`, `tests/tuningParity.test.ts`, `tests/budget.test.ts`.
- An Edit/Write hook (`.claude/settings.json`) runs `tsc --noEmit` after edits to `.ts` or `.tsx` files under `src/` or `tests/`. It prints only on failure.
- `npm run check` runs `tsc --noEmit`, `vitest run` and `vite build`.
- `.github/workflows/ci.yml` runs `npm run check` on push and pull request to `dev` and `master`. It was added on 2026-11-06 and has not yet run on GitHub.
- Guards are not weakened to pass. Fix the code or record a reasoned exception in the guard file.

## Consequences
- A failing guard fails the check. Known gaps are listed in `docs/HARNESS.md`.
- Visual quality and frame time are still checked by hand in connected Chrome.
