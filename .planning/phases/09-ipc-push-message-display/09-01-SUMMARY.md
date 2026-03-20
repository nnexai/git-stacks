---
phase: 09-ipc-push-message-display
plan: "01"
subsystem: ui
tags: [solidjs, ipc, reactive, messages, hooks, pure-functions]

# Dependency graph
requires:
  - phase: 06-message-store
    provides: "MessageRecord type, listMessages, clearMessages, appendMessage APIs"
  - phase: 08-dashboard-tab-layout
    provides: "types.ts UIView union, run.tsx onIpcMessage export, dashboard hook patterns"
provides:
  - "formatAge: ISO timestamp to human-readable relative time (s/m/h/d)"
  - "isStale: boolean check against configurable staleness threshold (default 30min)"
  - "groupBySender: clusters MessageRecord[] by sender, (system) label for undefined from"
  - "useMessages hook: eager load + IPC push reactive state with messagesFor accessor"
  - "setIpcCallback: setter function in run.tsx for IPC wiring"
  - "UIView union extended with { view: 'messages'; workspaceName: string } variant"
affects:
  - 09-02 (WorkspaceRow message badge — consumes messagesFor, formatAge)
  - 09-03 (MessageOverlay — consumes messagesFor, groupBySender, clearSender)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SolidJS createSignal with Map: create new Map on every update (never mutate prev)"
    - "IPC callback wiring via setter function (setIpcCallback) — avoids direct binding access"
    - "onCleanup removes IPC callback to avoid stale closure after component unmount"
    - "TDD: write failing tests first, implement to green"

key-files:
  created:
    - src/tui/dashboard/messageUtils.ts
    - src/tui/dashboard/hooks/useMessages.ts
    - tests/tui/messageUtils.test.ts
  modified:
    - src/tui/dashboard/run.tsx
    - src/tui/dashboard/types.ts

key-decisions:
  - "useMessages creates a new Map on every IPC push (not mutate-in-place) — SolidJS identity check requires object reference change to trigger reactivity"
  - "setIpcCallback setter in run.tsx (not direct onIpcMessage mutation from hook) — cleaner API, avoids callers accessing mutable binding directly"
  - "loadAll stores only workspaces with messages (skips empty arrays) — avoids polluting the Map with empty entries"
  - "clearSender re-reads from JSONL after clearing to ensure consistency with file state"

patterns-established:
  - "SolidJS Map signal: always return new Map(prev) inside setSignal updater — identity equality triggers re-render"
  - "IPC wiring via setIpcCallback in hook init + onCleanup nil — prevents stale callback after unmount"
  - "Pure utility functions in messageUtils.ts separate from reactive hook — independently testable"

requirements-completed: [MSG-11, MSG-12]

# Metrics
duration: 2min
completed: "2026-03-20"
---

# Phase 09 Plan 01: Message Utilities and Reactive Hook Summary

**Reactive message data layer with pure formatAge/isStale/groupBySender utilities, IPC-wired useMessages hook, and UIView union extended for message display**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-20T02:50:15Z
- **Completed:** 2026-03-20T02:52:36Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created `messageUtils.ts` with three pure functions (formatAge, isStale, groupBySender) backed by 19 unit tests
- Created `useMessages.ts` SolidJS hook with eager load from all workspaces, IPC push handler, messagesFor accessor, and clearSender action
- Extended `run.tsx` with `setIpcCallback` setter and `types.ts` UIView with `messages` variant

## Task Commits

Each task was committed atomically:

1. **Task 1: Create messageUtils.ts with pure utility functions and unit tests** - `675f8a8` (feat)
2. **Task 2: Create useMessages hook with IPC wiring and add setIpcCallback to run.tsx** - `7d5fe18` (feat)

## Files Created/Modified

- `src/tui/dashboard/messageUtils.ts` - Pure functions: formatAge, isStale, groupBySender with SenderGroup type
- `src/tui/dashboard/hooks/useMessages.ts` - SolidJS hook: eager load, IPC push via setIpcCallback, messagesFor, clearSender, reloadMessages
- `tests/tui/messageUtils.test.ts` - 19 unit tests covering formatAge (seconds/minutes/hours/days), isStale (default + custom threshold), groupBySender (empty, single, mixed, system)
- `src/tui/dashboard/run.tsx` - Added setIpcCallback setter function after onIpcMessage export
- `src/tui/dashboard/types.ts` - Added `{ view: "messages"; workspaceName: string }` to UIView union

## Decisions Made

- New Map on every IPC push: SolidJS requires reference change, not mutation, to trigger reactive updates
- setIpcCallback setter pattern: hook calls `setIpcCallback(handleIpc)` once during init, `onCleanup` calls `setIpcCallback(null)` — avoids stale closures
- loadAll skips workspaces with empty message arrays to keep the Map lean

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- messageUtils.ts exports are ready for WorkspaceRow (Plan 02 badge count, formatAge for age display)
- useMessages hook is ready for App.tsx wiring and MessageOverlay consumption (Plan 03)
- UIView `messages` variant in place for router/switch in App.tsx
- All existing 193 tests pass, no regressions

---
*Phase: 09-ipc-push-message-display*
*Completed: 2026-03-20*

## Self-Check: PASSED

- src/tui/dashboard/messageUtils.ts: FOUND
- src/tui/dashboard/hooks/useMessages.ts: FOUND
- tests/tui/messageUtils.test.ts: FOUND
- src/tui/dashboard/run.tsx: FOUND
- src/tui/dashboard/types.ts: FOUND
- Commit 675f8a8: FOUND
- Commit 7d5fe18: FOUND
