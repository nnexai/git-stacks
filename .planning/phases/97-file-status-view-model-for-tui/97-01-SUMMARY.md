---
phase: 97-file-status-view-model-for-tui
plan: 01
subsystem: tui
tags: [files-sync, tui, dashboard, view-model]
requires:
  - phase: 90-files-command-surface-and-conflict-policy
    provides: files status state vocabulary and JSON contract
  - phase: 91-files-sync-integration-and-machine-output
    provides: source-level file status helper behavior
provides:
  - Grouped workspace/repo file-status view model for TUI consumers
  - Severity, attention, summary, and detail buckets derived from existing file-status rows
  - CLI parity coverage for grouped state names, targets, and summary counts
affects: [phase-98-dashboard-control-center, TUI-04, files-status]
tech-stack:
  added: []
  patterns: [source-level TUI view model over lib/files policy helper]
key-files:
  created:
    - src/lib/workspace-file-status.ts
    - tests/lib/workspace-file-status.test.ts
  modified:
    - tests/commands/files.test.ts
key-decisions:
  - "The grouped TUI model is a wrapper over getFileEntryStatuses(), not a second sync-policy implementation."
  - "Diverged and error states map to error severity; missing, pullable, and pushable map to warning severity."
patterns-established:
  - "TUI-facing file status consumers should import src/lib/workspace-file-status.ts instead of shelling out to git-stacks files status."
  - "Dashboard rendering can use precomputed section summaries and per-entry details without recomputing sync drift policy."
requirements-completed:
  - TUI-04
duration: 12 min
completed: 2026-05-17
---

# Phase 97 Plan 01: Shared File Status View Model Summary

**Grouped workspace/repo file-status model with TUI severity, detail buckets, and CLI parity tests over the existing files status behavior**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-17T13:14:00Z
- **Completed:** 2026-05-17T13:26:31Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `getWorkspaceFileStatusView()` with workspace and repo sections, summaries, warnings, errors, severity, and attention flags.
- Preserved copy, symlink, and sync state names from `getFileEntryStatuses()` while deriving TUI-facing presentation metadata.
- Added parity tests comparing grouped helper rows and summary counts against `git-stacks files status --json`.

## Task Commits

1. **Task 1 RED:** `0307b64` test(97-01): add failing workspace file status view tests
2. **Task 1 GREEN:** `4148fd4` feat(97-01): add grouped file status view model
3. **Task 2:** `f651dc7` test(97-01): lock files status grouped model parity
4. **Review fix:** `d8014a7` fix(97): count file status detail warnings

## Files Created/Modified

- `src/lib/workspace-file-status.ts` - Shared grouped view model and summary/severity helpers.
- `tests/lib/workspace-file-status.test.ts` - Focused coverage for grouping, severity, summaries, missing paths, invalid targets, and drift details.
- `tests/commands/files.test.ts` - CLI parity coverage for states, targets, and summary counts.

## Decisions Made

The helper delegates policy to `getFileEntryStatuses()` and only adds grouping, metadata, and compact validation warnings needed by TUI consumers. No CLI subprocess path or duplicate sync comparison logic was introduced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Focused test command in plan is stale**
- **Found during:** Task 1 verification
- **Issue:** `bun run test tests/lib/workspace-file-status.test.ts` fails because the current `scripts/test-runner.ts` rejects positional file arguments.
- **Fix:** Used direct Bun focused checks with `bun test ...` for the plan-specific files, then ran `bun run typecheck`.
- **Files modified:** None
- **Verification:** `bun test tests/lib/workspace-file-status.test.ts tests/commands/files.test.ts` and `bun run typecheck` passed.
- **Committed in:** N/A

**2. [Rule 2 - Missing Critical] Detail warnings were not counted in compact summary attention**
- **Found during:** Required phase code review gate
- **Issue:** Missing sync source and repo-root warnings were exposed in detail arrays, but a source-missing entry with otherwise `ok` sync state could remain `severity: "ok"` and not increase warning/attention totals.
- **Fix:** Escalated entries with detail warnings to warning severity and included root warnings in section summary warning/attention counts.
- **Files modified:** `src/lib/workspace-file-status.ts`, `tests/lib/workspace-file-status.test.ts`
- **Verification:** `bun test tests/lib/workspace-file-status.test.ts tests/commands/files.test.ts tests/tui/dashboard/useWorkspaceFileStatus.test.tsx` and `bun run typecheck` passed.
- **Committed in:** `d8014a7`

---

**Total deviations:** 2 auto-handled issues.
**Impact on plan:** The second fix improves D-07/D-08 fidelity without changing sync policy or CLI behavior.

## Issues Encountered

None beyond the stale focused test command documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Plan 02 to add the dashboard lazy-loading state and hook around `getWorkspaceFileStatusView()`.

## Self-Check: PASSED

- `bun test tests/lib/workspace-file-status.test.ts tests/commands/files.test.ts` passed.
- `bun run typecheck` passed.
- Production code does not shell out to `git-stacks files status`.

---
*Phase: 97-file-status-view-model-for-tui*
*Completed: 2026-05-17*
