---
phase: 13-wizard-create-workspace
plan: 01
subsystem: ui
tags: [solidjs, opentui, tui, dashboard, wizard, components]

requires:
  - phase: 12-workspace-sync
    provides: SyncProgressView pattern and SyncRow type that CreateProgressView mirrors
  - phase: 11-tui-prerequisites
    provides: InlineInput component, deferred focus keyboard isolation pattern

provides:
  - WizardView.tsx generic multi-step wizard component with text/confirm steps, back-navigation, validation
  - CreateProgressView.tsx per-repo creation progress display mirroring SyncProgressView
  - UIView union extended with wizard-create, wizard-create-adhoc, create-progress variants
  - Action union extended with create-workspace
  - useWorkspaces.reload() returning Promise<void> for caller awaiting
  - Test coverage for both new components

affects:
  - 13-02: Uses WizardView + CreateProgressView in template-based create flow
  - 13-03: Uses WizardView + CreateProgressView in ad-hoc create flow
  - 14: WizardView generic design enables Phase 14 reuse (per D-21)

tech-stack:
  added: []
  patterns:
    - "Deferred focus with setInputFocused(false) + setStepIndex(next) + setTimeout(() => setInputFocused(true), 0)"
    - "Test deferred focus: await new Promise(r => setTimeout(r, 0)) between step transitions to let setTimeout fire"
    - "Local signals pattern for wizard step/data state inside WizardView (not in UIView union)"
    - "InlineInput focused prop: optional, defaults to true (backward compat); enables WizardView to control focus"

key-files:
  created:
    - src/tui/dashboard/WizardView.tsx
    - src/tui/dashboard/CreateProgressView.tsx
    - tests/tui/dashboard/WizardView.test.tsx
    - tests/tui/dashboard/CreateProgressView.test.tsx
  modified:
    - src/tui/dashboard/types.ts
    - src/tui/dashboard/hooks/useWorkspaces.ts
    - src/tui/dashboard/InlineInput.tsx

key-decisions:
  - "WizardView.tsx contains deferred focus pattern (setInputFocused false->setTimeout->true) for step transitions, required by CLAUDE.md keyboard isolation rules; tests use await new Promise(r=>setTimeout(r,0)) to allow it to fire"
  - "InlineInput.tsx gained optional focused prop (defaults to true) to support WizardView control without breaking existing callers"
  - "setData(() => nextData) lambda form required for TypeScript generics constraint (Exclude<Partial<T>, Function> overload)"
  - "nextData variable captures data before onComplete call so late-binding signal read issue is avoided"

patterns-established:
  - "Step-advancing wizard: setInputFocused(false) + setStepIndex(next) + setTimeout(setInputFocused(true), 0)"
  - "Test pattern for deferred focus: await new Promise(r => setTimeout(r, 0)) after triggering step transition before interacting with next input"

requirements-completed: [C-01, C-02, C-03]

duration: 15min
completed: 2026-03-21
---

# Phase 13 Plan 01: Wizard Create Workspace Foundation Summary

**Reusable multi-step WizardView and CreateProgressView TUI components with 10 tests, plus UIView/Action type extensions and useWorkspaces.reload() Promise<void> fix**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-21T09:30:00Z
- **Completed:** 2026-03-21T09:44:31Z
- **Tasks:** 2
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments

- WizardView generic component: text steps (via InlineInput) + confirm step, back-navigation via Escape, validation support, deferred focus pattern on step transitions
- CreateProgressView component mirroring SyncProgressView: 6 statuses (pending/creating-worktree/running-hooks/done/failed/skipped), spinner header, summary text
- types.ts: `create-workspace` added to Action union; `wizard-create`, `wizard-create-adhoc`, `create-progress` added to UIView union
- useWorkspaces.reload() now returns `Promise<void>` (one-line fix: add `return` before fetchStatuses call)
- InlineInput gained optional `focused` prop (defaults to true, backward compatible) for WizardView control
- 10 tests pass: 6 WizardView, 4 CreateProgressView; full dashboard test suite (39 tests) still green

## Task Commits

1. **Task 1: Define types, WizardView, CreateProgressView, fix useWorkspaces** - `c8fd303` (feat)
2. **Task 2: WizardView and CreateProgressView tests** - `7f65732` (test)

## Files Created/Modified

- `src/tui/dashboard/WizardView.tsx` - Generic multi-step wizard with text/confirm steps, back-nav, deferred focus
- `src/tui/dashboard/CreateProgressView.tsx` - Per-repo creation progress, mirrors SyncProgressView
- `src/tui/dashboard/types.ts` - Extended Action and UIView unions with create-workspace variants
- `src/tui/dashboard/hooks/useWorkspaces.ts` - reload() returns Promise<void>
- `src/tui/dashboard/InlineInput.tsx` - Optional focused prop added (default true)
- `tests/tui/dashboard/WizardView.test.tsx` - 6 tests: step rendering, forward nav, back nav, cancel, confirm, onComplete
- `tests/tui/dashboard/CreateProgressView.test.tsx` - 4 tests: pending rows, done rows, summary, spinner header

## Decisions Made

- InlineInput needed optional `focused` prop to support deferred focus from WizardView — added as Rule 2 auto-fix (missing critical functionality for correct keyboard isolation)
- `setData(() => nextData)` (lambda form) required over `setData(nextData)` to satisfy TypeScript's SolidJS setter generic constraint `Exclude<Partial<T>, Function>`
- Test deferred focus pattern: `await new Promise(r => setTimeout(r, 0))` between step transitions to ensure the deferred `setTimeout(0)` fires before the next keyboard interaction
- WizardView keeps step/data state as local signals (not in UIView union) per D-22 from STATE.md decisions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added optional `focused` prop to InlineInput**
- **Found during:** Task 1 (WizardView creation)
- **Issue:** WizardView needed to control focus state of InlineInput for the deferred focus pattern (per CLAUDE.md), but InlineInput had no `focused` prop
- **Fix:** Added `focused?: boolean` prop defaulting to `true` — all existing callers continue to work unchanged
- **Files modified:** `src/tui/dashboard/InlineInput.tsx`
- **Verification:** All 7 existing InlineInput tests still pass
- **Committed in:** c8fd303 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Required for correct keyboard isolation pattern. No scope creep.

## Issues Encountered

- Deferred focus pattern with `setInputFocused(false) → setTimeout(() => setInputFocused(true), 0)` caused test failures: `await renderOnce()` does not process macrotask queues, so `setTimeout(0)` hadn't fired before the next `mockInput.pressEnter()`. Resolved by adding `await new Promise(r => setTimeout(r, 0))` in tests where step transition occurs before interacting with the next step's input.

## Known Stubs

None — WizardView and CreateProgressView are pure presentational components. No data wiring required in this plan; Plans 02/03 wire them into App.tsx.

## Next Phase Readiness

- WizardView.tsx ready for Plan 02 (template-based create flow) and Plan 03 (ad-hoc create flow)
- CreateProgressView.tsx ready to receive CreateRow updates during actual workspace creation
- UIView union has all required variants for Plans 02/03 to set via `setView(...)`
- useWorkspaces.reload() returns Promise<void> so Plans 02/03 can `await reload()` before navigating back to list

## Self-Check: PASSED

All created files verified present. All commits verified in git log.

- FOUND: src/tui/dashboard/WizardView.tsx
- FOUND: src/tui/dashboard/CreateProgressView.tsx
- FOUND: tests/tui/dashboard/WizardView.test.tsx
- FOUND: tests/tui/dashboard/CreateProgressView.test.tsx
- FOUND: .planning/phases/13-wizard-create-workspace/13-01-SUMMARY.md
- FOUND commit: c8fd303 (Task 1)
- FOUND commit: 7f65732 (Task 2)

---
*Phase: 13-wizard-create-workspace*
*Completed: 2026-03-21*
