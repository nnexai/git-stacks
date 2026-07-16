---
phase: 123-archived-workspaces-and-safe-removal
plan: "01"
subsystem: core
tags: [workspace-archive, lifecycle, removal-safety, zod, git-worktree]

requires:
  - phase: 122-local-default-client-cutover
    provides: Shared core/service/client package boundaries and filesystem-authoritative workspace definitions
provides:
  - Canonical paired archive fields and idempotent archive/unarchive transforms
  - Typed inspect/commit workspace removal boundary with structured dirty blockers
  - Honest destructive phase callbacks and resolved workspace-definition deletion
  - Active-only pin replacement that preserves archived pin and priority metadata
affects: [123-02-catalog-contracts, 123-04-lifecycle-coordinator, 123-06-web-lifecycle, 123-07-tui-lifecycle]

tech-stack:
  added: []
  patterns: [leased atomic workspace mutation, opaque staged removal plan, typed dirty failure]

key-files:
  created:
    - packages/core/src/workspace-archive.ts
    - tests/lib/workspace-archive.test.ts
  modified:
    - packages/core/src/config.ts
    - packages/core/src/workspace-lifecycle.ts
    - packages/core/src/workspace-pins.ts
    - tests/lib/workspace-lifecycle.test.ts
    - tests/lib/workspace-pins.test.ts
    - tests/lib/workspace-ops.test.ts
    - tests/commands/workspace-lifecycle.test.ts
    - tests/commands/workspace-destructive-safety.test.ts

key-decisions:
  - "Archive state is canonical only when archived: true and an offset-aware archived_at are both present; active state omits both fields."
  - "Workspace removal inspection always performs the dirty check and returns an opaque resolved plan; allow_dirty bypasses only blockers captured by that inspection."
  - "Definition updates and deletion resolve the authoritative backing YAML path so filename drift cannot redirect or strand lifecycle mutation."

patterns-established:
  - "Archive transitions use updateWorkspace and preserve every unrelated persisted field."
  - "Destructive removal separates non-mutating inspection from an explicit commit and emits phases immediately before the corresponding work."

requirements-completed: [ARCH-01, ARCH-04, REMOVE-03, REMOVE-04]

coverage:
  - id: D1
    description: "Workspace YAML supports backward-compatible canonical archive state with stable idempotent timestamps and lossless unarchive."
    requirement: ARCH-01
    verification:
      - kind: unit
        ref: "tests/lib/workspace-archive.test.ts#workspace archive persistence"
        status: pass
    human_judgment: false
  - id: D2
    description: "Archive and active-pin replacement preserve all non-terminal resources plus stored pin and priority metadata."
    requirement: ARCH-04
    verification:
      - kind: unit
        ref: "tests/lib/workspace-archive.test.ts#PHASE123_RED core archive removal contract"
        status: pass
      - kind: unit
        ref: "tests/lib/workspace-pins.test.ts#active pin replacement preserves archived pin and priority metadata"
        status: pass
    human_judgment: false
  - id: D3
    description: "Removal inspection returns every dirty blocker without destructive mutation and force bypasses only that typed guard."
    requirement: REMOVE-03
    verification:
      - kind: unit
        ref: "tests/lib/workspace-lifecycle.test.ts#inspectWorkspaceRemoval reports every dirty blocker with zero mutation"
        status: pass
      - kind: unit
        ref: "tests/lib/workspace-lifecycle.test.ts#commitWorkspaceRemoval bypasses only an inspected dirty guard when explicitly authorized"
        status: pass
    human_judgment: false
  - id: D4
    description: "Removal reports actual destructive call order and deletes only the resolved target definition and managed resources."
    requirement: REMOVE-04
    verification:
      - kind: unit
        ref: "tests/lib/workspace-lifecycle.test.ts#commitWorkspaceRemoval reports phases immediately before their destructive calls"
        status: pass
      - kind: integration
        ref: "tests/commands/workspace-lifecycle.test.ts#remove deletes the resolved drifted YAML and leaves unrelated definitions untouched"
        status: pass
    human_judgment: false

duration: 11 min
completed: 2026-07-16
status: complete
---

# Phase 123 Plan 01: Core Archive and Staged Removal Authority Summary

**Canonical lossless archive persistence and an opaque inspect/commit removal boundary with typed dirty blockers, resolved YAML deletion, and honest destructive phases**

## Performance

- **Duration:** 11 min
- **Started:** 2026-07-16T05:53:26Z
- **Completed:** 2026-07-16T06:04:10Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Added backward-compatible paired archive fields plus idempotent archive and lossless unarchive domain functions.
- Added non-mutating removal inspection and explicit commit APIs that preserve every dirty blocker and restrict force to the inspected dirty guard.
- Bound destructive progress to real worktree/file deletion call order and made updates/deletion follow resolved workspace YAML files under filename drift.
- Preserved archived workspace pin and priority metadata while replacing the active pin set.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock core archive, pin, staged removal, and deletion edge contracts** - `9e4eb4b6` (test)
2. **Task 2: Implement atomic archive transitions and typed safe removal outcomes** - `2e5f2c83` (feat)

## Files Created/Modified

- `packages/core/src/workspace-archive.ts` - Atomic idempotent archive and unarchive transforms.
- `packages/core/src/config.ts` - Canonical archive schema and resolved workspace update/deletion paths.
- `packages/core/src/workspace-lifecycle.ts` - Typed inspection, opaque removal plans, explicit commit, and destructive phase callbacks.
- `packages/core/src/workspace-pins.ts` - Active-only replacement that leaves archived metadata intact.
- `tests/lib/workspace-archive.test.ts` - Archive compatibility, timestamp stability, and preservation coverage.
- `tests/lib/workspace-lifecycle.test.ts` - Direct typed blocker, zero-mutation, force-boundary, and phase-order coverage.
- `tests/lib/workspace-pins.test.ts` - Archived pin and priority preservation coverage.
- `tests/lib/workspace-ops.test.ts` - Legacy removal expectations reconciled with dirty-only force semantics.
- `tests/commands/workspace-lifecycle.test.ts` - Resolved filename-drift deletion and unrelated-target safety.
- `tests/commands/workspace-destructive-safety.test.ts` - Parse-failure force boundary coverage.

## Decisions Made

- Used literal `archived: true` rather than a persisted false state, with a schema refinement requiring the timestamp pair.
- Kept terminal shutdown, confirmation, revision binding, and force eligibility in the service; core exposes only the staged dirty/removal authority needed by that coordinator.
- Retained the daemonless `removeWorkspace` facade by composing the same inspection and commit functions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Contract Regression] Reconciled legacy malformed-YAML force expectations**
- **Found during:** Task 2 verification
- **Issue:** Existing `workspace-ops` tests still expected `--force` to delete an unparseable definition, contradicting the locked requirement that force bypass only dirtiness.
- **Fix:** Updated the legacy tests to require a typed failure and zero YAML/directory mutation.
- **Files modified:** `tests/lib/workspace-ops.test.ts`
- **Verification:** The focused legacy workspace-ops suite passes 94/94.
- **Committed in:** `2e5f2c83`

---

**Total deviations:** 1 auto-fixed (1 contract regression). **Impact:** Required the existing suite to match the locked safety boundary; no product scope expansion.

## Issues Encountered

- The first typecheck found that non-dirty inspection failure codes were omitted from the facade result union; the union was corrected and every workspace typecheck passed.
- Command integration tests execute built package output, so package builds were refreshed before the final focused run. Generated output remained ignored.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 can consume canonical archive fields and the staged removal types.
- Plan 04 can compose `inspectWorkspaceRemoval`, `commitWorkspaceRemoval`, and the two exact core phase callbacks beneath terminal/revision coordination.
- No blocker remains.

## Self-Check: PASSED

- Both created files exist.
- Task commits `9e4eb4b6` and `2e5f2c83` exist in history.
- All four coverage deliverables classify as fully automated and passing.

---
*Phase: 123-archived-workspaces-and-safe-removal*
*Completed: 2026-07-16*
