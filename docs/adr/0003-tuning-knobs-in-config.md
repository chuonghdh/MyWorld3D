# ADR 0003: Designer knobs live only in src/config/tuning/

Status: Accepted (2026-11-01, path updated 2026-11-06)

## Context
Tunable values were scattered as literals in feature code. Duplicates drifted apart, and designers could not find the knobs.

## Decision
- A knob is a value a designer may change (density, share, count, distance, level, time window, threshold). Geometry, shader and algorithm constants stay local.
- Knobs live only in `src/config/tuning/` (`index.ts` plus one file per section). Feature code imports them.
- No duplicate values. Lab copies live only in `src/dev/treeCompare/labTuning.ts`.
- Each new knob gets one doc line in config, an entry in `tests/tuningParity.test.ts`, and a row in `docs/TUNING.md`.

## Consequences
- `tests/tuningParity.test.ts` fails on a missing or duplicated knob.
- Some rows in `docs/TUNING.md` still point at code and are not yet tunable.
