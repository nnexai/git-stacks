---
phase: 123-archived-workspaces-and-safe-removal
plan: "03"
subsystem: service-terminal-lifecycle
tags: [node-pty, workspace-admission, terminal-shutdown, concurrency, cleanup-safety]

requires:
  - phase: 123-archived-workspaces-and-safe-removal
    provides: Stable workspace identities and strict lifecycle contracts from Plan 02
provides:
  - Independent stable-workspace lifecycle admission leases checked before PTY allocation
  - Shared per-session close settlement based only on observed PTY exit
  - Internal metadata-minimized cross-principal workspace terminal shutdown
affects: [123-04-lifecycle-coordinator, 123-05-runtime-wiring, 123-08-verification]

tech-stack:
  added: []
  patterns: [per-target FIFO lifecycle lease, observed-exit terminal barrier, shared close promise, bounded internal close result]

key-files:
  created:
    - packages/service/src/policy/workspace-lifecycle-admission.ts
  modified:
    - packages/service/src/web/terminal-manager.ts
    - tests/service/web-terminal.test.ts

key-decisions:
  - "A queued same-workspace lifecycle lease keeps admission continuously blocked while unrelated workspace leases remain independent."
  - "SIGTERM and SIGKILL are attempts only; the shared PTY exit promise is the sole successful close signal."
  - "Internal workspace shutdown returns only status and counts, never cross-principal session metadata."

patterns-established:
  - "Target admission: lifecycle coordination acquires one stable-ID lease and terminal creation asserts admission immediately before PTY allocation."
  - "Confirmed close: concurrent callers share one promise through TERM, KILL, observed exit, cleanup, and bounded failure."

requirements-completed: [ARCH-02, ARCH-04, REMOVE-02]

coverage:
  - id: D1
    description: "Lifecycle admission serializes the same stable workspace ID while unrelated targets remain independently available before PTY allocation."
    requirement: ARCH-02
    verification:
      - kind: unit
        ref: "tests/service/web-terminal.test.ts#PHASE123_RED terminal barrier contract"
        status: pass
    human_judgment: false
  - id: D2
    description: "Terminal close succeeds only after observed TERM or KILL exit and reports cleanup_failed after both bounded attempts time out."
    requirement: ARCH-04
    verification:
      - kind: unit
        ref: "tests/service/web-terminal.test.ts#confirms TERM and KILL exits and reports a never-exiting PTY honestly"
        status: pass
    human_judgment: false
  - id: D3
    description: "Concurrent close callers share one settlement and internal workspace shutdown closes sessions across principals with bounded counts only."
    requirement: REMOVE-02
    verification:
      - kind: unit
        ref: "tests/service/web-terminal.test.ts#shares concurrent close settlement and closes a workspace across principals without metadata"
        status: pass
    human_judgment: false

duration: 7 min
completed: 2026-07-16
status: complete
---

# Phase 123 Plan 03: Confirmed Workspace Terminal Barrier Summary

**Per-workspace admission leases and shared TERM/KILL close promises that report success only after the PTY exit callback settles**

## Performance

- **Duration:** 7 min
- **Started:** 2026-07-16T06:28:20Z
- **Completed:** 2026-07-16T06:35:17Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added a FIFO admission authority that blocks terminal creation for one stable workspace ID without serializing unrelated targets.
- Reworked terminal closure around one shared promise that waits for actual exit after TERM and then KILL, preserving an honest `cleanup_failed` session after the second timeout.
- Added a service-internal cross-principal workspace close operation whose result contains only requested, closed, and failed counts.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock target admission and real-exit terminal behavior** - `b03560c3` (test)
2. **Task 2: Implement target-scoped admission and confirmed workspace shutdown** - `43f569f4` (feat)

## Verification

- RED gate failed on all three intended missing behaviors and reached the exact `PHASE123_RED terminal barrier contract` sentinel.
- Focused terminal suite passes 9/9, including real Linux PTY coverage and injected TERM/KILL/never-exit processes.
- Workspace typecheck passes for protocol, client, core, CLI, service, web, and TUI packages.
- Package dependency and cycle gate reports `Package architecture: OK`.

## Files Created/Modified

- `packages/service/src/policy/workspace-lifecycle-admission.ts` - Independent keyed lease and terminal-admission authority.
- `packages/service/src/web/terminal-manager.ts` - Admission-aware allocation, observed-exit shared close, and internal workspace shutdown.
- `tests/service/web-terminal.test.ts` - Target isolation, queued lease, TERM/KILL timeout, shared-promise, and cross-principal coverage.

## Decisions Made

- Kept lifecycle admission target-scoped and FIFO so a queued same-target mutation never opens an allocation gap between leases.
- Kept failed sessions in the manager as `cleanup_failed`; neither signal delivery nor timeout removes or marks them ended.
- Kept `closeWorkspace` off all client contracts and limited its return to status/counts so lifecycle coordination gains cleanup authority without enumeration authority.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- During GREEN iteration, the admission rejection initially sat inside PTY allocation error normalization and was mapped to `capability_unavailable`; moving the admission assertion immediately before the allocation `try` preserved its typed lifecycle conflict while keeping allocation failures normalized.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04 can acquire `createWorkspaceLifecycleAdmission()` leases and treat `WebTerminalManager.closeWorkspace()` as the confirmed, bounded prerequisite for archive/remove mutation.
- Plan 05 can inject the same admission instance into the terminal manager and lifecycle coordinator at the composition root.
- No blocker remains.

## Self-Check: PASSED

- Task commits `b03560c3` and `43f569f4` exist in history.
- All three created/modified implementation and test files exist.
- All three coverage deliverables have current passing automated evidence.

---
*Phase: 123-archived-workspaces-and-safe-removal*
*Completed: 2026-07-16*
