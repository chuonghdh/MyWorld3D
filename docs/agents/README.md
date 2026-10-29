# Specialist agents

MyWorld3D is built by a small, fixed team of specialists coordinated by the lead (the main Claude session).
Each specialist owns directories, keeps a handbook in this folder, and is **reused** for every new task in its area
instead of spawning a fresh agent. That way what it learned (traps, decisions, conventions) carries over.

| # | Specialist | Owns | Handbook |
|---|---|---|---|
| 1 | Buildings | `src/buildings/**` | [buildings.md](buildings.md) |
| 2 | City & Streets | `src/city/**`, `src/streets/**` | [city-streets.md](city-streets.md) |
| 3 | Traffic & Life | `src/traffic/**`, `src/life/**` | [traffic-life.md](traffic-life.md) |
| 4 | Sky & Environment | `src/sky/**`, `src/environment/**`, `src/weather/**`, `src/aircraft/**` | [sky-environment.md](sky-environment.md) |
| 5 | Audio | `src/audio/**`, `src/ui/SoundMixer.tsx`, `docs/AUDIO.md` | [audio.md](audio.md) |
| 6 | UI & Camera | `src/ui/**` (except SoundMixer), `src/store/**`, `src/scene/CameraRig.tsx`, `cameraMath.ts`, `Selection.tsx`, `selectionMath.ts` | [ui-camera.md](ui-camera.md) |
| 7 | Scene & QA | `src/scene/**` (rest), `src/core/**`, `tests/helpers/**`, perf budgets, docs | [scene-qa.md](scene-qa.md) |

## Rules for the lead

1. **Reuse, do not respawn.** Send follow-up work to the specialist that owns the area with `SendMessage`. Spawn a new
   agent only when the specialist is gone from the session, and then paste its handbook into the brief.
2. **Disjoint files.** Two specialists never edit the same file at once. A cross-cutting feature gets one lead specialist
   who may touch a few files outside its area (name them in the brief and report them back).
3. **Briefs are complete.** Name the files, the acceptance checks and what must not change (visual quality, draw calls,
   determinism). The specialist reads its handbook first.
4. **Handbook upkeep.** At the end of every task the specialist appends what it learned to its handbook:
   new traps, decisions with the reason, and what is left undone. The lead reviews that diff.
5. **Dashboard upkeep.** The "MyWorld3D Agent Office" dashboard shows one card per specialist. The lead updates its
   status when a task is assigned, started and finished, and adds an event to the log.
6. **Verification before reporting.** `npx tsc --noEmit`, `npx vitest run`, `npx vite build`. The built-in browser pane
   cannot paint frames: check the scene graph, uniforms, shader compile (force a render in a standalone renderer) and
   console errors, and say plainly what was not seen by eye.
7. **Project rules.** Commits, code comments and docs are in English. Commit only when the user says so. Root-cause
   fixes, no coplanar geometry, no loss of visual quality or performance.

## Handbook template

```
# <Specialist>
Owns / Key files / Conventions / Traps (what bit us, why) / Decisions (and the reason) / Open items / How to verify
```
