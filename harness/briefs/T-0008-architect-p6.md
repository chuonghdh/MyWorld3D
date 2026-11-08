# Brief: T-0008-agent-working-room, phase 6 (living office), Architect

- **Task id:** T-0008-agent-working-room
- **Owner:** architect (Technical Architect; human exception 2026-11-08 for agent-room feature code)
- **Goal:** the room behaves like a living office, driven only by real events (or the labelled simulation):
  - lead stands beside a kanban command board of real tasks (Backlog / Active / Review / Done, cards slide on state change);
  - work loop: a delegation calls the agent to the board for a huddle with the lead, it walks back to its desk and works (typing, monitor glow), on finish it reports at the board and a small celebration burst plays;
  - idle agents (no event for `idleAfterSec`) walk to a pantry lounge in the bottom-right corner and sit on fixed seat slots (no overlap) with a mug; they stand up when called;
  - surprise layer: personalised desk props per specialist (animated EQ, globe, car track), desk status lamps, a "ship it" bell and shipped counter on commits, a guest door with bench, day/night light that follows the local clock, and an optional director camera (off by default).
  Behaviour is a pure, tested function of engine state and time; visuals only read it. Draw calls stay at or under 150 in High.
- **Files in scope:** src/agentRoom/** (engine state/reduce/sim additions, world/**, ui/**), src/config/tuning/agentRoom.ts, `docs/TUNING.md`, tests/agentRoom*.test.ts, `docs/agents/architect.md`, `harness/tasks/active/T-0008-agent-working-room.md`.
- **Files out of scope:** Scene & QA files (`vite.config.ts`, `tests/layers.test.ts`, `tests/harness.test.ts`, `docs/REPO_MAP.md`); src outside agentRoom except the agentRoom tuning file; `package.json`; `.claude/`; the mapping and bridge contract.
- **Reviewer:** ui-camera (visual critique), scene-qa (Chrome check)
- **Claims:** the globs above, in `harness/state/claims.json` (T-0008, owner architect).
- **Acceptance commands:** `npm run check` per step (timing flakes rerun solo); check-claims 0 unclaimed; renderer.info in High and Performance under the ADR budget; screenshots from the pane; honest labels unchanged (simulated tasks are tagged DEMO).
- **Report format:** at most 8 lines: files changed, gate result, draw calls and triangles, screenshot paths, not verified.
