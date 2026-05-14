---
phase: 81-workspace-and-git-operation-e2e-coverage
plan: 03
subsystem: tests
tags: [e2e, lifecycle, guards, workspace]

requires:
  - phase: 81-01
    provides: "shared E2E fixture helpers"
provides:
  - "Workspace lifecycle CLI side-effect coverage"
  - "Workspace guard CLI behavior coverage"

key-files:
  created:
    - tests/commands/workspace-lifecycle.test.ts
    - tests/commands/workspace-guards.test.ts
  modified: []

key-decisions:
  - "Locked current close semantics: close runs integration cleanup/hooks and preserves worktrees/YAML"
  - "Tested clean/remove destructive behavior with --force to avoid interactive prompt gates"
  - "Guard tests assert non-force destructive commands do not mutate state when confirmation is not granted"
  - "Rename list assertion uses list --json so branch names containing the old workspace name do not create false failures"

requirements-completed: [E2E-08, E2E-14]

completed: 2026-05-14
tasks: 2
---

# Phase 81 Plan 03: Workspace Lifecycle and Guard Coverage Summary

Workspace lifecycle and guard behavior are covered through real CLI subprocess tests against disposable git repositories and workspace YAML fixtures.

## Accomplishments

- Added `tests/commands/workspace-lifecycle.test.ts` with 13 tests covering:
  - `open --no-ide --no-cmux`
  - post-open hook execution
  - `close` current behavior
  - `clean --force` and `clean --dry-run`
  - `remove --force`, `remove --dry-run`, and list disappearance after removal
  - `rename --force`, list visibility after rename, and `rename --dry-run`
- Added `tests/commands/workspace-guards.test.ts` with 12 tests covering:
  - dirty worktree non-force behavior and force overrides
  - missing `task_path` status/clean/remove handling
  - trunk-mode status and clean skip behavior
  - non-existent workspace errors for status/close/remove

## Task Commits

1. `6ee6072` - `test(81-03): cover workspace lifecycle commands`
2. `ef79fec` - `test(81-03): cover workspace guard behavior`

## Verification

- `bun test tests/commands/workspace-lifecycle.test.ts` - 13 pass, 0 fail
- `bun test tests/commands/workspace-guards.test.ts` - 12 pass, 0 fail
- `bun run typecheck` - passed
- `bun run test:integ` - Integration tests 55/55 passed

## Deviations From Plan

- The plan described `close` as removing worktrees. Current implementation preserves worktrees and only performs close hooks/integration cleanup, so the E2E test locks current behavior.
- Non-force `clean` and `remove` hit interactive confirmation before dirty checks in non-TTY subprocesses. Guard tests verify no destructive mutation without force, and verify `--force` destructive behavior against dirty real worktrees.

## Issues Encountered

None.

## Next Phase Readiness

Plan 81-04 can build on the same remote-backed fixtures to cover merge, pull, sync, push, and status fetch behavior.

## Self-Check: PASSED

- Lifecycle side effects are asserted on filesystem and YAML state.
- Guard coverage uses real git state and missing-path fixtures.
- Full integration suite passes.
