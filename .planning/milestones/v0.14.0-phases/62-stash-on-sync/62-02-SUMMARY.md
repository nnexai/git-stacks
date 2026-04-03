---
phase: 62-stash-on-sync
plan: 02
subsystem: sync
tags: [sync, cli, tui, stash]

requires:
  - phase: 62-stash-on-sync
    plan: 01
    provides: "git stash primitives"
provides:
  - "`syncWorkspace()` stash orchestration with restore-on-exit behavior"
  - "CLI `sync --stash` support and stash-pop recovery messaging"
  - "Dashboard auto-stash for dirty syncs"
  - "workspace-level stash integration coverage"
affects: []

tech-stack:
  added: []
  patterns:
    - "Stash restoration runs even when sync exits early after stashing"
    - "CLI, JSON, and TUI surfaces share the same stash-pop failure result shape"

key-files:
  created: []
  modified:
    - src/lib/workspace-ops.ts
    - src/commands/workspace.ts
    - src/tui/dashboard/App.tsx
    - src/tui/dashboard/SyncProgressView.tsx
    - tests/lib/workspace-ops.test.ts

key-decisions:
  - "Sync tracks stash-pop failures separately from sync skips so recovery commands stay copy-pasteable"
  - "Dashboard sync enables stash mode automatically only when dirty worktree repos are detected"

requirements-completed: [STH-03, STH-04]
completed: 2026-04-03
---

# Phase 62 Plan 02: Sync Integration Summary

**Integrated stash-on-sync across workspace sync, CLI output, dashboard progress, and workspace-level tests**

## Accomplishments

- Extended `SyncResult` and `SyncRow` for stash progress and stash-pop failure reporting
- Added double-stash guard, dirty-repo auto-stash, reverse-order restore, and restore-on-exit handling to `syncWorkspace()`
- Added CLI `--stash` support plus recovery messaging in human and JSON output paths
- Updated dashboard sync to auto-enable stash mode for dirty repos and display stash/popping progress states
- Added workspace-level stash tests covering restore, guard, pop failure, and clean-repo no-op behavior

## Files Created/Modified

- `src/lib/workspace-ops.ts`
- `src/commands/workspace.ts`
- `src/tui/dashboard/App.tsx`
- `src/tui/dashboard/SyncProgressView.tsx`
- `tests/lib/workspace-ops.test.ts`

## Self-Check: PASSED

- FOUND: `syncWorkspace(..., { stash: true })`
- FOUND: CLI `sync --stash`
- FOUND: dashboard stash-aware sync flow
- FOUND: stash integration tests
