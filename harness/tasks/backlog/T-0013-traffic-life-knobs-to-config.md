---
id: T-0013-traffic-life-knobs-to-config
title: Traffic and life designer knobs move to config
status: proposed
owner: traffic-life
branch: dev
created: 2026-11-11
priority: P2
type: refactor
---

# T-0013: Traffic and life designer knobs move to config

## Spec

- Goal: knobs live only in src/config/tuning/ (CLAUDE.md). `docs/TUNING.md` lists 7 Traffic & Life rows as "stays in code" (density curve, walker turn rate and wait distance, life quality factor, headlight glow cap and others). For each row: move it to `src/config/tuning/trafficLife.ts` or `src/config/tuning/trafficWalkers.ts`, or mark it as a geometry or algorithm constant with a reason in the TUNING row.
- Source: `docs/agents/README.md`, open item 3.
- Files in scope: `src/traffic/**`, `src/life/**`, the two tuning files above, `tests/tuningParity.test.ts` (entries for moved knobs), `docs/TUNING.md` (Traffic & Life rows), `docs/agents/traffic-life.md`.
- Out of scope: values (no retune), audio and sky rows, layout hashes.

## Acceptance

- [ ] `npm run check`
- [ ] Every Traffic & Life row in `docs/TUNING.md` names a config key, or says why it is not a knob
- [ ] Seeded layout and traffic hashes unchanged
- [ ] Human check: none (values unchanged)

## Checkpoints

- 2026-11-11: recorded as proposed by the architect (T-0009 backlog seed). No work started.

## Handoff

- Next step: the improve skill picks it by priority; the lead writes the brief and the claims.
- Open questions: none.
