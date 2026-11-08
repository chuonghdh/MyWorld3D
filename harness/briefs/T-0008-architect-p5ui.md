# Brief: T-0008-agent-working-room, UI pass (agreed plan, pending lead confirmation), Architect

- **Task id:** T-0008-agent-working-room
- **Owner:** architect (Technical Architect; human exception 2026-11-08 for agent-room feature code)
- **Goal:** replace the bare room and DOM with the look and shell of the reference (screenshots `_references/agent-working-room`, reference prompt sections 6-7), adapted to our cast and three honest sources. Based on `harness/briefs/T-0008-ui-camera-review.md` (UI & Camera); this file is the Architect's reply and the agreed plan. No code until the lead confirms.
- **Files in scope:** src/agentRoom/ui/**, src/agentRoom/world/**, src/agentRoom/main.tsx, `agent-room.html`, src/config/tuning/agentRoom.ts, `docs/TUNING.md`, tests/agentRoom*.test.ts, `docs/agents/architect.md`, `harness/tasks/active/T-0008-agent-working-room.md`.
- **Files out of scope:** engine, mapping, replay, bridgeClient (contract stays); everything outside src/agentRoom except the agentRoom tuning file; Scene & QA files; `package.json` (no new dependency); `.claude/`.
- **Reviewer:** ui-camera (design critique per step), scene-qa (Chrome check at the end)
- **Claims:** the globs above, added to the T-0008 architect claim in `harness/state/claims.json` after ui-camera finishes its claims.json reformat.
- **Acceptance commands:** `npm run check` per step (timing flakes rerun solo); check-claims 0 unclaimed; renderer.info under 150 draw calls and 120k triangles per quality mode; human eye check in connected Chrome at the end.
- **Report format:** at most 8 lines: files changed (lines before/after), gate result, not verified.

## Answers to the open points

1. **9 zones = hub + 8 desks.** Agreed. Presets: Overview and Wall as well, so 11 camera targets. Keys 1-9 map to hub + 8 desks, 0 is Overview, W is Wall (11 targets do not fit 1-0).
2. **No progress %, no New task in v1.** Agreed, both dropped. The engine has no task-creation path and no command channel (ADR 0013 decision 5). Task cards show state and phase only. A simulation-only "Demo task" button stays out of v1.
3. **Seed knob.** Agreed: a separate `roomSeed` knob for floor noise, skyline and lit windows. `simSeed` drives only the event demo, so changing the demo never moves the scenery.

## Review of the 10 steps (accept / modify)

1. Theme and shell: **accept, modified.**
   - Keep `src/agentRoom/store.ts` as the engine mirror.
   - Put UI state (tab, selected, hovered, follow, camera request, toggles, insets) in a separate src/agentRoom/ui/uiStore.ts. The 3D side may read the camera request and selection from it but never writes the mirror.
   - theme.css is imported by main.tsx (Vite handles CSS); no inline styles are left in the html apart from the reset.
   - Theme colours are style constants, not knobs.
2. Side panel tabs: **accept.**
   - The source control matrix is a pure function with a test.
   - Replay speed (0.5/1/2/4) is UI state that multiplies dt in the Driver. It is not a knob.
   - The timeline scrubber needs a runtime seek: seek = rebuild state by folding events 1..n, which is pure and cheap at our size (under 1k events). This is a small runtime.ts change, listed here.
3. Room look 1: **accept, modified.**
   - The window wall moves the back wall plane. The wall screen and layout test (`tests/agentRoomWorld.test.ts`) must move with it in the same step.
   - Sky gradient and skyline are seeded by `roomSeed`; the skyline is one InstancedMesh.
   - Partitions: plain transparent standard material (opacity), not MeshPhysicalMaterial.
   - Fog must not tint the room interior: start fog beyond the window wall.
4. Desks, hub, wall screen: **accept.**
   - Use drei RoundedBox only for the desk slab, with low segments (it is instanced via a shared geometry).
   - Code texture: one shared CanvasTexture, scrolled by UV offset (no per-frame redraw).
5. Robots: **accept, modified.**
   - Merge parts per role into one BufferGeometry built once with vertex colours, so the cast is about 10 meshes, not 19.
   - Poses are a pure function (state, phase, speed) -> part transforms, with a unit test.
   - Selection and status rings: one instanced ring mesh with two instance sets.
   - This is the step most at risk for tris: budget 3k per robot, measured.
6. Trails and arcs: **accept.**
   - Split Links.tsx into Trails.tsx and Arcs.tsx; packets are one Points draw.
7. Camera: **accept, modified.**
   - Implement before steps 3-5 (order 1, 2, 7, 3, 4, 5, 6, 8, 9, 10), so every look pass is judged from the real presets and inset fit.
   - Presets are derived from layout.ts (pure, tested).
   - New knobs: camFocusDistance, camDampTarget, camDampDistance, camFitMax, plus roomSeed and qualityDefault, each with a doc line, parity entry and TUNING row.
8. Interaction: **modify.**
   - No extra hit meshes. Raycast the instanced robot body (instanceId -> agent) and the desk InstancedMesh: 0 extra draw calls.
   - Click tolerance 5 px is a pure helper with a test.
   - Keys as in answer 1. Space pauses replay and simulation only.
9. Quality: **accept.**
   - drei PerformanceMonitor (no new dependency). The High/Performance switch is UI state, and `qualityDefault` is the knob.
   - Shadows only in High.
10. Chrome review: **accept.** Scene & QA does it in connected Chrome, plus a human eye check.

## Cross-cutting rules for every step

- **Honesty:** the source pill and subtitle are always visible. Live mode shows no playback controls. Simulation labels every simulated item. No invented numbers.
- **350-line rule:** every new file stays under 200 lines; RoomShell.tsx and Agents.tsx are split or replaced, not grown.
- **No coplanar faces:** the offsets listed in the review section 2.4 are kept. Each new surface states its gap in a comment.
- **Determinism:** all scenery comes from roomSeed via mulberry32 (engine/sim.ts); there is no Math.random in src/agentRoom.
- **Fonts:** system fonts only; no webfont download.
- **Perf:** check renderer.info after each look step (3, 4, 5, 6), in both quality modes. Stop and report if a step exceeds 100 draw calls before step 6.
- **Ownership:** the Architect implements (it owns src/agentRoom/**). UI & Camera reviews each step's diff and screenshots and gives design critique, but does not edit these files. Its notes go to the Architect handbook through the Architect, per the 2026-11-06 ownership rule.
