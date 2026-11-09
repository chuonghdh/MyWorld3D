# Specialist agents
Reviewed 2026-11-09 at 6343a99 (architect pass; open items at the end)

MyWorld3D is built by a small, fixed team of specialists (eight, including the architect who reviews structure and standards) coordinated by the lead (the main Claude session).
Each specialist owns directories, keeps a handbook in this folder, and is **reused** for every new task in its area
instead of spawning a fresh agent. That way what it learned (traps, decisions, conventions) carries over.

| # | Specialist | Owns | Handbook |
|---|---|---|---|
| 1 | Buildings | `src/buildings/**` | [buildings.md](buildings.md) |
| 2 | City & Streets | `src/city/**`, `src/streets/**` | [city-streets.md](city-streets.md) |
| 3 | Traffic & Life | `src/traffic/**`, `src/life/**` | [traffic-life.md](traffic-life.md) |
| 4 | Sky & Environment | `src/sky/**`, `src/environment/**`, `src/weather/**`, `src/aircraft/**` | [sky-environment.md](sky-environment.md) |
| 5 | Audio | `src/audio/**`, `src/scene/audioBridge.ts`, `src/ui/SoundMixer.tsx`, `docs/AUDIO.md`, audio tests (`tests/audio*.test.ts`, `tests/helpers/fakeAudio.ts`) | [audio.md](audio.md) |
| 6 | UI & Camera | `src/ui/**` (except SoundMixer), `src/store/**`, `src/film/filmClock.ts`, `src/film/autoPath.ts`, `src/scene/CameraRig.tsx`, `cameraInput.ts`, `cameraDom.ts`, `cameraMath.ts`, `cameraMapKeys.ts`, `cameraViewShift.ts`, `pivotMath.ts`, `Selection.tsx`, `selectionMath.ts`, block edit (`BlockEditor.tsx`, `blockEditMath.ts`, `blockEditAnchors.ts`) | [ui-camera.md](ui-camera.md) |
| 7 | Scene & QA | `src/scene/**` (rest), `src/core/**`, `src/App.tsx`, `src/main.tsx`, `src/dev/treeCompare/**`, `tree-compare.html`, `public/models/**`, `tests/helpers/**`, perf budgets, docs | [scene-qa.md](scene-qa.md) |
| 8 | Technical Architect | Cross-cutting structure, asset pipeline, performance standards, toolchain (no feature code, except Agent Room by human decision 2026-11-08: `src/agentRoom/**`, `src/config/tuning/agentRoom.*`, `tools/agent-bridge/**`, agent-room.html). Reviews `src/shaders/**` | [architect.md](architect.md) |

Shared, no single owner: `src/shaders/**` (cloud shade and wet surface patches). Buildings and Sky & Environment both use it; changes need both owners and an architect review.

Tunable values in one place (owners per row): [docs/TUNING.md](../TUNING.md)

**Tuning rule (all specialists):** every knob a designer may change lives in `src/config/tuning/` in your section.
Import it, never re-type it. Geometry and shader constants stay local. No duplicate values; lab copies only in
`src/dev/treeCompare/labTuning.ts`. Add each new knob to `tests/tuningParity.test.ts` (or its section parity file) and to `docs/TUNING.md`.
When a change touches a knob, the owner updates the config, the parity test and the index in the same task.

## Rules for the lead

1. **Reuse, do not respawn.** Send follow-up work to the specialist that owns the area with `SendMessage`. Spawn a new
   agent only when the specialist is gone from the session, and then paste its handbook into the brief.
2. **Disjoint files.** Two specialists never edit the same file at once. A cross-cutting feature gets one lead specialist
   who may touch a few files outside its area (name them in the brief and report them back).
3. **Briefs are complete.** Name the files, the acceptance checks and what must not change (visual quality, draw calls,
   determinism). The specialist reads its handbook first.
4. **Handbook upkeep.** At the end of every task the specialist appends what it learned to its handbook:
   new traps, decisions with the reason, and what is left undone. The lead reviews that diff.
5. **Verification before reporting.** `npm run check` (tsc, lint, vitest, vite build). The built-in browser pane
   cannot paint frames: check the scene graph, uniforms, shader compile (force a render in a standalone renderer) and
   console errors, and say plainly what was not seen by eye.
6. **Project rules.** Commits, code comments and docs are in English. Commit only when the user says so. Root-cause
   fixes, no coplanar geometry, no loss of visual quality or performance.

## Handbook template

```
# <Specialist>
Owns / Key files / Conventions / Traps (what bit us, why) / Decisions (and the reason) / Open items / How to verify
```

## Update 2026-11-04 (lead): where changes go

- After every commit or new dependency, add a dated "Update" section to each affected handbook. Include: new rules, new libraries (with version and why), tuning knobs moved, and open items.
- The Technical Architect keeps the cross-cutting list (dependencies, budgets, codec rules) and reviews the other handbooks.

## Update 2026-11-06 (lead): today's rules
- Visual motion uses sim time only (see architect.md, 2026-11-06). Canvas `frameloop` is a controlled prop (`src/film/loopHold.ts`).
- Dev check of the R3F loop: `window.__r3f` is a snapshot from `onCreated`; read live state with `window.__r3f.get()`.
- Vite stale module (2026-11-06): the dev server kept serving an old `HousePanel.tsx` after an agent edit, so the user saw a fixed bug. Check with `fetch('/src/<file>').then(r => r.text())` in the page; fix by touching the changed files (or restarting Vite), then the user reloads.
- Ownership rule (2026-11-06, user): every file change goes to the owner of its directory, even a small helper. Notes go only in the owner's handbook. Reason: cross-owner edits scatter notes across handbooks and make later fixes read many .md files (more tokens).

## Update 2026-11-06 (lead): working rules from the session
- Assignment: one brief per owner (table above). Never hand an owner's file to another agent to save a hand-off.
- Quick-check requests: when the user says "no tests", run only `npx tsc --noEmit`; do not run vitest or the browser check.
- Amounts a designer may change are knobs in `src/config/tuning/`; shader constants stay local (CLAUDE.md).
- Commit only on the user's request. Commit attribution: Co-Authored-By for the model in use.

## Update 2026-11-08 (lead): handbook and rules review
- All eight specialists reviewed their handbooks against code (see each handbook's "Review 2026-11-08" section). Stale paths and counts corrected; no rule found invalid in its guard.
- Rules updated: CLAUDE.md (guarded dirs for determinism, the 350-line scope, knob doc rows), this file (`npm run check` as the gate; section parity files), and harness/README.md (guard table, CI, network and localStorage allow-lists, layout table).
- Open for the user: (1) knobs in traffic, life and audio outside `src/config/tuning/` (CLAUDE.md says no); move them or record exceptions. (2) `src/film/**` is not in the dependency guard (`src/film/autoPath.ts`, `autoRun.ts` import `src/scene`). (3) `Math.random` in `src/scene/useTownFrame.ts` and `src/ui/HousePanel.tsx` is outside the guard dirs. (4) `src/film/**` owner row.

## Update 2026-11-08 (architect): dependency sync
- After any dependency bump, or pulling a merge that changes `package-lock.json`, run `npm install`, delete `node_modules/.vite`, and restart Vite. Guarded by `tests/depsSync.test.ts`.

## Open items (architect, 2026-11-09)
1. Math.random outside the layout guard dirs (tests/harness.test.ts determinism list): `src/scene/useTownFrame.ts:93-94` (leaf drop on a user action, Scene & QA) and `src/ui/HousePanel.tsx:89` (random house pick, UI & Camera). No tuning knob is involved, so no TUNING row. Decide per owner: seed it, or record an exception with a reason.
2. `src/film/**` is not in the dependency guard (`FEATURES`, tests/harness.test.ts:59). DECIDED by user 2026-11-09: no guard for film. `src/film/autoPath.ts:8` imports `scene/cameraMath`; the code fix is still pending, the guard stays as is.
3. Designer knobs in traffic, life and audio still outside `src/config/tuning/` (CLAUDE.md rule). Listed as "stays in code" rows in docs/TUNING.md; each owner decides which move.
4. Film codec: `src/film/recorder.ts:29` uses `avc1.42E028` (H.264 level 3.0); `src/film/autoEncoder.ts:10` uses `avc1.640028` (level 4.0). Check 1080p MediaRecorder in connected Chrome.
5. Finding 7 (`src/store/io.ts:208` strict version equality, low) and finding 8 (`src/scene/useTownPieces.ts:51` signature stringify, unmeasured) stay open.
6. Budgets (main 1.9 M, shadow 605 k, sum 2.3 M, 140 draw calls) not re-run. Frame and rebuild time still need connected Chrome. CI has never run on GitHub.
7. Agent Room subagent binding: SendMessage to a resumed subagent now uses its bound specialist (2026-11-09). Parallel spawns still bind by first-event order; see architect.md 2026-11-09.
8. Closed 2026-11-09: film owner split is in docs/REPO_MAP.md; `uiCamera.walkSpeed` row fixed in docs/TUNING.md.
