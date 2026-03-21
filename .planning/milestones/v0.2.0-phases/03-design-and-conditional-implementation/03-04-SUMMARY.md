---
phase: 03-design-and-conditional-implementation
plan: "04"
subsystem: workspace-lifecycle
tags: [migration, registry-model, workspace-ops, files, tmpl-04]
dependency_graph:
  requires: [03-01, 03-02, 03-03]
  provides: [workspace-lifecycle-registry-model, trunk-base-branch-accessibility]
  affects: [src/lib/workspace-ops.ts, src/lib/files.ts]
tech_stack:
  added: []
  patterns: [registry-model, workspace-self-contained-snapshot, trunk-base-branch-checkout-fallback]
key_files:
  created: []
  modified:
    - src/lib/workspace-ops.ts
    - src/lib/files.ts
    - tests/lib/files.test.ts
    - tests/lib/workspace-ops.test.ts
decisions:
  - "mergeEnv and writeEnvFiles simplified to workspace-only — template env snapshot-copied at creation time, no stacks needed at open time"
  - "TMPL-04: trunk repo base branch accessibility uses checkout first, worktree creation as fallback, warning-only on both failures — graceful degradation"
  - "syncWorkspace drops per-repo sync_strategy (was on StackRepo); defaults to rebase — can be added to WorkspaceRepoSchema if needed"
  - "applyFileOpsForRepo and applyFileOpsForWorkspace now accept generic FileOpsRepoSource/FileOpsWorkspaceSource interfaces instead of StackRepo/Stack types"
  - "warnExternalFiles collects file entries directly from workspace.files and workspace.repos[i].files — no stacks map needed"
metrics:
  duration: 6 min
  completed: "2026-03-18"
  tasks_completed: 2
  files_changed: 4
---

# Phase 03 Plan 04: Workspace-Ops Registry Migration Summary

Migrated `workspace-ops.ts` and `files.ts` from the Stack model to the Registry/Workspace model. Workspace lifecycle functions (open, clean, remove, merge, rename, sync) now operate entirely on workspace data without Stack references.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Migrate workspace-ops.ts to Registry model | 9c9f90e | src/lib/workspace-ops.ts |
| 2 | Decouple files.ts from Stack model | 289e491 | src/lib/files.ts, tests/lib/files.test.ts, tests/lib/workspace-ops.test.ts |

## What Was Built

### workspace-ops.ts (Task 1)

Full migration of all workspace lifecycle functions:

- Removed `loadWorkspaceStacks()` function entirely
- `mergeEnv(workspace)` — simplified, workspace env only (no stacks param)
- `writeEnvFiles(workspace, mergedEnv, onWarn?)` — simplified, `env_file` from workspace only
- `runPreRemoveHooks()` — uses `workspace.hooks.pre_remove` only (no stack hooks)
- `cleanWorkspace()` — calls `warnExternalFiles(workspace, wsDir, tasksDir)` (3 args)
- `removeWorkspace()` — same update
- `mergeWorkspace()` — resolves `baseBranch` from `repo.base_branch ?? "main"`
- `openWorkspace()` — per-repo file ops from `workspace.repos[i].files`; workspace file ops from `workspace.files`; no stack-level post_open loop
- `syncWorkspace()` — resolves `baseBranch` from `repo.base_branch ?? "main"`; defaults strategy to "rebase"
- Removed `@ts-nocheck` pragma — file is now fully typed

**TMPL-04 implementation** in `openWorkspace()`: For each trunk-mode repo, after worktree recreation:
1. Get current branch via `getCurrentBranch`
2. If not on `repo.base_branch ?? "main"`: attempt `git checkout <expected>`
3. If checkout fails: attempt `createWorktree` at `<name>-<branch>` path inside tasks dir
4. If both fail: emit warning and continue (graceful degradation)

### files.ts (Task 2)

- Added `FileOpsRepoSource` interface (`{ name?, path, files? }`) replacing `StackRepo` param
- Added `FileOpsWorkspaceSource` interface (`{ files? }`) replacing `Stack` param
- `applyFileOpsForRepo(source: FileOpsRepoSource, wsRepo)` — generic source interface
- `applyFileOpsForWorkspace(source: FileOpsWorkspaceSource, workspace, wsInstanceRoot)` — generic source interface
- `warnExternalFiles(workspace, wsDir, tasksDir)` — 3 params, collects from `workspace.files` and `workspace.repos[i].files` directly
- Removed `StackRepo`, `Stack` type imports
- Updated `applyFileOperations` deprecated shim to use `FileOpsRepoSource`

### Test updates (Task 2 deviation — Rule 1)

- `tests/lib/files.test.ts` — updated to use `FileOpsRepoSource`, `FileOpsWorkspaceSource` interfaces; updated `warnExternalFiles` calls to 3-arg form; removed `Stack`, `StackRepo` imports and `makeStack` helper
- `tests/lib/workspace-ops.test.ts` — updated fixture to use `repo` field (not `stack`); removed `StackSchema`, `writeStack`, `stackPath` imports; replaced `uniqueStackName` with `uniqueRegistryName`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated workspace-ops.test.ts to remove StackSchema dependency**
- **Found during:** Task 2 — running full test suite revealed `StackSchema` import failure
- **Issue:** `tests/lib/workspace-ops.test.ts` imported `StackSchema`, `writeStack`, `stackPath` from config.ts and used `repo.stack` field — all removed in Plan 03-01
- **Fix:** Updated fixture to use `WorkspaceRepoSchema` with `repo` field; replaced `writeStack`/`StackSchema` with `writeWorkspace`/`WorkspaceSchema`; renamed `uniqueStackName` to `uniqueRegistryName`
- **Files modified:** `tests/lib/workspace-ops.test.ts`
- **Commit:** 289e491

**2. [Rule 1 - Bug] Updated files.test.ts to remove Stack/StackRepo type imports**
- **Found during:** Task 2 — tests used old `StackRepo`, `Stack` types and old 4-param `warnExternalFiles`
- **Fix:** Updated all tests to use `FileOpsRepoSource`, `FileOpsWorkspaceSource` interfaces; removed `makeStack` helper; updated `warnExternalFiles` calls to 3-arg form; updated `makeWorkspace` to use `repo` field
- **Files modified:** `tests/lib/files.test.ts`
- **Commit:** 289e491

## Verification

```
grep -rn "readStack|loadWorkspaceStacks|StackSchema|StackRepo\b" src/lib/workspace-ops.ts src/lib/files.ts
# Returns 0 matches (only comments in files.ts)

bun test tests/lib/files.test.ts
# 31 pass, 0 fail

bun test tests/
# 142 pass, 0 fail
```

## Self-Check

- [x] `src/lib/workspace-ops.ts` exists and has no Stack references
- [x] `src/lib/files.ts` exists and has no Stack/StackRepo type imports
- [x] Commit 9c9f90e exists (workspace-ops migration)
- [x] Commit 289e491 exists (files.ts and test updates)
- [x] All 142 tests pass
