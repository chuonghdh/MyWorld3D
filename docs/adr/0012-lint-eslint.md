# ADR 0012: ESLint with typescript-eslint and react-hooks; only passing rules are errors

Status: Accepted (2026-11-06)

## Context
TypeScript catches types but not `any` use, hook misuse or stale dependency arrays. The repo's standard says no `any`, and the code relies on React hook rules. Some existing code has lint violations, so turning on every recommended rule at once would block all work.

## Decision
- Tools added as devDependencies (2026-11-06): `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `@eslint/js`, `globals`. Flat config in `eslint.config.js`, scope `src` and `tests`.
- `npm run lint` = `eslint src tests --max-warnings 0`. It runs in `npm run check` after `tsc --noEmit`.
- Errors: `@typescript-eslint/no-explicit-any` (0 violations), `react-hooks/rules-of-hooks` (0), `react-hooks/exhaustive-deps` (3).
- Recommended rules with existing violations are off in the config, each with its count. A rule is turned on when its count reaches zero, in the change that fixes the last violation.

## Consequences
- `npm run check` fails until the owners fix the listed violations. Counts and owners are in `docs/CODING_STANDARDS.md`.
- Unused `eslint-disable` directives are reported as problems, so a directive is removed when its rule is fixed.
- Adding a rule means: count it on the current tree, set it to error only at zero, and record the count here or in `docs/CODING_STANDARDS.md`.
