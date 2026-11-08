# Brief: T-0008-agent-working-room, UI review, UI & Camera

- **Task id:** T-0008-agent-working-room
- **Owner:** ui-camera (UI & Camera)
- **Goal:** critic and UI design spec for the Agent Working Room against the reference UI. See `docs/adr/0013-agent-room-module.md`.
- **Files in scope:**
  - `harness/briefs/T-0008-ui-camera-review.md` (this file)
  - `docs/agents/ui-camera.md` (handbook update at end)
- **Files out of scope:** src/agentRoom/** (Architect), all other files.
- **Reviewer:** Technical Architect
- **Claims:** the globs above, in `harness/state/claims.json` (T-0008, owner ui-camera).
- **Acceptance commands:** `npm run check`; `node harness/scripts/check-claims.mjs` reports 0 unclaimed.
- **Report format:** at most 8 lines: top changes, open points, not verified.

# T-0008 UI & Camera review: Agent Working Room vs reference

Author: ui-camera. Date: 2026-11-08. Status: spec for Architect review (no code written).
Inputs (data only): `_references/agent-working-room/01..04*.jpg`, reference prompt ai-agent-world.md §6-7, current src/agentRoom/**.
Not checked by eye: the built-in pane cannot paint WebGL; judged from code.

## 1. Gaps, ranked by visual impact

1. No app shell. Current DOM = badge + 12-line log floating on canvas. Reference: nav rail, top bar with metrics, 380-400 px glass side panel, bottom camera bar. Biggest "ugly" factor.
2. Flat grey box room. Floor = untextured `#2a2e36` slab, walls opaque grey, no windows, no skyline, no glass partitions, no plants. Reference: dark tiled floor with seams, window wall at blue hour, instanced lit skyline, glass zone partitions.
3. Avatars are coloured capsules. Reference: robots (head+visor, torso, arms, legs, chest accent in role colour, floor status ring, selection ring).
4. Lighting: hemisphere + one directional, no tone mapping set, no fog, no shadows, no warm desk pools. Reference: ACES, exposure ~1.15, fog, blue-hour fill + warm interior points.
5. Desks: single brown box + one flat coloured screen. Reference: white slab desk, dark legs, 2 monitors with scrolling code texture, emissive on work, chair.
6. No camera presets / focus / follow / inset fit. OrbitControls only, target unclamped.
7. No hover/select/inspect. Nothing clickable; no agent details.
8. Hub is a plain cylinder. Reference: console with glowing pulsing ring and orb.
9. Trails/arcs exist (Links.tsx) but thin; no packets, no destination ring.
10. Typography/tokens: no font stack, no theme tokens; badge style ad hoc.

## 2. Target spec

### 2.1 Layout regions (desktop >= 1024 px, 12 px gutters, all `position:fixed` over full-viewport canvas)
- Nav rail: left, 72 px wide, full height minus gutters. Logo top; items Overview, Agents, Tasks, Activity, Settings (icon 20 px + 10.5 px label); activity dot when new events.
- Top bar: from rail+12 to right gutter, 64 px high. Left: title "Agent Working Room", subtitle = source honesty line. Middle: metrics (eyebrow + 18 px mono number): Agents, Active, Waiting (notify), Done, Status dot. Right: source controls (see 3.2).
- Side panel: right, 392 px, top = topbar bottom + 12, bottom gutter. Tabs content per nav selection. Scrollable (`.scroll-thin`).
- Camera bar: bottom of free area (between rail and panel), centred, 44 px, segmented preset buttons + fullscreen icon.
- Bubble layer: existing, `pointer-events:none`, below panels (z-index order: canvas 0, bubbles 10, shell 20, dialog 30).
- Mobile < 768: rail -> bottom bar 56 px; panel -> bottom sheet 40dvh; camera bar above sheet; top bar metrics collapse to Active + Status.
- Shell measures regions with ResizeObserver and writes `viewInsets {left, top, right, bottom}` (px) to the UI store.

### 2.2 Theme tokens (plain CSS custom properties on `:root` in one file src/agentRoom/ui/theme.css)
```
--ink-950:#06080c; --ink-900:#0a0e14; --ink-850:#0e131b; --ink-800:#121823; --ink-700:#1a2230; --ink-600:#263041;
--mist-100:#eef2f7; --mist-300:#b7c1cf; --mist-500:#7c8797;
--signal:#7cc4d6; --signal-strong:#9ad7e6; --ok:#6fe3a4; --warn:#f2b46a; --bad:#ff8a7a;
--font-ui: Inter, "Segoe UI", system-ui, sans-serif; --font-mono: "JetBrains Mono", Consolas, monospace;
--radius-lg:14px; --radius-md:10px; --radius-sm:7px; --gutter:12px; --hairline:1px solid rgb(255 255 255 / .07);
```
Classes: `.surface` (linear-gradient(180deg, rgb(18 24 35/.86), rgb(10 14 20/.82)), hairline border, inset 0 1px 0 rgb(255 255 255/.04), shadow 0 18px 48px rgb(0 0 0/.45), backdrop-filter blur(14px)); `.eyebrow` (10.5 px, uppercase, letter-spacing .14em, mist-500); `.btn`, `.btn-primary` (signal bg, ink-950 text), `.btn-ghost`, `.btn-quiet`; `.pill` status; `.scroll-thin`; `.pulse-dot`; `.agent-bubble`. Fonts: system fallbacks only, no webfont download (offline rule spirit). `prefers-reduced-motion`: pulses off. CSS motion durations are local style constants, not knobs (match city rule only if designer asks).

### 2.3 Components (all under src/agentRoom/ui/, each < 200 lines)
AppShell, NavRail, TopBar (+ Metrics, SourceControls), SidePanel (router), OverviewTab, AgentsTab (+ AgentRow, AgentDetails), TasksTab (+ TaskCard, TaskDetails from replay/harness tasks), ActivityTab (feed, "Messages only" filter = delegate/subagent_done/notify), SettingsTab (Walking paths, Speech bubbles, Quality High/Performance; source info), CameraBar, Icons (inline SVG, currentColor; no icon lib), useViewInsets, uiStore (zustand: tab, selected, hovered, followId, cameraRequest {nonce, preset|focus}, toggles, insets). Keep existing SourceBadge semantics inside TopBar subtitle + pill.

### 2.4 3D look (src/agentRoom/world/)
- Floor: slab top y=0 as now; procedural CanvasTexture (1 m tiles, ink-850 base, ±3% value noise from seeded mulberry32, 1 px seams ink-950), roughness 0.85, slight metalness 0.1. Built once, cached.
- Back wall -> window wall: frame mullions (thin boxes, 0.06 m, inset 0.02 from glass), glass plane at z = -halfD - 0.15 (behind mullion faces, never coplanar), dusk gradient sky plane further back (z = -halfD - 40).
- Skyline: one InstancedMesh of boxes, ~180 high / 80 low, seeded positions in band z ∈ [-70,-30], x ∈ [-60,60], heights 8-45 m; emissive lit-window CanvasTexture (seeded), toneMapped on. 1 draw call.
- Side walls: keep, darker ink-800; add floor-to-ceiling glass on one side optional later.
- Glass partitions: low (1.1 m) between desk pairs and around hub zone: MeshPhysicalMaterial transmission 0 (cheap: opacity .12, roughness .1, color #9ad7e6), thin dark frame tops. Instanced by shared geometry (one mesh for glass, one for frames).
- Desks: white slab (#e9edf2, rounded via 3 boxes or RoundedBox from drei, already a dep) at 0.75 m, dark legs/pedestal, chair (seat+back, ink-700). Two monitors per desk (instanced: 16 instances), screens use one shared scrolling code CanvasTexture with per-instance colour tint = role colour; brightness lerp by glow (keep current logic). Screen face offset 0.01 m in front of bezel.
- Robots (instanced parts, not per-agent meshes): parts = head (rounded box), visor (box, emissive dark), torso (capsule), chest accent (small box, emissive role colour), arms x2, legs x2, floor status ring (ring geometry, y=0.01 above floor top, role colour, opacity by state). Body base colour #e6e9ee for all; role read via accent + ring + one silhouette prop:
  - lead #f2f2f2: taller (scale 1.12), crown visor, signal-colour ring.
  - buildings #e8833a: hard hat; city-streets #c9b26b: cone antenna; traffic-life #5fd18a: twin antennae; sky-environment #6cb8ff: dish on head; audio #c48bff: headphones; ui-camera #ff6fa8: lens eye; scene-qa #4fd6d0: twin sensors; architect #ffd35c: monocle visor + taller head; guest #8a8f99: plain, 0.92 scale, no prop.
  Props: one InstancedMesh per prop type (count 1-2 each) or merge into per-role BufferGeometry built once (9 meshes). Poses: pure functions in an animator (idle breathe, walk swing by speed, work lean, waiting slump, done bounce, error tint amber->bad). Root damp λ 12, heading λ 9, snap > 4 m.
- Hub: console cylinder (keep) + torus ring emissive signal, pulse when lead state != idle; small orb above (emissive). Ring sits 0.02 above console top.
- Wall screen: keep CanvasTexture at wallRedrawHz; restyle: ink-950 bg, eyebrow headers, bar per state counts (idle/thinking/tool/delegating/waiting/done/error) and agent list with role dots. Redraw only when signature changes. Mount on window-wall mullion frame, screen 0.03 in front.
- Trails: InstancedMesh of small discs (count = trailLength per agent, total 10*32=320 instances, 1 draw call), additive, role colour, flowing phase; destination ring breathing.
- Arcs: keep one line buffer; add 2 packet sprites per arc (one instanced points draw); delegate arcs thicker (two offset lines).
- Lighting: `gl.toneMapping = ACESFilmic`, exposure 1.15, fog #0a0e15 30..90 (room is small), background #080b10; hemisphere #9fb4d9/#1a1410 0.55; one directional shadow light, ortho frustum fitting 22x18 m floor, map 2048 (high) / off (performance); 3 warm point lights (#ffcf9a, no shadow) over desk clusters; no HDR download (drei Lightformer Environment only in high).
- Plants: 4 pots in corners (cylinder + 2 spheres), instanced.
- Dust motes optional, skip v1.

### 2.5 Camera presets (9 zones + overview). Positions derived in code from layout.ts (deskPose, ROOM), not hard literals, so layout edits move presets.
- overview: pos (0, 15, 17) -> target (0, 0.4, -1.2).
- hub: pos (0, 6.5, 8.5) -> (0, 0.9, 0).
- wall (Mission control): pos (0, 3.2, 1.5) -> (0, 1.9, -halfD).
- each of 8 specialist desks: target = desk centre (y 0.9); pos = target + unit(desk->hub)*5.5 + (0, 3.8, 0). Camera bar shows: Overview, Hub, Wall, then a "Desks" dropdown with 8 entries (role colour dot). Total 9 zones = hub + 8 desks (+ overview, wall).
- Limits: minDistance 3.5, maxDistance 40, polar 0.18..1.36 rad, target clamped x∈[-halfW+1, halfW-1], z∈[-halfD+1, halfD-1], y∈[0,3].
- Motion: damp target λ 4, distance λ 2 (frame-rate independent), user drag cancels.
- Inset fit: free = viewport minus insets; distanceScale = clamp(max(1.17*h/freeW, 0.96*h/freeH), 1, 2.2) * presetDistance; also shift view offset so target centres in free area (`camera.setViewOffset`, reuse idea from city `cameraViewShift.ts`, but no import: rewrite locally).
- Knobs (agentRoom.ts): camFocusDistance 7.5, camDampTarget 4, camDampDistance 2, camFitMax 2.2, presetFlySec not needed (damp). Each with doc line + parity + TUNING row.

### 2.6 Interaction
- Invisible hit meshes: cylinder r 0.45 h 1.9 per agent; box per desk. R3F pointer events.
- Hover: cursor pointer, white selection ring at 50% opacity, bubble shown.
- Click (pointerdown->up move <= 5 px): select -> panel Agents tab + AgentDetails, camera focus distance 7.5. Desk click selects its owner.
- `onPointerMissed` with real click clears selection.
- Follow: button in AgentDetails; target damps to agent each frame keeping offset; Esc or drag releases.
- Keys (ignored in inputs): Space pause/resume (replay + sim only), 1-0 presets, Esc clear, F follow selected.

## 3. Adaptation to our cast and data sources

### 3.1 Cast
Lead (hub), 8 specialists (desks, labels from AGENT_LABEL), guests (hub ring slot, grey, max shown count = 1 instance now; if multiple guests are needed, extend later). Roster order = SPECIALISTS order, lead first, guest last when present. Avatar chip: initial letter on role colour (reference style); status pill from engine state: Idle, Thinking, Using tool, Delegating, Waiting for you (warn), Done (ok), Error (bad). Activity line = bubbleText of the agent's last event.

### 3.2 Source honesty (non-negotiable)
- Subtitle + pill always visible: "Live · Claude Code hooks via local bridge" / "Replay · recorded harness state (last 50 commits)" / "Simulation · seeded demo, not real work".
- Controls by source:
  - Live: no Pause/speed/reset/New task/Run demo. Show connection dot (connected/reconnecting/down) and "Switch to Replay" / "Switch to Simulation" links only.
  - Replay: Play/Pause, speed 0.5/1/2/4 (scales replayStepSec), Restart, timeline scrubber (ADR already lists it). No New task, no Assign task.
  - Simulation: Play/Pause, speed, Reset, Reseed. No "New task" (engine has no task creation path); if added later it must be labelled "Demo task".
- Tasks tab: Replay shows harness tasks (T-xxxx, status, owner, brief link text); Live shows tasks only from task_state events; Simulation shows "Simulated" tag on each card. No progress % unless derived from real data (do not invent %; show phase/state only).
- No "Assign task", "Pause agent" buttons anywhere in v1 (no command channel, ADR decision 5).

## 4. Perf budget check (ADR: < 150 draw calls, < 120k tris, 60 fps 1080p)
Estimated draw calls: floor 1, walls 3, window mullions 1 (instanced), glass 1, sky 1, skyline 1, partitions 2, plants 2, desks 3 (slab, legs, chair instanced), monitors 2 (bezel, screen), hub 3, wall screen 2, robot parts ~10 instanced meshes + 9 prop meshes, rings 2 (status, selection), hit meshes 0 visible (visible=false still raycasts? use `visible` true with `colorWrite=false` -> adds 2; prefer layers or raycast-only objects not rendered), trails 1, dest rings 1, arcs 2, packets 1. Total ~50, x2 with shadow pass ~ 90. Within 150.
Triangles: skyline 180*12 = 2k; robots 10 * ~3k = 30k; desks/monitors < 10k; rest < 10k. ~55k. Within 120k.
Rules: no per-frame allocations, shared geometries/materials pool, CanvasTextures built once, wall redraw on signature change only, shadow map only in High. Quality auto-drop: drei PerformanceMonitor (already in drei, no new dep) -> Performance mode.
No new npm dependency needed. Inter/JetBrains Mono: not bundled (system fallbacks). If the human wants exact fonts, that is an asset add (approval).

## 5. Implementation plan (each step gate-green: `npm run check`, files < 350 lines)
1. Theme + shell skeleton. New ui/theme.css, ui/AppShell.tsx, ui/NavRail.tsx, ui/TopBar.tsx, ui/Icons.tsx, ui/uiStore.ts; main.tsx mounts AppShell; Overlay.tsx badge/log move into TopBar/ActivityTab. agent-room.html: drop inline styles except reset. Test: pure metrics helper (ui/metrics.ts) in tests/agentRoomUi.test.ts.
2. Side panel tabs: ui/SidePanel.tsx, OverviewTab, AgentsTab (+AgentDetails), ActivityTab, SettingsTab; TasksTab from replay doc. Source-aware controls (ui/SourceControls.tsx) with the matrix in 3.2; test the matrix as pure function.
3. Look pass 1, room: world/floorTexture.ts (seeded), world/WindowWall.tsx, world/Skyline.tsx (seeded instancing), world/Partitions.tsx, world/Plants.tsx, Lighting.tsx (tone mapping, fog, shadows by quality). Coplanar check: all offsets listed in 2.4. Determinism: seeds from agentRoom.simSeed or new knob `skylineSeed`.
4. Look pass 2, desks + hub + wall: world/Desks.tsx (replaces desk part of RoomShell), world/Monitors.tsx (+ codeTexture.ts), world/Hub.tsx, WallScreen restyle.
5. Robots: world/robotParts.ts (geometries per part/prop), world/Robots.tsx (instanced, replaces capsules in Agents.tsx), world/robotPose.ts (pure poses; unit test), status/selection rings.
6. Trails/arcs polish: Links.tsx split into Trails.tsx (disc instancing, dest ring) and Arcs.tsx (+ packets).
7. Camera: world/cameraPresets.ts (pure, derived from layout; unit test), world/CameraController.tsx (damp, clamp, follow, inset fit with setViewOffset), ui/CameraBar.tsx, ui/useViewInsets.ts. Knobs added to agentRoom.ts + parity + TUNING.
8. Interaction: world/HitTargets.tsx, ui/useClickTolerance.ts (pure 5 px test), hover/select/follow wiring, keyboard map.
9. Quality: PerformanceMonitor fallback, Settings toggle, mobile layout CSS.
10. Scene & QA review in connected Chrome: screenshots per preset, draw calls/tris via `window.__agentRoom.gl.info`, fps at 1080p.

## Open items for Architect
- Confirm "9 zones" = hub + 8 desks (plus overview and wall presets).
- Confirm no task progress % (honesty) and no New task button in v1.
- Seed knob for skyline/floor: reuse simSeed or add `roomSeed` (recommend separate knob).
