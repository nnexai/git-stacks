---
phase: 58-ahead-behind-tracking
plan: 02
subsystem: workspace-ops
tags: [git, ahead-behind, workspace-status, tui, typescript]

requires:
  - phase: 58-01
    provides: getCommitsAhead and isFetchStale git primitives in src/lib/git.ts

provides:
  - Extended WorkspaceListInfo type with ahead, behind, aheadBehindStale fields
  - getWorkspaceListInfo computing ahead/behind aggregation across worktree repos
  - Extended TUI RepoStatus type with ahead and behind fields
  - Extended TUI WorkspaceStatus loaded state with aheadBehindStale field
  - getWorkspaceStatus computing per-repo ahead/behind for worktree repos
  - useWorkspaces propagating aheadBehindStale through WorkspaceStatus
  - Tests for ahead/behind aggregation (sum, max, trunk exclusion)

affects: [58-03, 58-04, workspace-ops, tui-dashboard]

tech-stack:
  added: []
  patterns:
    - "ahead=sum, behind=max aggregation across multi-repo workspaces"
    - "staleness=any-stale across worktree repos (OR aggregation)"
    - "trunk repos excluded from ahead/behind computation (always report 0/0)"

key-files:
  created: []
  modified:
    - src/lib/workspace-ops.ts
    - src/tui/dashboard/types.ts
    - src/tui/dashboard/hooks/useWorkspaces.ts
    - tests/lib/workspace-ops.test.ts

key-decisions:
  - "ahead aggregation is SUM across repos (total ahead commits in workspace)"
  - "behind aggregation is MAX across repos (worst-case sync debt)"
  - "staleness is OR across repos (any stale FETCH_HEAD taints whole workspace)"
  - "trunk repos always report 0/0 ahead/behind (not meaningful for trunk mode)"
  - "base branch from repo.base_branch ?? 'main', base ref is origin/baseBranch"

patterns-established:
  - "Per-repo metrics in parallel via Promise.all, then aggregate into workspace-level summary"
  - "WorkspaceListInfo aggregation and RepoStatus per-repo data are separate paths"

requirements-completed: [AB-02, AB-04]

duration: 25min
completed: 2026-04-03
---

# Phase 58 Plan 02: Ahead/Behind Data Layer Summary

**WorkspaceListInfo and RepoStatus/WorkspaceStatus extended with ahead/behind fields; aggregation logic (sum/max/any-stale) implemented across worktree repos with full test coverage**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-03T14:10:00Z
- **Completed:** 2026-04-03T14:35:00Z
- **Tasks:** 5
- **Files modified:** 4

## Accomplishments

- Extended `WorkspaceListInfo` type with `ahead: number`, `behind: number`, `aheadBehindStale: boolean`; `getWorkspaceListInfo` computes these via parallel `Promise.all` across worktree repos
- Extended TUI `RepoStatus` with `ahead`/`behind` and `WorkspaceStatus` loaded state with `aheadBehindStale`; `getWorkspaceStatus` returns per-repo ahead/behind values
- `useWorkspaces.ts` propagates `aheadBehindStale` by calling `isFetchStale` on each worktree repo
- Added 3 integration tests covering: single repo ahead count, multi-repo aggregation (sum/max), and trunk exclusion

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend WorkspaceListInfo type and update getWorkspaceListInfo** - `3a0ba48` (feat)
2. **Task 2: Extend TUI RepoStatus and WorkspaceStatus types** - `142bd21` (feat)
3. **Task 3: Update getWorkspaceStatus to compute per-repo ahead/behind** - `80c5047` (feat)
4. **Task 4: Update useWorkspaces.ts to propagate aheadBehindStale** - `64d058f` (feat)
5. **Task 5: Add workspace-ops tests for ahead/behind aggregation** - `fe64067` (test)

## Files Created/Modified

- `src/lib/workspace-ops.ts` - Added ahead/behind to WorkspaceListInfo type and computation in getWorkspaceListInfo; added ahead/behind to local RepoStatus and computation in getWorkspaceStatus
- `src/tui/dashboard/types.ts` - Extended RepoStatus with ahead/behind; extended WorkspaceStatus loaded variant with aheadBehindStale
- `src/tui/dashboard/hooks/useWorkspaces.ts` - Added isFetchStale import; fetchStatuses now computes and propagates aheadBehindStale
- `tests/lib/workspace-ops.test.ts` - Added describe("getWorkspaceListInfo — ahead/behind (AB-02)") with 3 test cases

## Decisions Made

- ahead = sum across repos (total ahead commits across all repos in workspace)
- behind = max across repos (worst-case sync debt; most meaningful for user)
- aheadBehindStale = OR across repos (if any repo FETCH_HEAD is stale, surface the indicator)
- trunk repos always 0/0 (trunk mode uses main clone directly, not meaningful to compare)
- base branch from `repo.base_branch ?? "main"`, ref is `origin/${baseBranch}`

## Deviations from Plan

**1. [Rule 1 - Bug] Fixed two-argument writeWorkspace call in test code**
- **Found during:** Task 5 (test authoring)
- **Issue:** Plan's test template called `writeWorkspace(wsName, {...})` with two args, but actual function signature is `writeWorkspace(workspace: Workspace)` — the string `wsName` was being used as the workspace object, so `workspace.name` was undefined and the file was written with an undefined path
- **Fix:** Changed all three test cases to use `writeWorkspace(WorkspaceSchema.parse({...}))` matching the existing test fixture pattern
- **Files modified:** tests/lib/workspace-ops.test.ts
- **Verification:** All 71 tests pass (previously 3 fail)
- **Committed in:** fe64067 (Task 5 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in plan test template)
**Impact on plan:** Necessary for test correctness. No scope creep.

## Issues Encountered

- Worktree was behind `main` at start — had to `git merge main` to get 58-01's `getCommitsAhead` and `isFetchStale` functions before proceeding. Fast-forward merge, no conflicts.

## Next Phase Readiness

- Data layer complete: `WorkspaceListInfo`, `RepoStatus`, and `WorkspaceStatus` all carry ahead/behind data
- Phase 58-03 (CLI display) and 58-04 (TUI display) can now consume these fields
- No blockers

---
*Phase: 58-ahead-behind-tracking*
*Completed: 2026-04-03*
