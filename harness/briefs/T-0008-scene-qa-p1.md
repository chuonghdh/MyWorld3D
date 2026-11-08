# Brief: T-0008-agent-working-room, phase 1, Scene & QA

- **Task id:** T-0008-agent-working-room
- **Owner:** scene-qa (Scene & QA)
- **Goal:** the toolchain and guards know the agent-room module before its code grows. See `docs/adr/0013-agent-room-module.md`.
- **Files in scope:**
  - `vite.config.ts`: build.rollupOptions.input with index.html, `tree-compare.html` and agent-room.html. No other change.
  - `tests/layers.test.ts`: new block. src/agentRoom imports only src/agentRoom, src/config and packages; src/agentRoom/model and src/agentRoom/engine import no react, three or @react-three (type imports included).
  - `tests/harness.test.ts`: add agentRoom to LAYOUT_DIRS; add EventSource to the network pattern; one reasoned exception allowing EventSource and fetch only under src/agentRoom/bridgeClient/ (comment cites ADR 0013). Do not weaken any other check.
  - `docs/REPO_MAP.md`: row for src/agentRoom/, owner Technical Architect.
  - `docs/agents/scene-qa.md` (handbook update at end)
- **Files out of scope:** src/**, `tests/tuningParity.test.ts`, `package.json`, `.claude/`, all other docs.
- **Reviewer:** Technical Architect
- **Claims:** the globs above, in `harness/state/claims.json` (T-0008, owner scene-qa).
- **Acceptance commands:** `npm run check`. Guards must stay green with or without src/agentRoom present.
- **Report format:** at most 8 lines: files changed (lines before/after), gate result, not verified.
