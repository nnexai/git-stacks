---
phase: 05-tech-debt-cleanup-fix-open-now-lifecycle-bypass-workspace-type-contract-in-new-flow-and-dead-code-removal
plan: "01"
subsystem: tui
tags: [workspace, lifecycle, openWorkspace, tui, type-safety]

# Dependency graph
requires:
  - phase: 04-ux-and-execution
    provides: openWorkspace() full lifecycle implementation in workspace-ops.ts
provides:
  - "workspace-wizard.ts 'Open workspace now?' runs full lifecycle via openWorkspace()"
  - "workspace-clone.ts 'Open workspace now?' runs full lifecycle via openWorkspace()"
  - "workspace-wizard.ts passes real Workspace object to applyFileOpsForWorkspace (no {} as Workspace)"
affects: [any future TUI work touching workspace creation or cloning]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Delegate 'open now' prompts to openWorkspace() for full lifecycle consistency"
    - "Build typed workspace object before file ops to enable type-safe API calls"

key-files:
  created: []
  modified:
    - src/tui/workspace-wizard.ts
    - src/tui/workspace-clone.ts

key-decisions:
  - "workspace-wizard.ts: workspaceObj built as typed Workspace before file ops block — enables passing real object to applyFileOpsForWorkspace and integrations"
  - "workspace-wizard.ts: settingsIntegrations computed before workspaceObj so it can be spread into the typed object"
  - "Both TUI flows: artifact display loop (integration.generate + log) kept for immediate user feedback; openWorkspace() re-runs generate internally (idempotent overwrite)"

patterns-established:
  - "openWorkspace() is the single entry point for opening workspaces — never call integration.open() directly in TUI flows"

requirements-completed: [DEBT-01, DEBT-02]

# Metrics
duration: 2min
completed: 2026-03-18
---

# Phase 05 Plan 01: Open Now Lifecycle Fix Summary

**'Open workspace now?' in both TUI creation flows now delegates to openWorkspace() for full lifecycle, and workspace file ops receive a properly-typed Workspace object instead of `{} as Workspace`**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-18T21:45:59Z
- **Completed:** 2026-03-18T21:48:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Fixed lifecycle bypass in workspace-wizard.ts: "Open workspace now?" now runs full openWorkspace() lifecycle (pre_open hooks, per-repo hooks, file-ops, writeEnvFiles, trunk branch check, integrations, post_open hooks, last_opened timestamp)
- Fixed lifecycle bypass in workspace-clone.ts: same delegation to openWorkspace()
- Fixed type contract: workspace-wizard.ts builds a properly-typed `Workspace` object before file ops, replacing `{} as Workspace` cast passed to applyFileOpsForWorkspace()
- Moved settingsIntegrations computation and workspaceObj construction above the file ops block to enable type-safe references throughout

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix lifecycle bypass in workspace-wizard.ts and workspace-clone.ts** - `9a5d41d` (fix)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `src/tui/workspace-wizard.ts` - Added openWorkspace import, built workspaceObj as typed Workspace before file ops, replaced {} as Workspace, delegated "open now" to openWorkspace()
- `src/tui/workspace-clone.ts` - Added openWorkspace import, delegated "open now" to openWorkspace()

## Decisions Made
- workspaceObj built before file ops to avoid forward-reference issue — settingsIntegrations moved up as a prerequisite
- Artifact display loop (integration.generate + log path) retained after workspace write for immediate user feedback; openWorkspace() will re-run generate internally (idempotent)
- workspaceObj uses `as Workspace` cast at construction rather than fully narrowing all optional spread fields, consistent with existing typing patterns in the codebase

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 05-01 complete; lifecycle bypass and type contract fixed
- Ready for 05-02 (dead code removal) if it exists in this phase

---
*Phase: 05-tech-debt-cleanup*
*Completed: 2026-03-18*
