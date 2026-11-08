# Brief: T-0008-agent-working-room, phase 3, Architect

- **Task id:** T-0008-agent-working-room
- **Owner:** architect (Technical Architect; human exception 2026-11-08 for agent-room feature code)
- **Goal:** the room renders the labelled simulation: lead hub, 8 desks, guest area, avatars walking, desk screens glowing while the owner works, comm arcs, path trails, mission-control wall, DOM bubbles, source badge. Owners table drift test; tighter specialist name matching.
- **Files in scope:** src/agentRoom/world/**, src/agentRoom/ui/**, src/agentRoom/store.ts, src/agentRoom/runtime.ts, src/agentRoom/main.tsx, src/agentRoom/mapping/**, src/config/tuning/agentRoom.ts, `docs/TUNING.md`, `agent-room.html`, tests/agentRoom*.test.ts, `docs/agents/architect.md`, `harness/tasks/active/T-0008-agent-working-room.md`.
- **Files out of scope:** `vite.config.ts`, `tests/layers.test.ts`, `tests/harness.test.ts`, `docs/REPO_MAP.md` (Scene & QA); src outside agentRoom and the agentRoom tuning file; `package.json`; `.claude/`.
- **Reviewer:** scene-qa
- **Claims:** the globs above, in `harness/state/claims.json` (T-0008, owner architect).
- **Acceptance commands:** `npm run check` (timing flakes rerun solo); check-claims 0 unclaimed. Perf: under 150 draw calls, under 120k triangles (renderer.info). Human: look in connected Chrome (built-in pane cannot paint frames).
- **Report format:** at most 8 lines: files changed (lines before/after), gate result, not verified.
