---
phase: 08-dashboard-tab-layout
plan: 05
subsystem: ui
tags: [solidjs, opentui, tui, dashboard, flexbox, switch-match]

# Dependency graph
requires:
  - phase: 08-dashboard-tab-layout
    provides: dashboard with tab system, action menus, help overlay, filter mode — all built in plans 01-04

provides:
  - Two-box layout (top list pane, bottom detail pane) with independent bordered boxes
  - Switch/Match-based tab rendering replacing Show blocks (fixes freeze-on-tab-switch)
  - Borderless action menus/confirm/progress rendered inside the detail box
  - Full-screen HelpOverlay (height=100% width=100%)
  - Filter indicator in help bar showing "filter: _" immediately on / press

affects: [09-ipc-message-feed, UAT]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Switch/Match for mutually-exclusive tab content avoids SolidJS retain-all-Show-nodes behavior"
    - "Two-box layout with flexGrow ratios (3:2) replaces manual height math"
    - "Help overlay as first child with Show when={!helpOpen()} wrapping main layout for clean overlay-vs-layout toggle"
    - "Child components are borderless; parent detail box provides the border context"

key-files:
  created: []
  modified:
    - src/tui/dashboard/App.tsx
    - src/tui/dashboard/ActionMenu.tsx
    - src/tui/dashboard/TemplateActionMenu.tsx
    - src/tui/dashboard/ConfirmDialog.tsx
    - src/tui/dashboard/ProgressView.tsx
    - src/tui/dashboard/HelpOverlay.tsx
    - src/tui/dashboard/WorkspaceList.tsx
    - src/tui/dashboard/TemplateList.tsx
    - src/tui/dashboard/RepoList.tsx

key-decisions:
  - "Use Switch/Match instead of Show for tab content to prevent SolidJS retaining DOM nodes for inactive tabs, which caused key-press freeze"
  - "Two bordered boxes with flexGrow={3}/flexGrow={2} replaces manual height memos (innerHeight/detailHeight) — layout engine handles proportional sizing"
  - "Filter indicator 'filter: _' placed in help bar row (not inside list component) so it appears immediately on / press regardless of typed characters"
  - "BatchBar moved inside top box as footer row so it cannot push layout below bottom box boundary"
  - "Help overlay wraps entire layout with Show when={helpOpen()} as first child; Show when={!helpOpen()} wraps two-box layout — clean exclusive display"

patterns-established:
  - "Pattern: Child detail/menu components are borderless — parent box provides border context to avoid double borders"
  - "Pattern: Filter display lives in the persistent help bar row, not inside the scrollable list — avoids layout reflow on filter state change"

requirements-completed: [DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-08, DASH-09, DASH-10, DASH-11]

# Metrics
duration: 2min
completed: 2026-03-20
---

# Phase 8 Plan 05: UAT Gap Closure Summary

**Two-box SolidJS dashboard with Switch/Match tab rendering, borderless child menus, full-screen help overlay, and filter indicator in help bar — fixes all 5 UAT gaps**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-20T00:11:41Z
- **Completed:** 2026-03-20T00:14:04Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Fixed UAT Issue 1 (layout overflow): Replaced single outer bordered box with two separate bordered boxes using flexGrow ratios — the detail box no longer gets pushed off screen when content overflows
- Fixed UAT Issue 2 (tab-switching freeze): Replaced all `<Show when={tab() === ...}>` blocks with `<Switch><Match>` — SolidJS no longer retains DOM nodes for inactive tab panels
- Fixed UAT Issue 3 (action menu double borders): Removed border/width from ActionMenu, TemplateActionMenu, ConfirmDialog, ProgressView outer boxes — they now render inside the detail box's border with padding only
- Fixed UAT Issue 4 (smushed help overlay): Added height="100%" width="100%" to HelpOverlay box — it now fills the terminal area
- Fixed UAT Issue 5 (filter indicator delay): Moved filter display from list components to App.tsx help bar row showing `filter: {filter() || "_"}` — appears immediately when / is pressed

## Task Commits

1. **Task 1: Fix child component borders, sizing, and filter display** - `2c411bb` (fix)
2. **Task 2: Refactor App.tsx — two-box layout, Switch/Match, help overlay, filter bar** - `35cdefd` (feat)

## Files Created/Modified

- `src/tui/dashboard/App.tsx` - Major refactor: two-box layout, Switch/Match tab rendering, help overlay placement, filter in help bar, removed separatorLine/innerHeight/detailHeight memos
- `src/tui/dashboard/ActionMenu.tsx` - Removed border/title/width, added paddingTop={1} paddingLeft={2}
- `src/tui/dashboard/TemplateActionMenu.tsx` - Removed border/title/width, added paddingTop={1} paddingLeft={2}
- `src/tui/dashboard/ConfirmDialog.tsx` - Removed border/width, added paddingTop={2} paddingLeft={2}
- `src/tui/dashboard/ProgressView.tsx` - Removed border/title/width from outer box
- `src/tui/dashboard/HelpOverlay.tsx` - Added height="100%" width="100%" (kept border and title)
- `src/tui/dashboard/WorkspaceList.tsx` - Removed inline filter display Show block
- `src/tui/dashboard/TemplateList.tsx` - Removed inline filter display Show block
- `src/tui/dashboard/RepoList.tsx` - Removed inline filter display Show block

## Decisions Made

- Used `Switch/Match` instead of `Show` for tab content — prevents SolidJS retaining and re-evaluating inactive panel nodes on each render, which caused key events to dispatch to frozen inactive panels
- flexGrow={3}/flexGrow={2} for top/bottom boxes eliminates manual height math that was error-prone when BatchBar appeared
- Filter indicator placed in App.tsx help bar (not inside list components) because list components only render when the correct tab is active; putting filter in the shared help bar guarantees it renders immediately when filtering() becomes true

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All 5 UAT gaps resolved; Phase 8 dashboard is ready for full UAT re-run
- Phase 9 (IPC message feed) can proceed — App.tsx layout is stable
- No blockers

## Self-Check: PASSED

- src/tui/dashboard/App.tsx — FOUND
- src/tui/dashboard/ActionMenu.tsx — FOUND
- .planning/phases/08-dashboard-tab-layout/08-05-SUMMARY.md — FOUND
- Commit 2c411bb — FOUND
- Commit 35cdefd — FOUND

---
*Phase: 08-dashboard-tab-layout*
*Completed: 2026-03-20*
