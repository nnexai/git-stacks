---
phase: 70-extract-remaining-domain-modules-and-workspace-ops-facade
plan: "01"
subsystem: workspace-status
tags: [extraction, refactoring, domain-modules]
dependency_graph:
  requires: []
  provides: [workspace-status.ts]
  affects: [workspace-ops.ts, workspace-lifecycle.ts, commands/workspace.ts, tui/dashboard/hooks/useWorkspaces.ts, lib/integrations/issue-utils.ts]
tech_stack:
  added: []
  patterns: [re-export-facade, domain-module-extraction]
key_files:
  created:
    - src/lib/workspace-status.ts
  modified:
    - src/lib/workspace-ops.ts
    - src/lib/workspace-lifecycle.ts
    - src/commands/workspace.ts
    - src/tui/dashboard/hooks/useWorkspaces.ts
    - src/lib/integrations/issue-utils.ts
decisions:
  - workspace-status.ts is a pure read-only query module with no subprocess spawning, so no _exec seam needed
  - getDirtyWorktrees moved from workspace-lifecycle.ts to workspace-status.ts; lifecycle imports it from status
  - workspace-ops.ts re-exports all status symbols as shims for test mock compatibility
  - Runtime callers updated to import directly from workspace-status per D-04/D-05 extraction rules
metrics:
  duration: "9 min"
  completed: "2026-04-05"
  tasks_completed: 2
  files_created: 1
  files_modified: 5
---

# Phase 70 Plan 01: Extract workspace-status.ts Summary

Extracted status/query functions from workspace-ops.ts into a focused `workspace-status.ts` domain module, moved `getDirtyWorktrees` out of workspace-lifecycle.ts, and updated all runtime callers to import directly from the new module.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create workspace-status.ts and move status functions | 925246a0 | src/lib/workspace-status.ts (created), src/lib/workspace-ops.ts, src/lib/workspace-lifecycle.ts |
| 2 | Update runtime callers to import from workspace-status directly | 089934fd | src/commands/workspace.ts, src/tui/dashboard/hooks/useWorkspaces.ts, src/lib/integrations/issue-utils.ts |

## What Was Built

`src/lib/workspace-status.ts` — new domain module containing:
- `WorkspaceListInfo` type + `getWorkspaceListInfo()` — per-workspace summary with dirty/ahead/behind info
- `RepoStatus` type + `getWorkspaceStatus()` — per-repo status within a workspace
- `getDirtyWorktrees()` — moved from workspace-lifecycle.ts
- `CwdDetectionResult` type + `detectWorkspaceFromCwd()` — CWD-based workspace detection
- `formatAge()` — private helper for human-readable age strings

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed leftover unused imports from Phase 69 extraction**
- **Found during:** Task 1 verification (typecheck)
- **Issue:** workspace-ops.ts had unused imports (`checkBranchExists`, `mergeNoFF`, `deleteLocalBranch`, `isFetchStale`, `warnExternalFiles`, `resolve`, `expandHome`) left over from Phase 69 when those functions were moved to workspace-lifecycle.ts. workspace-lifecycle.ts had unused `getRepoPath` and `isRepoDirty` left over from the same phase.
- **Fix:** Removed all unused imports from both files. Also restored `getMergeConflicts` to workspace-ops.ts git import after it was incorrectly removed (it's used in `syncWorkspace`).
- **Files modified:** src/lib/workspace-ops.ts, src/lib/workspace-lifecycle.ts
- **Commit:** 925246a0 (included in Task 1 commit)

## Verification Results

- `bun run typecheck` — exit 0
- `npx madge --circular src/` — no circular dependencies
- `bun run test` — unit tests PASS, integration tests 40/40 passed
- `grep -r "from.*workspace-ops" src/commands/workspace.ts` — no status function imports from workspace-ops

## Known Stubs

None.

## Threat Flags

None. This is a pure internal refactoring with no new trust boundaries, network surface, or filesystem writes.

## Self-Check: PASSED

- [x] src/lib/workspace-status.ts exists
- [x] Commit 925246a0 exists
- [x] Commit 089934fd exists
- [x] workspace-status.ts does NOT import from workspace-ops.ts
- [x] workspace-lifecycle.ts does NOT contain getDirtyWorktrees function body (imports it from workspace-status; call sites remain)
- [x] commands/workspace.ts imports status functions from workspace-status
