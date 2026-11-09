# ADR 0013: Agent Working Room module, local event bridge, scoped network exception

Status: Accepted (2026-11-08)

Note: paths for files that do not exist yet are written without backticks, so the docs path guard in tests/harness.test.ts stays green until they land.

## Context
The user wants a 3D room that shows the real work of this project's agents (lead plus 8 specialists). Work happens in Claude Code sessions. Claude Code exposes hook events (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, SubagentStop, Stop, Notification). The room must also make sense offline (replay of harness state) and as a labelled demo (seeded simulation).

Constraints: ADR 0005 forbids network calls in src. ADR 0010 layering. ADR 0004 determinism. ADR 0007 350-line ratchet. ADR 0003 tuning in src/config/tuning/. Stack stays Vite, TS, R3F, zustand, vitest (no Next, no Tailwind).

## Decision

### Placement
Separate Vite page agent-room.html at repo root, entry src/agentRoom/main.tsx, like tree-compare.html. vite.config.ts gets build.rollupOptions.input for both pages (approval gate: toolchain). The city scene never imports agentRoom, and agentRoom never imports scene, ui, or any city feature module.

### Directory layout
- src/agentRoom/model/ : types only. AgentId, RoomEvent union, Snapshot, Source label ('live' | 'replay' | 'simulation'). No runtime imports.
- src/agentRoom/engine/ : pure TS reducer `apply(state, event) -> state`, agent state machine (idle, thinking, tool, delegating, waiting, done, error), path planner on a fixed desk grid, seeded simulation generator (mulberry32 from a seed in tuning). No React, no three, no Date.now, no Math.random. Headless vitest.
- src/agentRoom/mapping/ : pure functions hook payload -> RoomEvent and file path -> owner (ownership table plus claim globs). Runs in the browser only: the bridge forwards raw hook JSON unchanged (after redaction), so no TS is shared with Node.
- src/agentRoom/bridgeClient/ : the ONLY network code in src. One EventSource reader plus replay JSON loader from the bridge. Pushes events into engine; never touches three objects.
- src/agentRoom/world/ : R3F components. Desks, agent avatars, desk screens (emissive when owner is working), comm arcs (one instanced line buffer), path trails, mission-control wall (CanvasTexture redrawn at throttled rate). Reads liveWorld buffer in useFrame. Rendering never mutates engine state.
- src/agentRoom/ui/ : DOM overlay. Speech bubbles projected from world positions (no drei Html), source badge (Live / Replay / Simulation, always visible), timeline scrubber for replay, event log.
- src/agentRoom/store.ts : zustand mirror, throttled (tuning: mirrorHz) from liveWorld for UI only.
- src/config/tuning/agentRoom.ts : knobs (see below), parity entries in tests/tuningParity.test.ts, line in docs/TUNING.md.
- tools/agent-bridge/ : Node 22 ESM scripts, no npm dependency. server.mjs (node:http), hook.mjs (stdin -> POST), replay.mjs (reads harness/state/claims.json, harness/tasks/**, harness/briefs/**, git log -> snapshot JSON).

Internal import rule: model <- engine <- mapping; bridgeClient imports model, engine; world and ui import model, store, config; main.tsx composes. Guarded by a new block in tests/layers.test.ts (agentRoom imports nothing outside src/agentRoom, src/config, packages; engine and model import no react, three, @react-three).

### Transport (no new dependency)
Node 22 has a WebSocket client but no server. Instead of adding ws:
- Hook -> bridge: Claude Code command hook runs `node tools/agent-bridge/hook.mjs`, which reads the hook JSON on stdin and POSTs it to http://127.0.0.1:PORT/hook. Exits 0 within 300 ms even if the bridge is down (never blocks the session).
- Bridge -> room: Server-Sent Events on GET /events (text/event-stream). Each message is `{kind:'event'|'snapshot', seq, ...}`. On connect the bridge sends a snapshot, then events. Client reconnects with Last-Event-ID; bridge keeps a ring buffer (tuning: bridgeRingSize).
- Commands (pause, replay range) are local to the client; no client->bridge command channel in v1. This drops the reference's command/ack half; acks are replaced by seq numbers.
- Bridge binds 127.0.0.1 only, CORS allows the Vite origin only, payloads are redacted (tool input truncated to N chars, no file contents, no env).

### Network exception (supersedes ADR 0005 in part, on acceptance)
EventSource and a GET of the replay snapshot to 127.0.0.1 are allowed only in src/agentRoom/bridgeClient/. The guard in tests/harness.test.ts adds EventSource to the banned pattern and records one reasoned exception for that folder. The city app remains offline.

### Event vocabulary (fixed, closed union)
session_start, session_end, prompt, tool_start, tool_end, delegate (lead -> specialist, from Agent or SendMessage), subagent_done, notify (waiting for human), file_touch (path, owner), claim_change, task_state, error. Each: `{seq, t, source, agent, ...payload}`. Unknown hook payloads map to nothing and are counted, never thrown.

### Hook mapping
- Main session id -> lead.
- PreToolUse Agent/SendMessage: target name or description matched against the 8 specialist names and handbook file names -> delegate; the spawned subagent session id is bound to that specialist.
- Subagent tool events -> that specialist. Unmatched subagent -> the lead (superseded 2026-11-08, see below; was a "guest" avatar).
- Edit/Write/Read paths -> file_touch, owner from the ownership table (docs/agents/README.md, parsed by replay.mjs into a static table) then claim globs.
- Notification -> notify (bubble "needs you"). Stop -> lead idle. SubagentStop -> subagent_done.

### Determinism
Engine output is a pure function of (seed, event list). Wall-clock time only enters via event.t from the bridge. Simulation uses the seed. agentRoom is added to LAYOUT_DIRS in the Math.random guard.

### Perf budget
Room under 150 draw calls, under 120k triangles, 60 fps at 1080p on the reference machine. Avatars and desks instanced; one arc buffer; wall texture redraw at most 4 Hz; zustand mirror at most 10 Hz; event apply O(1) per event; ring buffer bounded. No per-frame allocations in useFrame.

### Tuning knobs (src/config/tuning/agentRoom.ts)
bridgePort, bridgeRingSize, mirrorHz, wallRedrawHz, bubbleLifeSec, arcLifeSec, trailLength, simSeed, simEventsPerMin, avatarWalkSpeed, idleAfterSec.

### Human decisions (2026-11-08)
1. Hook entries live in .claude/settings.local.json only; the shared settings file is unchanged.
2. The bridge is started by hand (npm run bridge); hooks never start it.
3. Redaction: the bridge keeps tool names and file paths; it drops prompt text and tool input contents.
4. Replay covers the last 50 commits and includes completed tasks.
5. No room-to-bridge command channel in v1 (one-way SSE).
6. Unmatched agents are shown as "guest" avatars at the hub. (Superseded 2026-11-08: no guest; see "Decision change 2026-11-08".)
7. Ownership: no new specialist. The Technical Architect owns src/agentRoom/**, src/config/tuning/agentRoom.ts (with its parity and TUNING entries), tools/agent-bridge/** and agent-room.html, as an explicit human exception to "architect writes no feature code". Scene & QA keeps `vite.config.ts`, `tests/layers.test.ts`, `tests/harness.test.ts` and `docs/REPO_MAP.md`.

## Consequences
- One new page and one new src folder; ownership table and REPO_MAP must list src/agentRoom (guard: every src folder appears in the ownership table).
- .claude/settings.local.json gains hook entries (approval gate; local to each machine). If the bridge is down, hooks are a no-op.
- ADR 0005 is narrowed, not dropped. A later client->bridge command channel needs another ADR.
- Mapping by name is heuristic; unmatched agents are attributed to the lead and counted (`stats.unmatched`), not guessed.

## Decision change 2026-11-08: no guest role
- Human request: work shows only on the real lead and specialists. The guest avatar, desk, door, bench and ring seat are removed; `AgentId` has no `guest`; knobs `agentRoom.guestDeskX/Z` are deleted. The ring has 8 seats.
- Unmatched work (subagent with no named delegation, a delegation that names no specialist, a file with no owner) is attributed to the lead. The mapper counts it in `stats.unmatched` instead of drawing an avatar.
- Root cause of the "only Guest works" report: the mapper took the first session id in the bridge ring as the lead. The ring held an older session, so the live main session and its subagents mapped to guest. Now every event without `agent_id` is the lead's, and pending Agent/Task delegations are queued per session, so an older session never displaces or leaks into the live one.
- Agent tool `name` (and SendMessage `to`) binds by exact name or slug before the free-text fallback.
