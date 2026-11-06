# ADR 0001: Specialist ownership of directories

Status: Accepted (2026-11-01, reaffirmed 2026-11-06)

## Context
Eight specialists (see `docs/agents/README.md`) work in parallel. Without owners, two agents edit the same file and the lead cannot review cross-area changes.

## Decision
Each source folder has one owning specialist, recorded in `docs/agents/README.md` and `docs/REPO_MAP.md`. Specialists keep a handbook in `docs/agents/` and are reused for new work instead of respawned. Shared code (`src/shaders/**`) has two owners plus an architect review. Two specialists never edit the same file at once.

## Consequences
- Cross-area work needs a named lead specialist and a brief that lists the files.
- Ownership is documented, not enforced by a guard. No test checks that a file has an owner (see `docs/HARNESS.md`, known gaps).
