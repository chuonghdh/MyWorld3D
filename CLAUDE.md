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
- Delegate to specialists via message (no respawn). Update dashboard on assign/finish.
- Dependencies: feature modules never import `scene` or `ui`; `core` imports no feature module. Guarded by `tests/layers.test.ts` and `tests/harness.test.ts`.
- Layout is deterministic: no `Math.random` in layout code (guarded). Seeds only.
- Files over 350 lines are not allowed to grow. Split by responsibility (ratchet in `tests/harness.test.ts`).
- Tunable values live ONLY in `src/config/tuning/` (`index.ts` plus per-section files). Feature code imports them. No new knob literals in feature code.
- Knob = a value a designer may change (density, share, count, distance, level, time window, threshold). Geometry, shader and algorithm constants stay local.
- No duplicate values. Lab copies live only in `src/dev/treeCompare/labTuning.ts`.
- Every new knob: one doc line in config and an entry in `tests/tuningParity.test.ts`. Index: `docs/TUNING.md`.
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
