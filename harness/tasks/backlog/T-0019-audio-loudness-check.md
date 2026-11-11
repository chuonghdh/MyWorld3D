---
id: T-0019-audio-loudness-check
title: Automated loudness check for the audio mix
status: proposed
owner: audio
branch: dev
created: 2026-11-11
priority: P3
type: feature
---

# T-0019: Automated loudness check for the audio mix

## Spec

- Goal: audio is checked by tests and by ear only (`harness/README.md`, known gaps). Add a test that renders a fixed scene snapshot through the bus with the fake audio helpers, or sums the gain chain analytically, and fails when the master level leaves a stated range or a category is silent at its default volume.
- Source: `harness/README.md`, known gaps.
- Files in scope: a new audio test under tests/ (name starts with audio), `tests/helpers/fakeAudio.ts`, `docs/AUDIO.md`, `docs/agents/audio.md`. A new threshold is a knob: `src/config/tuning/audio.ts`, a parity entry and a `docs/TUNING.md` row.
- Out of scope: the mix itself (no retune), real-device listening.

## Acceptance

- [ ] `npm run check`
- [ ] The test fails when a category default is set to 0 (shown once, then reverted)
- [ ] Human check: by ear in the browser stays not verified unless done

## Checkpoints

- 2026-11-11: recorded as proposed by the architect (T-0009 backlog seed). No work started.

## Handoff

- Next step: the improve skill picks it by priority; the lead writes the brief and the claims.
- Open questions: none.
