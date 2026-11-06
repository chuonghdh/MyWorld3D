# ADR 0011: Feedback loop is a hook, npm run check, and CI

Status: Accepted (2026-11-06)

## Context
The project rule is "run the checks after every change, print only failures". Before 2026-11-06 the only hook was an echo, and the checks were manual.

## Decision
- PostToolUse hook on `Edit|Write` in `.claude/settings.json`: runs `npx tsc --noEmit` for `.ts`/`.tsx` under `src/` or `tests/`. Silent on success, exit 2 with errors on failure.
- `npm run check` = `tsc --noEmit && vitest run && vite build`.
- CI (`.github/workflows/ci.yml`): `npm ci` then `npm run check` on Node 20.
- Vitest is not in the hook because the full suite is too slow to run per edit. Measured: `tsc --noEmit` about 8.4 s.

## Consequences
- The hook runs under Git Bash on Windows. Its command contains no backslashes; Windows paths are normalised in JavaScript.
- CI has not run yet; treat the first run as unverified.
