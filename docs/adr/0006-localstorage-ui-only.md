# ADR 0006: localStorage only for per-viewer UI state

Status: Accepted (2026-11-01)

## Context
Persistent state must be explicit and reproducible. Hidden storage makes bugs hard to reproduce. JSON save files are the only persisted world state (architect handbook, asset pipelines).

## Decision
`localStorage` is allowed only for per-viewer UI conveniences (for example a collapsed section or a sound mixer level). The allowed files are listed in `tests/harness.test.ts` (`LOCAL_STORAGE_ALLOWED`): `src/ui/SoundMixer.tsx` and `src/ui/sectionState.ts`.

## Consequences
- Adding a file that uses `localStorage` fails the guard. Add it to the list only with a reason in the handbook.
- Save data goes through `src/store/io.ts` with validation and defaults.
