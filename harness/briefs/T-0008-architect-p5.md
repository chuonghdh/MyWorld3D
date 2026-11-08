# Brief: T-0008-agent-working-room, phase 5 (live), Architect

- **Task id:** T-0008-agent-working-room
- **Owner:** architect (Technical Architect; human exception 2026-11-08 for agent-room feature code)
- **Goal:** the room shows real Claude Code work live. Hooks for the 7 events run tools/agent-bridge/hook.mjs, which redacts (tool names and file paths only) and POSTs to a local bridge (server.mjs, 127.0.0.1, SSE with Last-Event-ID resume, also serves the replay file). The room connects with EventSource, shows Live with a connection pill, and falls back to Replay, then Simulation.
- **Files in scope:** tools/agent-bridge/** (server.mjs, hook.mjs, lib.mjs, lib.d.mts, fixture.jsonl), src/agentRoom/bridgeClient/**, src/agentRoom/runtime.ts, src/agentRoom/main.tsx, src/agentRoom/mapping/hook.ts, tests/agentRoomBridge.test.ts, `package.json` (script "bridge" only), .claude/settings.local.json (hooks only; human approved local settings), `docs/agents/architect.md`, `harness/tasks/active/T-0008-agent-working-room.md`.
- **Files out of scope:** `.claude/settings.json` (shared); any new npm dependency; Scene & QA files.
- **Reviewer:** scene-qa
- **Claims:** the globs above, in `harness/state/claims.json` (T-0008, owner architect).
- **Acceptance commands:** `npm run check` (timing flakes rerun solo); check-claims 0 unclaimed; end to end: `npm run bridge`, pipe tools/agent-bridge/fixture.jsonl through hook.mjs, room shows Live and the events.
- **Report format:** at most 8 lines: files changed, gate result, how to run, not verified.
