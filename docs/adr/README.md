# Architecture Decision Records

Each ADR records one decision: Context, Decision, Consequences. Status is Accepted, Superseded (by a later ADR) or Proposed. Do not edit an accepted decision in place; write a new ADR that supersedes it.

| No. | Title | Status |
|---|---|---|
| [0001](0001-specialist-ownership.md) | Specialist ownership of directories | Accepted |
| [0002](0002-procedural-assets.md) | Procedural assets; GLB files are the only binary exception | Accepted |
| [0003](0003-tuning-knobs-in-config.md) | Designer knobs live only in src/config/tuning/ | Accepted |
| [0004](0004-deterministic-layout.md) | Layout is deterministic; no Math.random in layout code | Accepted |
| [0005](0005-no-network-in-src.md) | No network calls in src | Accepted |
| [0006](0006-localstorage-ui-only.md) | localStorage only for per-viewer UI state | Accepted |
| [0007](0007-file-size-ratchet.md) | 350-line file limit enforced as a ratchet | Accepted |
| [0008](0008-commit-and-branch-workflow.md) | Commit only on user request; dev branch, PR to master when stable | Accepted |
| [0009](0009-harness-enforcement.md) | Rules are enforced by guards, hooks and CI | Accepted |
| [0010](0010-layering.md) | Dependency layers | Accepted |
| [0011](0011-feedback-loop-hook-check-ci.md) | Feedback loop is a hook, npm run check, and CI | Accepted |
| [0012](0012-lint-eslint.md) | ESLint; only passing rules are errors | Accepted |

See also: `docs/ARCHITECTURE.md`, `docs/CODING_STANDARDS.md`, `docs/HARNESS.md`.
