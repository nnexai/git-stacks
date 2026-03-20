---
phase: 08-dashboard-tab-layout
plan: 06
subsystem: ui
tags: [solid-js, opentui, tui, dashboard, tab-switching, height-visibility]

# Dependency graph
requires:
  - phase: 08-05
    provides: tab signal, per-tab cursor/filter/filtering state, memo accessors, existing Switch/Match structure
provides:
  - Height-based visibility for all tab content panels and help overlay in App.tsx
  - Rename view reset to list after successful completion
affects: [08-UAT, any future dashboard rendering work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Height-based visibility: render all branches permanently, toggle height between active value and 0 instead of using Switch/Match or Show conditional"
    - "overflow=hidden on wrapper boxes ensures zero-height content does not bleed"

key-files:
  created: []
  modified:
    - src/tui/dashboard/App.tsx

key-decisions:
  - "Height-based visibility (height={tab() === X ? value : 0}) replaces Switch/Match for tab panels — OpenTUI terminal renderer does not repaint when SolidJS swaps conditional DOM branches"
  - "Help overlay uses two always-rendered boxes with height toggled by helpOpen() instead of two Show blocks"
  - "On rename error, stay on progress view (user sees error); on rename success, call setView({ view: list }) so detail pane shows clean state"

patterns-established:
  - "Height-based tab panel pattern: three permanent boxes, each with height={tab() === X ? listHeight() : 0} overflow=hidden"
  - "All tab list branches use memo accessors cursor()/filter()/filtering() — memos dereference through tab() automatically"

requirements-completed: [DASH-02, DASH-03, DASH-07]

# Metrics
duration: 6min
completed: 2026-03-20
---

# Phase 08 Plan 06: Height-Based Visibility for Tab Switching and Rename Fix Summary

**Height-based visibility replaces Switch/Match in App.tsx so OpenTUI repaints tab content and help overlay correctly; rename now resets to clean list view on success**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-20T01:05:20Z
- **Completed:** 2026-03-20T01:11:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Replaced all Switch/Match conditional rendering with permanent height-toggled boxes, fixing tab switch freeze (UAT tests 2, 3)
- Help overlay and main content now use height-based toggle (helpOpen ? 100% : 0) instead of two Show blocks, fixing visual sticking
- Workspace rename now calls setView({ view: "list" }) on success so the detail pane immediately shows clean workspace detail (fixes UAT test 8)
- Error path on rename stays on progress view so the user sees the error message

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace conditional rendering with height-based visibility** - `3596e60` (feat)
2. **Task 2: Fix rename remnants — reset view to list after rename completes** - `1ab914d` (fix)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `src/tui/dashboard/App.tsx` - Removed Switch/Match imports; replaced all Switch/Match blocks in list pane, detail pane, and action-menu pane with height-toggled boxes; replaced help overlay Show swap with height toggle; fixed rename completion path

## Decisions Made

- Height-based visibility chosen over Show conditionals for all tab content — OpenTUI's terminal renderer retains the previous buffer when SolidJS restructures the DOM tree via conditional rendering; height=0 keeps nodes mounted so no repaint is needed
- All three list-pane branches now use the memo accessors `cursor()`, `filter()`, `filtering()` instead of direct per-tab signal getters — correct because the memos dereference through `tab()`
- Rename error path intentionally kept on progress view (not reset to list) so the user can read the error message before pressing a key

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Tab switching, help overlay, and rename are now fixed
- UAT tests 2, 3, and 8 should now pass
- Previously skipped UAT tests 6, 7, 9, 10, 11 can be re-evaluated now that rendering is correct

---
*Phase: 08-dashboard-tab-layout*
*Completed: 2026-03-20*
