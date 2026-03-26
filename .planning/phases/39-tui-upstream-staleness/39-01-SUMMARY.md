---
phase: 39-tui-upstream-staleness
plan: 01
subsystem: ui
tags: [solid-js, opentui, git-fetch, tui-dashboard, staleness-cache]

requires:
  - phase: 37-tui-dashboard
    provides: Dashboard workspace detail pane, useWorkspaces/useMessages hook patterns

provides:
  - useStaleness SolidJS hook with TTL-cached per-repo upstream commit counting
  - Staleness badge rendering in WorkspaceDetail (behind/loading/error/no-tracking states)
  - Cursor-triggered fetch and r-key cache invalidation in App.tsx

affects: [tui-dashboard, workspace-detail]

tech-stack:
  added: []
  patterns: [on-demand fetch with TTL cache, Promise.allSettled for concurrent git ops]

key-files:
  created:
    - src/tui/dashboard/hooks/useStaleness.ts
  modified:
    - src/tui/dashboard/WorkspaceDetail.tsx
    - src/tui/dashboard/App.tsx

key-decisions:
  - "Fetch is on-demand per workspace focus, not global background poll — avoids unnecessary network calls"
  - "Cache keyed by main_path with 5-minute TTL — deduplicates repos shared across workspaces"
  - "Badge states use sibling <text> in <box flexDirection='row'> per OpenTUI no-nested-text rule"

patterns-established:
  - "On-demand staleness pattern: fetch on focus, cache with TTL, invalidate on manual refresh"

requirements-completed: [STALE-01, STALE-02, STALE-03, STALE-04, STALE-05]

duration: 8min
completed: 2026-03-26
---

# Phase 39: TUI Upstream Staleness Summary

**Per-repo "N behind" badges in dashboard workspace detail with 5-minute TTL cache, cursor-triggered fetch, and r-key force refresh**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-26T19:40:00Z
- **Completed:** 2026-03-26T19:48:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Created `useStaleness` hook with in-memory Map cache, 5-min TTL, concurrent fetch via Promise.allSettled
- Added per-repo staleness badges to WorkspaceDetail with 5 visual states: behind (yellow), loading (gray ...), error (red ?), up-to-date (hidden), no-tracking (hidden)
- Wired cursor-triggered fetch via createEffect and r-key cache invalidation in App.tsx

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useStaleness hook** - `a743d7d` (feat)
2. **Task 2: Add staleness badges to WorkspaceDetail** - `28711d0` (feat)
3. **Task 3: Wire useStaleness into App.tsx** - `34fb551` (feat)

## Files Created/Modified
- `src/tui/dashboard/hooks/useStaleness.ts` - SolidJS hook: TTL cache, fetchStaleness, invalidateCache
- `src/tui/dashboard/WorkspaceDetail.tsx` - resolveBadge helper, staleness prop, badge rendering per repo line
- `src/tui/dashboard/App.tsx` - Hook init, createEffect for cursor fetch, r-key invalidation, staleness prop passing

## Decisions Made
- Fetch is on-demand (workspace focus), not periodic background poll — keeps network quiet
- Cache keyed by main_path to naturally deduplicate repos appearing in multiple workspaces
- Used Promise.allSettled for concurrent fetch across repos within a workspace
- Badge rendered using `<Show when={badge.text}>` so up-to-date and no-tracking repos have no visual clutter

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Staleness system complete and ready for use
- Could be extended with configurable TTL or per-repo fetch granularity in future

---
*Phase: 39-tui-upstream-staleness*
*Completed: 2026-03-26*
