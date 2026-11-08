# Brief: T-0008-agent-working-room, phase 2, Architect

- **Task id:** T-0008-agent-working-room
- **Owner:** architect (Technical Architect; human exception 2026-11-08 for agent-room feature code)
- **Goal:** a headless engine and mapping. Hook payloads become redacted RoomEvents with the right agent (guest when unmatched); the reducer and the seeded simulation are pure and deterministic. No rendering, no network.
- **Files in scope:**
  - src/agentRoom/engine/** (state.ts, reduce.ts, sim.ts)
  - src/agentRoom/mapping/** (owners.ts, hook.ts)
  - tests/agentRoomEngine.test.ts, tests/agentRoomMapping.test.ts
  - `docs/agents/architect.md` (handbook update), `harness/tasks/active/T-0008-agent-working-room.md` (checkpoint)
- **Files out of scope:** `vite.config.ts`, `tests/layers.test.ts`, `tests/harness.test.ts`, `docs/REPO_MAP.md` (Scene & QA); src outside agentRoom; `package.json`; `.claude/`.
- **Reviewer:** scene-qa
- **Claims:** the globs above, in `harness/state/claims.json` (T-0008, owner architect).
- **Acceptance commands:** `npm run check` (rerun the pedestrian flake solo); `node harness/scripts/check-claims.mjs` 0 unclaimed.
- **Report format:** at most 8 lines: files changed (lines before/after), gate result, not verified.
