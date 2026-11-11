---
id: T-0031-graphics-character-specialist
title: New specialist Graphics & Character, wired into the Agent Room
status: done
owner: architect
branch: task/T-0031-graphics-character-specialist
created: 2026-11-11
priority: P1
type: config_toolchain
source: request
---

# T-0031: New specialist Graphics & Character, wired into the Agent Room

## Spec

- Goal: a ninth specialist `graphics-character` ("Graphics & Character") owns the rendering of people: `src/traffic/people/**` (geometry, rig, shaders, materials, instancing). Traffic & Life keeps behaviour and simulation (`src/traffic/walkers/**`, `pedestrians.ts`, vehicles, `src/life/**`). The specialist has an agent definition, a handbook, a row in the ownership table, and a desk, colour, prop, label, hook mapping and replay support in the Agent Room, so its events show live like the other eight.
- Human decisions (2026-11-11, user in chat): creating the new specialist definition under `.claude/agents/` is approved (`.claude/` change). The pedestrian backlog T-0020 to T-0030 is approved with its order. No ADR is edited: ADR 0013 keeps "8 specialists" as its decision-time text; the handbook and the architect handbook record the ninth.
- Files in scope: `.claude/agents/graphics-character.md` (new), `docs/agents/graphics-character.md` (new), `docs/agents/README.md`, `docs/agents/traffic-life.md` (ownership split note), `docs/agents/architect.md` (update section), `docs/REPO_MAP.md`, `docs/TUNING.md` (owner column for people rows), `harness/README.md` (nine specialists), `src/agentRoom/**` (types, owners, hook, layout, palette, robotParts, DeskProps, engine state and sim), `tests/agentRoom*.test.ts`, `tests/agentRegistry.test.ts`, `tests/tuningParity.test.ts` (only if owner lists are asserted), `harness/tasks/backlog/T-00{20..30}-*.md` (owner fields, already set), `harness/state/claims.json`, `harness/briefs/T-0031-architect.md`.
- Out of scope: people rendering code, ADR files, `.github/`, dependencies, the sim or hook bridge protocol (`tools/agent-bridge/**` only if a slug list needs the new id).

## Acceptance

- [x] `npm run check`
- [x] `ownerOf('src/traffic/people/x.ts')` is `graphics-character`; `src/traffic/walkers/**` stays `traffic-life`
- [x] Hook mapping: `agent_type`/name `graphics-character`, "Graphics & Character", and registry entries bind to the new id; a `pedestrian` key still maps to traffic-life
- [x] Room: nine desks, no overlap with other furniture or the lead desk, nine seats/links work, replay and sim include the new agent, unit tests updated
- [x] Not verified, named: the room seen by eye (built-in pane cannot paint frames)

## Checkpoints

- 2026-11-11: user approved; record, brief and claims written; architect delegated.
- 2026-11-12: architect done, verify.mjs exit 0, reviewer pass. Landing by PR to dev.

## Handoff

- Next step: reviewer pass, land by PR to dev, then deliver T-0020.
- Open questions: none.

## Review

- Reviewer: reviewer (read-only subagent), diff range: working tree against 07d369d.
- Findings: 3 low (stale "eight specialists" in a dated architect entry; generic key `character`; ninth desk has no digit hotkey). All accepted, documented.
- Result: pass
