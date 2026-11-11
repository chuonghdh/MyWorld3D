# ADR 0008: Commit only on user request; dev branch, PR to master when stable

Status: Accepted (2026-11-01). Superseded in part by ADR 0014 (2026-11-11): the commit rule.

## Context
Agents committing on their own create noise and unreviewed history. The user reviews what lands.

## Decision
- Commit only when the user asks. Commit messages, code comments and docs are in English. Commit messages carry the attribution line from the session instructions.
- Work happens on `dev`. A pull request to `master` opens only when the test suite is stable.

## Consequences
- Uncommitted work may sit in the tree across tasks. Specialists must not revert files they did not change.
- CI runs on pushes and pull requests to `dev` and `master` (ADR 0009).
