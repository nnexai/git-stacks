---
phase: 58-ahead-behind-tracking
plan: 04
subsystem: tui
tags: [tui, dashboard, ahead-behind, workspace-row, workspace-detail]

requires:
  - phase: 58-ahead-behind-tracking
    plan: 01
    provides: "getCommitsAhead and isFetchStale in git.ts"
  - phase: 58-ahead-behind-tracking
    plan: 02
    provides: "RepoStatus.ahead/behind and WorkspaceStatus.aheadBehindStale"
  - phase: 58-ahead-behind-tracking
    plan: 03
    provides: "CLI ahead/behind output for list/status"

provides:
  - "WorkspaceRow renders aggregated ↑N/↓N indicators with stale ? suffix"
  - "WorkspaceDetail renders per-repo ahead/behind directly from RepoStatus"
  - "Dashboard no longer depends on the removed useStaleness hook"
  - "Targeted TUI tests cover stale-aware ahead/behind rendering"

affects: [release-prep]

tech-stack:
  added: []
  patterns:
    - "WorkspaceRow aggregates ahead=sum and behind=max from loaded RepoStatus rows"
    - "stale UI uses gray + ? suffix rather than a separate badge"
    - "OpenTUI render tests assert rendered characters instead of nested text inspection"

key-files:
  created: []
  modified:
    - src/tui/dashboard/WorkspaceRow.tsx
    - src/tui/dashboard/WorkspaceDetail.tsx
    - src/tui/dashboard/App.tsx
    - tests/tui/dashboard/WorkspaceDetail.test.tsx
    - tests/tui/dashboard/snapshots/WorkspaceRow.snap.test.tsx
    - tests/tui/dashboard/snapshots/__snapshots__/WorkspaceRow.snap.test.tsx.snap

key-decisions:
  - "WorkspaceRow hides zero ahead/behind values entirely and keeps stale state as a suffix on non-zero values only"
  - "WorkspaceDetail reads workspace-level aheadBehindStale from WorkspaceStatus instead of reviving the old staleness cache"
  - "Phase close-out adds focused render assertions so TUI verification does not require a manual dashboard run"

patterns-established:
  - "Per-repo ahead/behind UI reads directly from RepoStatus fields"
  - "Dashboard stale awareness is derived from useWorkspaces/getWorkspaceStatus, not a separate hook"

requirements-completed: [AB-05, AB-06]

duration: 20min
completed: 2026-04-03
---

# Phase 58 Plan 04: TUI Display Summary

**WorkspaceRow and WorkspaceDetail now surface stale-aware ahead/behind indicators, and phase close-out added focused TUI assertions so the dashboard behavior is covered automatically**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-04-03
- **Files modified:** 6

## Accomplishments

- `WorkspaceRow` now renders aggregated `↑N` and `↓N` indicators between the branch and counts columns, hiding zero values and appending `?` when `aheadBehindStale` is true
- `WorkspaceDetail` now renders per-repo ahead/behind directly from `RepoStatus.ahead` and `RepoStatus.behind`, using the workspace-level stale flag for dimmed `?` suffix rendering
- The dashboard no longer depends on the old `useStaleness` hook path; stale awareness now comes from the loaded workspace status data
- Added targeted OpenTUI render assertions covering `↑3?` / `↓2?` rendering in both `WorkspaceRow` and `WorkspaceDetail`
- Existing WorkspaceRow snapshot alignment changes were retained because they match the current row layout and keep the repo clean

## Files Created/Modified

- `src/tui/dashboard/WorkspaceRow.tsx` - aggregated ahead/behind display in the row layout
- `src/tui/dashboard/WorkspaceDetail.tsx` - per-repo ahead/behind display and stale suffix rendering
- `src/tui/dashboard/App.tsx` - cleaned stale-hook wiring out of the dashboard flow
- `tests/tui/dashboard/WorkspaceDetail.test.tsx` - added direct assertions for stale-aware per-repo indicators
- `tests/tui/dashboard/snapshots/WorkspaceRow.snap.test.tsx` - added row assertions for stale-aware aggregated indicators
- `tests/tui/dashboard/snapshots/__snapshots__/WorkspaceRow.snap.test.tsx.snap` - updated expected spacing for the current row layout

## Decisions Made

- Kept the row output compact by hiding zero-valued ahead/behind indicators rather than printing `↑0` / `↓0`
- Used the workspace-level stale bit already produced by `useWorkspaces` instead of reintroducing a per-repo staleness cache
- Verified TUI output with render tests and string assertions so phase verification can stay automated

## Deviations from Plan

- The feature implementation was already present when this close-out run resumed phase 58; this run focused on missing automated coverage and completion artifacts rather than re-implementing the UI logic.

## Issues Encountered

- None. Targeted TUI tests, typecheck, and the full suite all passed after the close-out assertions were added.

## Next Phase Readiness

- Phase 58 now has all four summaries plus a verification artifact
- CLI and TUI surfaces both expose ahead/behind data needed by Phase 59 push dry-run messaging
- No blockers

## Self-Check: PASSED

- FOUND: `src/tui/dashboard/WorkspaceRow.tsx`
- FOUND: `src/tui/dashboard/WorkspaceDetail.tsx`
- FOUND: `tests/tui/dashboard/WorkspaceDetail.test.tsx`
- FOUND: `tests/tui/dashboard/snapshots/WorkspaceRow.snap.test.tsx`
