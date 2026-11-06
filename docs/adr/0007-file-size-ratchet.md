# ADR 0007: 350-line file limit enforced as a ratchet

Status: Accepted (2026-11-01)

## Context
Large files are hard for agents to edit safely and drift into mixed responsibilities. Some existing files are already over the limit.

## Decision
- Any `.ts` or `.tsx` file over 350 lines fails the guard in `tests/harness.test.ts`.
- Existing oversized files are listed in `OVERSIZED` with their current count. A listed file may not grow. A file at 350 lines or fewer must have its entry deleted.
- Shrink by splitting by responsibility, with no behaviour change. Do not raise a number.

## Consequences
- Splitting is part of a feature task when the file is touched.
- The ratchet covers `.ts` and `.tsx` only. CSS (`src/ui/panels.css`) is not guarded (see `docs/HARNESS.md`).
