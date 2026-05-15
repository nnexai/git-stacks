---
status: complete
phase: quick
plan: 260404-atz
subsystem: workspace-ops, commands
tags: [trunk-repos, dirty-check, ahead-behind, status-command]
dependency_graph:
  requires: []
  provides: [trunk-repos-in-dirty-checks, trunk-repos-in-ahead-behind, trunk-repos-in-status-display]
  affects: [getWorkspaceListInfo, getWorkspaceStatus, status-command]
tech_stack:
  added: []
  patterns: [discriminated-path-resolution-by-mode]
key_files:
  created: []
  modified:
    - src/lib/workspace-ops.ts
    - src/commands/workspace.ts
    - tests/lib/workspace-ops.test.ts
decisions:
  - Trunk repos compare HEAD vs origin/<currentBranch> (tracking branch semantics, not base_branch)
  - Dirty check uses main_path for trunk repos (semantically correct vs task_path alias)
  - Unified display: no special-casing for trunk in status output, "---" removed
metrics:
  duration: ~12m
  completed: 2026-04-04
  tasks_completed: 2
  files_changed: 3
---

# Phase quick Plan 260404-atz: Fix dirty/ahead-behind checks to include trunk repos — Summary

**One-liner:** Trunk repos now participate in dirty checks, ahead/behind computation (vs origin/<currentBranch>), fetch, and status display alongside worktree repos.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 (RED) | Failing tests for trunk repo dirty/ahead-behind | 6239331 | Done |
| 1 (GREEN) | Update getWorkspaceListInfo and getWorkspaceStatus | 0dabd9a | Done |
| 2 | Update status command fetch handler and display | 53b325e | Done |

## What Was Built

### getWorkspaceListInfo (src/lib/workspace-ops.ts)

Previously filtered to worktree repos only for both dirty checks and ahead/behind computation. Now iterates `workspace.repos` (all repos). Path resolution: `repo.mode === "worktree" ? repo.task_path : repo.main_path`. For trunk repos, `getCurrentBranch(repoPath)` is called to determine the tracking ref (`origin/<currentBranch>`).

### getWorkspaceStatus (src/lib/workspace-ops.ts)

Removed the `repo.mode === "worktree"` guard on dirty/branch computation and the separate worktree-only ahead/behind block. All repos now get `isRepoDirty` + `getCurrentBranch` + `getCommitsAhead`/`getCommitsBehind` called with the resolved path. Trunk repos use `origin/${branch}` (current branch from `getCurrentBranch`) as the baseRef.

### Status command (src/commands/workspace.ts)

- Fetch handler: replaced `.filter(r => r.mode === "worktree" && existsSync(r.task_path))` with `.filter(r => existsSync(r.mode === "worktree" ? r.task_path : r.main_path))` — includes trunk repos
- Display: removed `if (repo.mode === "worktree")` guard and `abParts.push("—")` trunk fallback; all repos use the same ahead/behind display logic

## Tests Added

New describe block "getWorkspaceStatus — trunk repos" with 3 tests:
- `trunk repo dirty=true when has uncommitted changes`
- `trunk repo shows real branch name (not ---)`
- `trunk repo ahead/behind computed against origin/<currentBranch>`

Renamed "trunk repos are excluded from ahead/behind" to "trunk repos included in ahead/behind via tracking branch" and updated to assert `info.ahead === 1` (local commit not pushed). Added "trunk repo dirty state included in dirtyRepos" test.

## Verification

- `bun run typecheck` — passes
- `bun test tests/lib/workspace-ops.test.ts` — 90 pass, 0 fail (5 new trunk tests all green)
- `bun run src/index.ts status --help` — shows --fetch option

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `src/lib/workspace-ops.ts` — exists, modified
- `src/commands/workspace.ts` — exists, modified
- `tests/lib/workspace-ops.test.ts` — exists, modified
- Commits 6239331, 0dabd9a, 53b325e — all exist in git log
