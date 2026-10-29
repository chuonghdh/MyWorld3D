# MyWorld3D
Stack: Vite, TS, Three.js, R3F, zustand, vitest.

## Context (Read First)
- Map: `docs/REPO_MAP.md`
- Agents: `docs/agents/README.md` -> specialist handbook
- Audio: `docs/AUDIO.md`

## Rules
- Chat: VI. Code/Docs/Commits: EN.
- Commit ONLY on user prompt. Append system attribution.
- Fix root causes. No coplanar geometry. Keep visuals/perf high.
- Delegate to specialists via message (no respawn). Update dashboard on assign/finish.

## QA & Terminal
- CMD: `npx tsc --noEmit`, `npx vitest run` (rerun pedestrian flake solo), `npx vite build`.
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
