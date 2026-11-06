# Agent instructions (MyWorld3D)

For agent tools other than Claude Code. The same rules live in `CLAUDE.md`.

## Read first
1. `CLAUDE.md` (rules, verify commands, output style)
2. `docs/REPO_MAP.md` (where code lives, owners)

## Then, as needed
- `docs/ARCHITECTURE.md`: layers, data flow, determinism, rendering budget
- `docs/CODING_STANDARDS.md`: TypeScript, naming, file size, knobs, shaders
- `docs/adr/README.md`: accepted decisions (ADRs 0001 to 0011)
- `docs/HARNESS.md`: guards, hooks, check script, CI
- `docs/TUNING.md`: designer knobs and where they live
- `docs/AUDIO.md`: audio routing
- `docs/agents/README.md`: specialist owners and handbooks

## Core rules
- Chat in Vietnamese. Code, docs and commits in English.
- Commit only when the user asks. Work on `dev`.
- Knobs only in `src/config/tuning/`. No `Math.random` in layout code. No network calls in `src`.
- Never weaken a guard test to pass. Fix the code.
- Before reporting: `npm run check`. Print only failures.
