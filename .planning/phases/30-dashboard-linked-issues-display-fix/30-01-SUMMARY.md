---
phase: 30-dashboard-linked-issues-display-fix
plan: 01
subsystem: ui
tags: [solidjs, opentui, tui, dashboard, jira, issue-tracking, bun-test]

# Dependency graph
requires:
  - phase: 28-issue-task-tracking
    provides: issue link/unlink storage in workspace settings.integrations.[id].issue
provides:
  - Bug fix: WorkspaceDetail no longer leaks global Jira config into per-workspace display
  - New Linked Issues section shows workspace-scoped issue IDs below Integrations
  - TRACKER_IDS constant for hardcoded tracker integration IDs
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TRACKER_IDS constant array for hardcoded tracker integration IDs (github/gitlab/gitea/jira)"
    - "createMemo reading exclusively from ws().settings?.integrations?.[id]?.issue — never from globalConfig"
    - "Show+For pattern for conditional list sections in WorkspaceDetail"

key-files:
  created: []
  modified:
    - src/tui/dashboard/WorkspaceDetail.tsx
    - tests/tui/dashboard/WorkspaceDetail.test.tsx

key-decisions:
  - "TRACKER_IDS hardcoded as const array — no isTracker property on Integration interface; stable list matches 4 forge/issue integrations"
  - "Linked Issues reads only from ws().settings — never falls back to globalConfig; this is the core of the bug fix"
  - "issue key filtered from config summary for ALL integrations (not just trackers) to prevent any integration's issue ID leaking into the summary parenthetical"

patterns-established:
  - "Linked issues data access: ws().settings?.integrations?.[trackerId]?.issue — not file I/O, workspace already in memory"

requirements-completed: [BUG-01]

# Metrics
duration: 3min
completed: 2026-03-24
---

# Phase 30 Plan 01: Dashboard Linked Issues Display Fix Summary

**WorkspaceDetail bug fixed: global Jira config no longer leaks into per-workspace display; new Linked Issues section reads exclusively from workspace settings for github/gitlab/gitea/jira tracker IDs**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T14:19:03Z
- **Completed:** 2026-03-24T14:21:20Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Fixed config summary filter to exclude `issue` key alongside `enabled` — prevents issue IDs from appearing in the `(key: value)` inline summary
- Added `TRACKER_IDS` constant and `linkedIssues` createMemo that reads exclusively from workspace settings (no global config fallback)
- Added Linked Issues section with `<Show when={linkedIssues().length > 0}>` — completely absent when no issues linked
- 4 new test cases cover all bug fix behaviors; 7 existing tests continue to pass (744 total suite green)

## Task Commits

1. **Task 1: Fix config summary issue leak and add Linked Issues section** - `ef34cf5` (feat)

## Files Created/Modified

- `src/tui/dashboard/WorkspaceDetail.tsx` - Added TRACKER_IDS constant, linkedIssues createMemo, Linked Issues JSX section, issue key filter
- `tests/tui/dashboard/WorkspaceDetail.test.tsx` - Added 4 new test cases (Tests A-D), added global jira mock entry

## Decisions Made

- TRACKER_IDS hardcoded as `["github", "gitlab", "gitea", "jira"] as const` — no formal tracker type exists on Integration interface; the list is stable
- Linked Issues section reads ONLY from `ws().settings?.integrations?.[id]?.issue` — the global config fallback (`?? globalConfig.integrations[id]`) is intentionally kept for non-issue config keys (cmd, open_cmd, session_name, etc.) but issues must be workspace-scoped
- `issue` key filtered from config summary for all integrations (not tracker-specific) — consistent behavior across all integration types

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None - Linked Issues section is fully wired to workspace data.

## Next Phase Readiness

- Phase 30 complete — BUG-01 resolved
- Snapshot drift in `WorkspaceRow.snap.test.tsx.snap` (66d → 68d relative age) is pre-existing time-based drift, not caused by this plan
- Ready for next phase in v0.8.0 milestone

---
*Phase: 30-dashboard-linked-issues-display-fix*
*Completed: 2026-03-24*
