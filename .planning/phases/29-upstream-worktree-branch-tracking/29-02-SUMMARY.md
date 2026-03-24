---
phase: 29-upstream-worktree-branch-tracking
plan: "02"
subsystem: tui, workspace-ops
tags: [git, upstream-tracking, worktree, workspace-creation, openWorkspace]
dependency_graph:
  requires: [checkRemoteTrackingRef, checkBranchExistsOnRemote, hasUpstreamTracking, ensureUpstreamTracking]
  provides: [upstream-tracking-in-new, upstream-tracking-in-clone, upstream-tracking-in-tui, upstream-tracking-in-open]
  affects: [src/tui/workspace-wizard.ts, src/tui/workspace-clone.ts, src/tui/dashboard/App.tsx, src/lib/workspace-ops.ts]
tech_stack:
  added: []
  patterns: [parallel-promise-all, progress-callback, onProgress-pattern]
key_files:
  created: []
  modified:
    - src/tui/workspace-wizard.ts
    - src/tui/workspace-clone.ts
    - src/tui/dashboard/App.tsx
    - src/lib/workspace-ops.ts
    - tests/commands/workspace-edit.test.ts
    - tests/tui/workspace-wizard.test.ts
    - tests/tui/dashboard/integ-wizard.test.tsx
    - tests/tui/dashboard/integ-action-menu.test.tsx
    - tests/tui/dashboard/integ-sync-progress.test.tsx
    - tests/tui/dashboard/integ-tab-switching.test.tsx
decisions:
  - "Merged main branch into worktree branch at start — Plan 01 changes were in main but worktree was behind"
  - "Used ensureUpstreamTracking in parallel via Promise.all() in all 3 creation flows and openWorkspace"
  - "Silent tracking in TUI dashboard — no visual feedback added since row-based progress UI already shows status"
  - "Added ensureUpstreamTracking: mock(() => ({ tracked: false })) to 6 test mock modules for git"
metrics:
  duration: "8m"
  completed_date: "2026-03-24"
  tasks_completed: 2
  files_changed: 10
---

# Phase 29 Plan 02: Integrate Upstream Tracking into All Workspace Flows Summary

Wired `ensureUpstreamTracking()` from Plan 01 into all four workspace creation and open callsites so that worktrees automatically get upstream tracking when the branch exists on origin. After this plan, `git push` and `git pull` work without `--set-upstream` for branches that already exist on origin.

## Tasks Completed

| Task | Type | Description | Commit |
|------|------|-------------|--------|
| 1 | auto | Wire ensureUpstreamTracking into creation flows (wizard, clone, TUI) | a159ba3 |
| 2 | auto | Wire ensureUpstreamTracking into openWorkspace | a26ff12 |

## What Was Built

**Task 1 — Creation flows (3 files):**

`src/tui/workspace-wizard.ts` — After the worktree creation spinner stops, runs upstream tracking in parallel across all worktree repos:
```typescript
const trackingResults = await Promise.all(
  worktreeRepos.map(repo => ensureUpstreamTracking(repo.main_path, branch))
)
const tracked = trackingResults.filter(r => r.tracked)
if (tracked.length > 0) {
  p.log.info(`Upstream tracking set for ${tracked.length} repo(s)`)
}
```

`src/tui/workspace-clone.ts` — Same pattern, uses `newBranch` variable (not `branch`):
```typescript
const trackingResults = await Promise.all(
  worktreeRepos.map(repo => ensureUpstreamTracking(repo.main_path, newBranch))
)
```

`src/tui/dashboard/App.tsx` — Silent tracking after the worktree creation for-loop, using `createdWorktrees` array:
```typescript
await Promise.all(
  createdWorktrees.map(({ main_path }) => ensureUpstreamTracking(main_path, branch))
)
```
No visual feedback in TUI — the row-based progress view already shows worktree creation status.

**Task 2 — openWorkspace (1 file):**

`src/lib/workspace-ops.ts` — After the missing worktrees recreation block, before `buildBaseEnv()`:
```typescript
const worktreeReposForTracking = workspace.repos.filter(
  (r) => r.mode === "worktree" && existsSync(r.task_path)
)
if (worktreeReposForTracking.length > 0) {
  const trackingResults = await Promise.all(
    worktreeReposForTracking.map(repo =>
      ensureUpstreamTracking(repo.main_path, workspace.branch)
    )
  )
  const tracked = trackingResults.filter(r => r.tracked)
  if (tracked.length > 0) {
    onProgress?.(`Upstream tracking set for ${tracked.length} repo(s)`)
  }
}
```

Filters for `mode === "worktree"` AND `existsSync(r.task_path)` to skip trunk repos and repos with missing worktrees. Uses `onProgress?.()` callback to integrate with both CLI and TUI callers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree branch was behind main — Plan 01 changes not present**
- **Found during:** Pre-execution check
- **Issue:** The worktree branch `worktree-agent-a1a03942` had not received the Plan 01 commits that added `ensureUpstreamTracking` to `src/lib/git.ts`. The function was only in `main`.
- **Fix:** Merged `main` into the worktree branch (`git merge main --no-verify`) as a fast-forward. This brought in all Plan 01 changes before modifying the integration files.
- **Files modified:** All Plan 01 files via fast-forward merge
- **Commit:** Fast-forward merge (no explicit commit hash)

**2. [Rule 1 - Bug] Test mocks for @/lib/git missing ensureUpstreamTracking**
- **Found during:** Task 2 verification (test suite run)
- **Issue:** 6 test files mock `@/lib/git` or `../../../src/lib/git` with only the functions they explicitly needed, omitting `ensureUpstreamTracking`. After our changes added the import to production code, Bun's module mock system threw `SyntaxError: Export named 'ensureUpstreamTracking' not found` at test load time.
- **Fix:** Added `ensureUpstreamTracking: mock(async () => ({ tracked: false }))` to all 6 test file git mocks.
- **Files modified:** `tests/commands/workspace-edit.test.ts`, `tests/tui/workspace-wizard.test.ts`, `tests/tui/dashboard/integ-wizard.test.tsx`, `tests/tui/dashboard/integ-action-menu.test.tsx`, `tests/tui/dashboard/integ-sync-progress.test.tsx`, `tests/tui/dashboard/integ-tab-switching.test.tsx`
- **Commit:** a26ff12 (included in Task 2 commit)

## Known Stubs

None.

## Self-Check: PASSED

- `src/tui/workspace-wizard.ts` modified with ensureUpstreamTracking import and call: FOUND
- `src/tui/workspace-clone.ts` modified with ensureUpstreamTracking import and call: FOUND
- `src/tui/dashboard/App.tsx` modified with ensureUpstreamTracking import and call: FOUND
- `src/lib/workspace-ops.ts` modified with ensureUpstreamTracking import and call: FOUND
- Commit a159ba3 (Task 1 creation flows): FOUND
- Commit a26ff12 (Task 2 openWorkspace + test mocks): FOUND
- `grep -rn "ensureUpstreamTracking" src/` shows 4 files: FOUND (workspace-wizard.ts, workspace-clone.ts, App.tsx, workspace-ops.ts + definition in git.ts)
- `bun run typecheck`: clean (no errors)
- `bun test tests/`: 470 pass (up from 461 before this plan — 9 new passing tests from fixed mocks)
