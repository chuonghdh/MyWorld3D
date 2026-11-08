# MyWorld3D
Stack: Vite, TS, Three.js, R3F, zustand, vitest.

## Context (Read First)
- Harness (how rules are enforced, guards, ratchets): `harness/README.md`
- Map: `docs/REPO_MAP.md`
- Agents: `docs/agents/README.md` -> specialist handbook
- Audio: `docs/AUDIO.md`
- Tuning index: `docs/TUNING.md`
- Workflow (task states, checkpoints, handoff, approval gates): `harness/workflows/WORKFLOW.md`

## Rules
- Chat: VI. Code/Docs/Commits: EN.
- Commit ONLY on user prompt. Append system attribution.
- Fix root causes. No coplanar geometry. Keep visuals/perf high.
- Delegate to specialists via message (no respawn).
- Dependencies: feature modules never import `scene` or `ui`; `core` imports no feature module. Guarded by `tests/layers.test.ts` and `tests/harness.test.ts`. `film` is not yet in the guard (see architect review 2026-11-08).
- Layout is deterministic: no `Math.random` in layout code (guarded for core, store, city, streets, buildings, traffic, life, environment, agentRoom). Seeds only. Visual motion uses sim time, never the wall clock.
- Files in `src/` over 350 lines fail `tests/harness.test.ts`. `OVERSIZED` must stay empty. Tests are not covered. Split by responsibility.
- Tunable values live ONLY in `src/config/tuning/` (`index.ts` plus per-section files). Feature code imports them. No new knob literals in feature code.
- Knob = a value a designer may change (density, share, count, distance, level, time window, threshold). Geometry, shader and algorithm constants stay local.
- No duplicate values. Lab copies live only in `src/dev/treeCompare/labTuning.ts`.
- Every new knob: an entry in `tests/tuningParity.test.ts` or a per-section parity file (e.g. `tests/agentRoomTuning.test.ts`; guarded), a row in `docs/TUNING.md` and a doc line in config (both by review, not guarded).
- Never weaken a guard test to pass. Fix the code, or record a reasoned exception in the guard file.

## QA & Terminal
- CMD: `npm run check` (= `tsc --noEmit`, `npm run lint`, `vitest run`, `vite build`; rerun pedestrian flake solo). Edit hook runs tsc on `src/`/`tests/` `.ts` edits (`.claude/settings.json`).
- TERMINAL RULE: Suppress success logs. Print ONLY failures/summaries to save tokens.
- Visuals: Built-in pane lacks frame painting. Use connected Chrome or report blind spots.

## Gotchas
- Vite 5173 'no export' error -> restart server.
- No shell redirect truncation during HMR.
- GLSL: `patch` is reserved.

## Output (CAVEMAN)
- ZERO fluff/pleasantries. No "Sure", "Here is...", "I've updated...", or "Let me know".
- NO apologies. If error, just fix.
- Extreme terseness. Drop articles (a/an/the) and conversational fillers.
- Code tasks: Return ONLY code blocks/diffs. NO surrounding explanations unless explicitly asked.
- Talk like a robot: strict, direct, token-efficient.
