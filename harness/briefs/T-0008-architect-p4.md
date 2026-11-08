# Brief: T-0008-agent-working-room, phase 4, Architect

- **Task id:** T-0008-agent-working-room
- **Owner:** architect (Technical Architect; human exception 2026-11-08 for agent-room feature code)
- **Goal:** the room can replay real harness history offline. tools/agent-bridge/replay.mjs reads claims, task records (active and completed), briefs and the last 50 commits into a raw JSON file; the room turns it into RoomEvents and plays it under a Replay badge. Falls back to the labelled simulation when no replay file exists.
- **Files in scope:** tools/agent-bridge/replay.mjs, src/agentRoom/replay/**, src/agentRoom/bridgeClient/**, src/agentRoom/runtime.ts, src/agentRoom/main.tsx, src/config/tuning/agentRoom.ts, `docs/TUNING.md`, tests/agentRoom*.test.ts, `docs/agents/architect.md`, `harness/tasks/active/T-0008-agent-working-room.md`.
- **Files out of scope:** Phase 3 visual files (src/agentRoom/world/**, src/agentRoom/ui/**) unless the human reports issues; Scene & QA files; `package.json`; `.claude/`.
- **Reviewer:** scene-qa
- **Claims:** the globs above, in `harness/state/claims.json` (T-0008, owner architect).
- **Acceptance commands:** `npm run check` (timing flakes rerun solo); check-claims 0 unclaimed; `node tools/agent-bridge/replay.mjs` writes the replay file.
- **Report format:** at most 8 lines: files changed (lines before/after), gate result, not verified.
