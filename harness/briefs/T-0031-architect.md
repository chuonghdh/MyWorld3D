# Brief: T-0031 (architect)

- **Task id:** T-0031-graphics-character-specialist
- **Owner:** architect
- **Reviewer:** reviewer (read-only subagent)
- **Goal:** a ninth specialist `graphics-character` ("Graphics & Character") exists and is wired everywhere the other eight are, including the Agent Room (desk, colour, label, prop, hook mapping, registry, replay, sim, tests). See the task record Spec.
- **Files in scope:** see the task record (Files in scope). Mirror every place that lists the eight specialists: grep `ui-camera` and `scene-qa` across `src/agentRoom`, `tests`, `docs`, `harness`, `.claude`, `tools`.
- **Files out of scope:** `src/traffic/**` code, ADRs, `.github/`, dependencies.
- **Claims:** architect entry for T-0031 in harness/state/claims.json (active).
- **Acceptance commands:** `npx tsc --noEmit`; `npm run lint`; `npx vitest run tests/agentRoom*.test.ts tests/agentRegistry.test.ts tests/harness.test.ts tests/delivery.test.ts tests/tuningParity.test.ts`; `node harness/scripts/validate-task.mjs`; `node harness/scripts/check-claims.mjs`; `node harness/scripts/drift-check.mjs`. Failures only.
- **Report format:** at most 10 lines: files changed, gate result (failures only), not verified.

## Steps

1. `.claude/agents/graphics-character.md`: copy the shape of `.claude/agents/traffic-life.md` (same rules, same report). Description: character and people rendering (geometry, rig, vertex and fragment shaders, LOD, instancing); owned `src/traffic/people/**`. Add: coordinate gait/phase data with Traffic & Life through the lead; perf budget rule (no draw-call or triangle regression without the brief naming it).
2. `docs/agents/graphics-character.md`: handbook per the template (Owns, Key files, Conventions, Traps, Decisions, Open items, Verify). Seed it from the research: flat-shaded procedural rig in `rigShaderGlsl.ts`; 4 instanced meshes; 350-480 triangles per person incl. hidden parts; phase formula `uTime*omega+phase` pops when omega changes; near-coplanar face quads; frozen idle; rejected ideas (2K/4K textures, blendshapes, skinning) with reasons; backlog T-0020..T-0030 and order. Keep it under 120 lines.
3. Ownership split: `docs/agents/README.md` (nine specialists, table row 9 or renumber, `src/traffic/people/**` moves out of Traffic & Life), `docs/agents/traffic-life.md` (note the split, people items now point to the new handbook), `docs/REPO_MAP.md`, `harness/README.md` line about eight specialists, `docs/TUNING.md` owner column for the people/child gait rows (config stays in `trafficLife.ts`; owner text becomes Graphics & Character where the code lives in `src/traffic/people/`). Do not edit ADR files.
4. Agent Room code: add `'graphics-character'` to `AgentId` (types.ts), `OWNERSHIP` (owners.ts: `['src/traffic/people/', 'graphics-character']` BEFORE `['src/traffic/', ...]`; also tests/people files? no, keep tests with the owner of the old table unless the README says otherwise), `AGENT_IDS`, hook.ts `NAMES` (graphics & character, graphics-character, graphics and character) and `KEYS` (only unambiguous words such as shader, rig; `pedestrian` stays traffic-life), `ALL_AGENTS` (state.ts), `SPECIALISTS` and `DEMO_PATHS` (sim.ts), layout.ts `SPECIALISTS` plus a ninth desk slot, palette colour and label, `robotParts.ts` head prop, `DeskProps.tsx` desk prop. Pick a colour that differs from the other eight and passes any contrast test.
5. Room layout: today 4 columns x 2 rows = 8 slots (`DESK_SLOTS`). Add a ninth slot without overlap with the lead desk (x 3.0, z -5.2), the board, the discuss table (`DISCUSS`, `SEAT_COUNT`) or the aisle. If seats around the discuss table are a fixed count, check that nine specialists plus the lead still fit (raise the seat count in the tuning section if that is a knob; keep parity test and TUNING row in step). Camera framing: check the room still frames all desks (see the camera/fit constants).
6. Realtime capture: confirm `tools/agent-bridge/**` and `.claude/settings.json` hooks need no id list (they should be id-agnostic). If any list needs the id, add it. Registry binding by `name` = slug must work (`tests/agentRegistry.test.ts`: add an entry and an expected mapping). Add a mapper test: a subagent with `agent_type` graphics-character, a `SendMessage` to it, and a file edit under `src/traffic/people/` attributed to it.
7. Update tests that assert the roster (`tests/agentRoomOwners.test.ts` ROWS list, mapping, replay, registry) and add a layout test: nine desks, pairwise distinct, none within the lead-desk and board footprint.
8. `docs/agents/architect.md`: "Update 2026-11-11 (T-0031)" section, 3 to 6 lines.

## Traps

- `tests/harness.test.ts` and drift-check: write a backticked path only when the file exists at the end.
- The ownership table is first-match: the narrower prefix must come first.
- Some AgentId lists are `Record<AgentId, ...>`: tsc will point at every one that is missing. Fix all.
- Do not change the bridge/event vocabulary; the new id rides the existing events.
- Windows host: `node` and `npm` only.
