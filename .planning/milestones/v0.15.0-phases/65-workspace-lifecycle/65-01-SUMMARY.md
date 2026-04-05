---
phase: 65-workspace-lifecycle
plan: "01"
subsystem: workspace-ops
tags: [dir-mode, type-guards, lifecycle, tdd]
dependency_graph:
  requires: [64-01]
  provides: [LIFE-01, LIFE-02, LIFE-03]
  affects: [workspace-ops.ts, tests/lib/workspace-ops.test.ts]
tech_stack:
  added: []
  patterns: [discriminated-union guards, non-null assertion after mode filter, task_path optional fallback]
key_files:
  created: []
  modified:
    - src/lib/workspace-ops.ts
    - tests/lib/workspace-ops.test.ts
decisions:
  - Used non-null assertion (!) for task_path in worktree-filtered loops rather than narrowing types — mode filter provides runtime guarantee, ! is explicit about the invariant
  - Added dir early-return in getWorkspaceStatus before the repoPath ternary to avoid passing undefined to existsSync
  - pullWorkspace adds dir repos to skipped list (consistent with trunk skip pattern) rather than silently ignoring them
  - Files-11 test failure in batch runner is a pre-existing mock pollution issue, not caused by these changes
metrics:
  duration: ~45min
  completed: "2026-04-04"
  tasks_completed: 2
  files_changed: 2
---

# Phase 65 Plan 01: Dir-Mode Guards for Workspace Lifecycle Summary

Dir-mode type guards added to all workspace lifecycle functions — workspaces containing `mode: "dir"` repos now flow through open/close/clean/remove/rename without TypeScript errors or runtime crashes, with dir repos excluded from all git operations.

## What Was Built

**Type changes in workspace-ops.ts:**
- `RepoStatus.mode` widened from `"trunk" | "worktree"` to `"trunk" | "worktree" | "dir"`
- `WorkspaceListInfo.dirCount: number` field added
- `WorkspaceListInfo.repoCount` updated to include dir repos
- `buildRepoEnv` parameter `task_path` made optional; `GS_REPO_PATH` falls back to `main_path`

**Runtime guards added:**
- `getWorkspaceListInfo`: dir repos filtered from dirty check and ahead/behind computation via `.filter((repo) => repo.mode !== "dir")`
- `getWorkspaceStatus`: early return for dir repos — returns `{ mode: "dir", dirty: false, branch: "—", ahead: 0, behind: 0, exists: existsSync(main_path) }`
- `getDirtyWorktrees`, `_executeClean`, `writeEnvFiles`: already filtered on `mode === "worktree"` — added `!` non-null assertions to satisfy TypeScript
- `openWorkspace` per-repo hooks: `repo.task_path ?? repo.main_path` fallback for cwd
- `openWorkspace` trunk checkout: `!repo.task_path ||` null guard before existsSync
- `renameWorkspace`: `repo.task_path &&` guard before includes/replace
- `pullWorkspace`: dir repos skipped with reason "dir"
- `detectWorkspaceFromCwd`: `!` assertion after `mode !== "worktree"` filter
- All `syncWorkspace` and `pushWorkspace` worktree loops: `!` assertions added

**Tests added (12 new tests in `describe("dir repo lifecycle")`):**
- `buildRepoEnv` with dir repo uses `main_path` as `GS_REPO_PATH`
- `buildRepoEnv` with worktree repo still uses `task_path`
- `getWorkspaceListInfo` mixed workspace returns correct `dirCount`/`repoCount`, no crash
- `getWorkspaceStatus` dir-only returns `mode: "dir"`, correct fields
- `getWorkspaceStatus` missing dir repo returns `exists: false`
- `getWorkspaceStatus` mixed workspace returns both dir and worktree statuses
- `writeEnvFiles` skips dir repos, only writes worktree repo env files
- `renameWorkspace` with dir repo completes without crash
- `closeWorkspace` dir-only workspace succeeds
- `cleanWorkspace` mixed workspace removes worktree, preserves dir
- `openWorkspace` mixed workspace succeeds, updates `last_opened`, no `.git` in dir repo
- `removeWorkspace` mixed workspace cascades clean/close, dir untouched

## Verification

All acceptance criteria met:
- `bun run typecheck` — zero errors in `src/lib/workspace-ops.ts`
- `bun test tests/lib/workspace-ops.test.ts` — 102 tests, 0 failures
- Grep checks:
  - `mode === "dir"` appears in `getWorkspaceStatus`, `getWorkspaceListInfo` (dirRepos filter), `pullWorkspace`
  - `mode !== "dir"` appears in dirty check and ahead/behind filters
  - `task_path?: string` in `buildRepoEnv`
  - `task_path ?? repo.main_path` in `buildRepoEnv` and `openWorkspace` hooks cwd
  - `repo.task_path &&` guard in `renameWorkspace`
  - `!repo.task_path ||` guard in trunk checkout section

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing guards] pullWorkspace dir repo handling**
- **Found during:** Task 1 typecheck
- **Issue:** `pullWorkspace` iterates all repos and resolves `repoPath = repo.mode === "worktree" ? repo.task_path : repo.main_path` — dir repos would silently fall through to the trunk branch, calling `isRepoDirty` and `pullFFOnly` on a non-git directory
- **Fix:** Added explicit dir early-return that skips dir repos with reason "dir" (consistent with trunk skip pattern)
- **Files modified:** `src/lib/workspace-ops.ts`
- **Commit:** a9e8cbdb

**2. [Rule 2 - Missing guards] detectWorkspaceFromCwd non-null assertion**
- **Found during:** Task 1 typecheck (line 1713)
- **Issue:** Already filtered `repo.mode !== "worktree"` continue, but `repo.task_path` still typed as optional — needs `!` assertion
- **Fix:** Added `repo.task_path!` non-null assertion after the mode guard
- **Files modified:** `src/lib/workspace-ops.ts`
- **Commit:** a9e8cbdb

### Pre-existing Issues (Not Fixed)

The following TypeScript errors exist in other files and predate this plan. They were caused by Phase 64 making `task_path` optional and were not introduced by this plan's changes:
- `src/commands/workspace.ts` (lines 105, 112, 363, 766) — task_path ternary without `!`
- `src/commands/doctor.ts` (line 134) — task_path usage without guard
- `src/lib/env.ts` (line 83) — task_path usage without guard
- `src/lib/files.ts` (lines 146, 149) — task_path usage without guard
- `src/lib/integrations/forge-utils.ts` (line 76) — task_path usage without guard
- `src/lib/intellij.ts` (line 48) — task_path usage without guard
- `src/lib/ports.ts` (line 148) — task_path usage without guard
- `src/lib/vscode.ts` (line 16) — task_path usage without guard
- `src/tui/dashboard/App.tsx` (line 440) — task_path usage without guard

These are deferred to Phase 66 (git-guards) or a dedicated cleanup task.

**Pre-existing test failure:** `tests/lib/files.test.ts > FILES-11` fails when run in the batch test runner due to mock pollution from `useIsolatedConfig` in `workspace-ops.test.ts` overriding the `@/lib/paths` module's `expandHome`. This failure existed before this plan's changes (confirmed by running the batch runner with changes stashed).

## Known Stubs

None — all dir repo handling is fully wired. Dir repos return concrete data (`exists`, `mode: "dir"`, zero-values for git fields) rather than placeholder values.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced. The `main_path` fallback in `buildRepoEnv` for dir repos was analyzed in the plan's threat model (T-65-01: accepted, same privilege level as trunk repos).

## Self-Check

Files created/modified:
- [FOUND] src/lib/workspace-ops.ts
- [FOUND] tests/lib/workspace-ops.test.ts
- [FOUND] .planning/phases/65-workspace-lifecycle/65-01-SUMMARY.md

Commits:
- a9e8cbdb — feat(65-01): add dir-mode type guards to workspace-ops.ts core functions

## Self-Check: PASSED
