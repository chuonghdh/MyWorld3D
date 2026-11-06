# ADR 0004: Layout is deterministic; no Math.random in layout code

Status: Accepted (2026-11-01)

## Context
Same seed and settings must give the same town, so saves, screenshots and tests reproduce. Hashes in tests are the contract.

## Decision
- Anything generated from `settings` plus `layout.seed` is a pure function. Use the seeded RNG in `src/core/rng.ts`.
- No `Math.random` and no wall-clock time in layout code. Guarded by `tests/harness.test.ts` for core, store, city, streets, buildings, traffic, life and environment.
- Visual motion uses simulation time (architect handbook, 2026-11-06).
- Layout caches are keyed by `layoutKey` (`src/city/layoutKey.ts`).

## Consequences
- `Math.random` is still used outside the guarded folders (audio, film, UI, and scene hooks such as `src/scene/useTownFrame.ts`). Those files must not feed layout. This is not guarded for scene and UI files.
- New layout code needs a seed parameter and a hash test.
