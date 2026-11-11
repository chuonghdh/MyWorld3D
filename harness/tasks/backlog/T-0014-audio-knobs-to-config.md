---
id: T-0014-audio-knobs-to-config
title: Audio designer knobs move to config
status: proposed
owner: audio
branch: dev
created: 2026-11-11
priority: P2
type: refactor
---

# T-0014: Audio designer knobs move to config

## Spec

- Goal: knobs live only in src/config/tuning/ (CLAUDE.md). `docs/TUNING.md` lists Audio rows as "stays in code" (dog bark range and interval, max barkers, ambient and owl intervals and others, mostly in `src/audio/animalsPure.ts`). For each row: move it to `src/config/tuning/audio.ts`, or mark it as an algorithm constant with a reason in the TUNING row.
- Source: `docs/agents/README.md`, open item 3.
- Files in scope: `src/audio/**`, `src/config/tuning/audio.ts`, `tests/tuningParity.test.ts` (entries for moved knobs), `docs/TUNING.md` (Audio rows), `docs/AUDIO.md`, `docs/agents/audio.md`.
- Out of scope: values (no retune), the bus graph, traffic and sky rows.

## Acceptance

- [ ] `npm run check`
- [ ] Every Audio row in `docs/TUNING.md` names a config key, or says why it is not a knob
- [ ] Audio tests unchanged and green
- [ ] Human check: none (values unchanged). Audio by ear is not verified unless done.

## Checkpoints

- 2026-11-11: recorded as proposed by the architect (T-0009 backlog seed). No work started.

## Handoff

- Next step: the improve skill picks it by priority; the lead writes the brief and the claims.
- Open questions: none.
