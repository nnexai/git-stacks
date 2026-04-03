---
phase: 58-ahead-behind-tracking
plan: 03
subsystem: cli
tags: [git, ahead-behind, worktrees, status, list, fetch]

# Dependency graph
requires:
  - phase: 58-ahead-behind-tracking
    plan: 01
    provides: "getCommitsAhead, isFetchStale primitives in git.ts"
  - phase: 58-ahead-behind-tracking
    plan: 02
    provides: "WorkspaceListInfo.ahead/behind/aheadBehindStale; RepoStatus.ahead/behind in workspace-ops.ts"
provides:
  - "git-stacks list shows ↑N/↓N inline after branch name with ? stale suffix"
  - "git-stacks list JSON includes ahead/behind/aheadBehindStale fields"
  - "git-stacks status shows per-repo ↑N/↓N columns for worktree repos; — for trunk"
  - "git-stacks status --fetch fetches origin before computing ahead/behind"
  - "git-stacks status JSON includes ahead/behind fields per repo"
affects: [58-04-tui-display, release-prep]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-09 hide zeros: show ahead/behind only when > 0, hide completely when 0"
    - "D-04 stale suffix: append ? to ahead/behind when FETCH_HEAD is stale"
    - "Dynamic import of concurrency.ts inside action handler to avoid top-level import overhead"

key-files:
  created: []
  modified:
    - src/commands/workspace.ts

key-decisions:
  - "Trunk repos display — in status text output rather than 0/0 — trunk branches don't track remote progress meaningfully"
  - "fetchOrigin deduplicates by main_path so same remote is not fetched twice when multiple worktrees share a clone"

patterns-established:
  - "abStr pattern: build array of non-zero parts, join with space, padEnd for column alignment"
  - "fetch dedup: collect repos, deduplicate by main_path, then mapLimited with concurrency 3"

requirements-completed: [AB-03, AB-04]

# Metrics
duration: 2min
completed: 2026-04-03
---

# Phase 58 Plan 03: CLI Display Summary

**`git-stacks list` and `git-stacks status` now show ↑N/↓N ahead/behind indicators with stale-? suffix and optional --fetch for fresh counts**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-03T14:10:17Z
- **Completed:** 2026-04-03T14:12:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- `git-stacks list` inserts `↑N/↓N` column between branch and repo count; hides both if 0/0 (D-09); appends `?` suffix when FETCH_HEAD is stale (D-04)
- `git-stacks list --json` automatically includes `ahead`, `behind`, `aheadBehindStale` from WorkspaceListInfo
- `git-stacks status` shows per-repo ahead/behind for worktree repos, `—` for trunk repos
- `git-stacks status --fetch` fetches origin before computing, deduplicating by main_path with concurrency 3
- `git-stacks status --json` includes `ahead` and `behind` per repo

## Task Commits

Each task was committed atomically:

1. **Task 1: Update git-stacks list output with ahead/behind indicators** - `e3183fa` (feat)
2. **Task 2: Add --fetch flag and ahead/behind to git-stacks status output** - `d33e72f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/commands/workspace.ts` - list output: ↑N/↓N columns; status: --fetch flag, ahead/behind text + JSON output

## Decisions Made

- Trunk repos show `—` in status text rather than `0  0` because trunk-mode repos don't track per-branch ahead/behind meaningfully
- fetch deduplication keyed on `main_path` prevents double-fetching when multiple worktrees share the same underlying clone

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - typecheck passed cleanly on all modified files. The pre-existing type error in `src/tui/dashboard/App.tsx` (line 1313, staleness prop mismatch) was introduced by the parallel 58-04 agent and is out of scope for this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CLI list and status display complete with ahead/behind indicators
- Wave 2 is fully complete after 58-04 (TUI WorkspaceRow) — both parallel plans done
- Ready for Phase 59 (push with dry-run ahead-count messaging)

## Self-Check: PASSED

- `src/commands/workspace.ts` — FOUND
- `.planning/phases/58-ahead-behind-tracking/58-03-SUMMARY.md` — FOUND
- Commit `e3183fa` (feat: list ahead/behind) — FOUND
- Commit `d33e72f` (feat: status --fetch + ahead/behind) — FOUND

---
*Phase: 58-ahead-behind-tracking*
*Completed: 2026-04-03*
