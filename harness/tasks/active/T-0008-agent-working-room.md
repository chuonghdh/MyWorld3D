---
id: T-0008-agent-working-room
title: Agent Working Room
status: verifying
owner: architect
branch: feat/agent-working-room
created: 2026-11-08
---

# T-0008: Agent Working Room

Design: `docs/adr/0013-agent-room-module.md` (Accepted 2026-11-08). Future paths below are plain text (not backticked) so the docs path guard stays green until they exist.

## Spec

- Goal: a separate page agent-room.html shows a 3D room with a lead hub and 8 specialist desks. It animates real agent work from live Claude Code hooks (via a local bridge), from a replay of harness state when offline, or from a seeded simulation. The source is always labelled Live / Replay / Simulation.
- Files in scope (whole task):
  - src/agentRoom/** (model, engine, mapping, bridgeClient, world, ui, store.ts, main.tsx)
  - src/config/tuning/agentRoom.ts, `src/config/tuning/index.ts` (re-export)
  - agent-room.html, `vite.config.ts` (multi-page input)
  - tools/agent-bridge/** (server.mjs, hook.mjs, replay.mjs, README.md)
  - tests: agentRoom*.test.ts (new), `tests/layers.test.ts`, `tests/harness.test.ts` (network exception, LAYOUT_DIRS), `tests/tuningParity.test.ts`
  - .claude/settings.local.json (hook entries, local only), `package.json` (script "bridge" only, no dependency)
  - docs: `docs/TUNING.md`, `docs/REPO_MAP.md`, `docs/agents/README.md`, `docs/agents/architect.md`, `docs/adr/README.md`, `docs/adr/0005-no-network-in-src.md` status line only
- Out of scope: everything under src except agentRoom and config/tuning; city scene visuals and perf; any new npm dependency; `.claude/settings.json` (shared).

### Human decisions (2026-11-08)
1. Hooks go in .claude/settings.local.json only (not the shared settings file).
2. Bridge is started by hand: npm run bridge.
3. Redaction: keep tool names and file paths; drop prompt text and tool input contents.
4. Replay: last 50 commits; include completed tasks.
5. No room-to-bridge command channel in v1.
6. Agents that match no specialist are shown as "guest" avatars.
7. No 9th specialist. The Architect owns this feature (see Ownership).

### Ownership
Explicit human exception (2026-11-08) to "architect writes no feature code": the Architect owns src/agentRoom/**, src/config/tuning/agentRoom.ts (plus its entries in `tests/tuningParity.test.ts` and `docs/TUNING.md`), tools/agent-bridge/**, agent-room.html, tests/agentRoom*.test.ts, and the toolchain files it already owns (`package.json`, `.claude/` settings, ADRs, `docs/agents/README.md` row).
Scene & QA keeps `vite.config.ts`, `tests/layers.test.ts`, `tests/harness.test.ts`, `docs/REPO_MAP.md`.
Reviewer: Scene & QA reviews Architect phases; Architect reviews Scene & QA phases.

### Phases (one brief per owner per phase, disjoint files; each ends with `npm run check` green)
1. Skeleton and contract.
   - Architect (`harness/briefs/T-0008-architect-p1.md`): model types, tuning file and re-export, parity entries, TUNING.md line, agent-room.html, src/agentRoom/main.tsx (empty page with source badge), ADR index row, ADR 0005 status line.
   - Scene & QA (`harness/briefs/T-0008-scene-qa-p1.md`): vite multi-page input, layers guard block for agentRoom, harness guard (LAYOUT_DIRS adds agentRoom; EventSource banned; reasoned exception for src/agentRoom/bridgeClient/), REPO_MAP row.
2. Engine headless. Architect only: engine reducer, state machine, seeded sim, mapping hook->event and path->owner; vitest fixtures from recorded hook JSON.
3. Room render with simulation. Architect only: world, ui overlay, store mirror. Perf check vs budget; Chrome visual check by human.
4. Replay. Architect only: tools/agent-bridge/replay.mjs (50 commits, completed tasks), bridgeClient snapshot loader, scrubber.
5. Live. Architect only: server.mjs (SSE), hook.mjs (redaction per decision 3), bridgeClient EventSource, package.json script "bridge", .claude/settings.local.json hook entries.

## Acceptance

- [ ] `npm run check` green after every phase.
- [ ] Engine: same seed + same events give identical state (vitest).
- [ ] Mapping: fixture hook payloads map to expected agents; unknown payloads counted, unmatched agents become guests.
- [ ] Layers: agentRoom imports nothing from scene, ui or city features; engine/model import no react/three.
- [ ] Network only in src/agentRoom/bridgeClient (guard).
- [ ] Perf: under 150 draw calls, under 120k triangles (renderer.info in dev).
- [ ] Hook script exits 0 under 300 ms with bridge down; no prompt text or tool input in bridge output.
- [ ] Human: room looks right in connected Chrome in all three sources; live session shows lead delegating to a specialist. Not verified until done.

## Checkpoints

- 2026-11-08: design drafted (this record, ADR 0013). No code. Uncommitted, working tree.
- 2026-11-08: human decisions 1-7 recorded; status assigned; phase 1 briefs written; phase 1 claims added. Uncommitted, working tree.
- 2026-11-08: phase 1 done (npm run check green per lead). ADR 0013 accepted. Phase 2 engine and mapping added (src/agentRoom/engine, src/agentRoom/mapping, tests agentRoomEngine and agentRoomMapping). Uncommitted, working tree.
- 2026-11-08: phase 3 room render with simulation (world, ui, runtime, store), owners drift test, tighter name matching, 3 knobs. Forced render: 11 draw calls, ~4.5k triangles, no console errors. Not seen by eye. Uncommitted, working tree.
- 2026-11-08: phase 4 replay (tools/agent-bridge/replay.mjs, src/agentRoom/replay, src/agentRoom/bridgeClient/loadReplay.ts, runtime split, knob replayStepSec). Dev page: Replay badge, real commits in the log, 11 draw calls. Not seen by eye. Uncommitted, working tree.
- 2026-11-08: UI pass steps 1 (theme, shell), 2 (panel tabs, source controls, seek), camera (presets, controller, camera bar, keys). 6 knobs. Dev page at 1600x900: layout regions measured, view offset applied, 11 draw calls, 4,450 triangles. Uncommitted, working tree.
- 2026-11-08: UI pass look steps 3-6 (room, desks, hub, wall, robots, trails, arcs) and UI & Camera review fixes 1-7, 9, 10. High: 62 draw calls, ~61k triangles, no GL error. Screenshot rendered in the pane at 974 px wide. Uncommitted, working tree.
- 2026-11-08: UI pass steps 8 (pick, 5 px click) and 9 (auto quality drop), visual critique fixes. High 63 calls / 63.8k tris, Performance 43 / 37.4k, no console errors; 3D click selects and opens Agents. Uncommitted, working tree.
- 2026-11-08: phase 6 living office (pure office plan, kanban board, pantry, desk props, door, bursts, day/night, director camera). High 88 calls / ~71k tris at 1600x900. Uncommitted, working tree.
- 2026-11-08: routing (nav grid + A*), board on the left wall, fitted overview, phase 6 critique fixes. High 89 / 71k, Performance 62 / 42k. Uncommitted, working tree.
- 2026-11-08: re-layout to the human's floor plan: back-wall board, discuss table, back-right pantry, 2x2 desk blocks, corridor-graph routing; camera bar icons under 640 px. High 90 / 70k. Uncommitted, working tree.
- 2026-11-08: polish: wider room (roomHalfWidth 12.5), glass side walls, pantry plank floor + glass partition, larger board (7.5 x 2.7 m, bigger type), narrow-width overflow menu and collapsed camera bar. High 96 / 70k, Performance 67 / 42k. Uncommitted, working tree.
- 2026-11-08: phase 5 live: bridge (server, hook, lib), bridgeClient live feed, npm script bridge, hooks in .claude/settings.local.json. End to end: fixture piped through hook.mjs (11/11 exit 0) and this session's real hooks shown in the room as Live, Bridge connected. Uncommitted, working tree.

## Handoff

- Next step: human verification in connected Chrome with a real session (npm run bridge, open agent-room.html); then review and commit on request.
- Approval gates still open: `package.json` script and .claude/settings.local.json hooks (phase 5). No new npm dependency.
- Open questions: none.
