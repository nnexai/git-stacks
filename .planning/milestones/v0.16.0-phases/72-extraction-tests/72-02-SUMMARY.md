---
phase: 72-extraction-tests
plan: 02
subsystem: testing
tags: [madge, dependency-graph, dashboard, ipc-state, circular-deps]
requires:
  - phase: 72
    provides: [extracted-module test baseline from plan 01]
provides:
  - repo-native circular dependency gate via madge
  - dashboard ipc-state extraction that removes run/App/useMessages cycles
  - green full-suite verification with dependency gate enforcement
affects: [phase-72, dashboard, verification, dependency-gates]
tech-stack:
  added: [madge@8.0.0]
  patterns: [repo-native dep gate, shared ipc-state module, cycle-free dashboard state]
key-files:
  created:
    - src/tui/dashboard/ipc-state.ts
  modified:
    - package.json
    - bun.lock
    - src/tui/dashboard/run.tsx
    - src/tui/dashboard/App.tsx
    - src/tui/dashboard/hooks/useMessages.ts
key-decisions:
  - "Installed madge in-repo and exposed it through test:deps rather than a custom graph script."
  - "Moved only the shared callback/status ownership into ipc-state.ts so the socket listener behavior in run.tsx stayed intact."
  - "Fixed the live cycles by changing import ownership, not by suppressing files or narrowing the scan scope."
patterns-established:
  - "Dashboard shared mutable state belongs in a dedicated module when multiple components need it."
  - "Dependency gates should be first-class package scripts so verification can run them repeatably."
requirements-completed: [TEST-04]
duration: 3 min
completed: 2026-04-05
---

# Phase 72 Plan 02: Dependency Gate And Dashboard Cycle Cleanup Summary

**Madge is now installed as a repo-native dependency gate, and the dashboard entrypoint no longer participates in import cycles because IPC callback/status state lives in a dedicated shared module.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-05T18:50:48.920Z
- **Completed:** 2026-04-05T18:53:36.129Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added `madge@8.0.0` plus a stable `bun run test:deps` script that scans `src/` for circular dependencies.
- Created `src/tui/dashboard/ipc-state.ts` to own dashboard socket status and IPC callback registration outside `run.tsx`.
- Rewired `run.tsx`, `App.tsx`, and `useMessages.ts` to consume the shared IPC-state module and cleared the live dashboard cycles.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Madge and add a repo-native circular-dependency gate** - `6ad655b6` (`test`)
2. **Task 2: Extract dashboard IPC state out of `run.tsx` and make `test:deps` pass** - `6ae68101` (`refactor`)

## Files Created/Modified

- `package.json` - adds the `test:deps` script
- `bun.lock` - locks `madge@8.0.0` into the repo
- `src/tui/dashboard/ipc-state.ts` - owns shared socket status and IPC callback dispatch
- `src/tui/dashboard/run.tsx` - dispatches socket records through the shared IPC-state module
- `src/tui/dashboard/App.tsx` - reads socket status from the shared IPC-state module
- `src/tui/dashboard/hooks/useMessages.ts` - registers IPC callbacks through the shared IPC-state module

## Decisions Made

- Kept the cycle fix narrowly scoped to IPC ownership so the socket path, malformed-JSON ignore behavior, and render entrypoint semantics stayed unchanged.
- Used the exact `madge --circular --extensions ts src/` gate required by the plan rather than weakening the scan or relying on ad hoc verification.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All Phase 72 requirements are now satisfied.
- The repo has a repeatable dependency-gate command that future phases can rerun after import-graph changes.

---
*Phase: 72-extraction-tests*
*Completed: 2026-04-05*
