---
phase: 33-name-based-identity
plan: 02
subsystem: workspace-ops
tags: [rename, template, cascade, dry-run, workspace-ops, tdd]

# Dependency graph
requires:
  - phase: 33-01
    provides: scan-based templateExists/readTemplate/writeTemplate that look up by YAML name field

provides:
  - renameTemplate function in workspace-ops.ts with cascade and dry-run
  - template rename CLI command delegating to workspace-ops with --dry-run support
  - Tests for all renameTemplate behaviors

affects: [template-wizard, dashboard, completion-generator]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "renameTemplate cascade order: write-new, update-workspaces, delete-old (recoverable on failure)"
    - "TDD: failing tests committed first, then implementation to make them pass"

key-files:
  created: []
  modified:
    - src/lib/workspace-ops.ts
    - src/commands/template.ts
    - tests/lib/workspace-ops.test.ts

key-decisions:
  - "Delete old template file with existsSync guard — if filename drifted from name, old file is skipped and left as orphan for doctor to catch"
  - "Cascade order: write-new first, then update-workspaces, then delete-old — state is recoverable on failure at any step"

patterns-established:
  - "renameTemplate(oldName, newName, opts, onProgress): same pattern as renameWorkspace"

requirements-completed: [IDEN-03]

# Metrics
duration: 20min
completed: 2026-03-24
---

# Phase 33 Plan 02: Template Rename with Workspace Cascade Summary

**renameTemplate() in workspace-ops with cascade to workspace YAMLs, dry-run support, and --dry-run flag on `git-stacks template rename`**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-24T20:15:00Z
- **Completed:** 2026-03-24T20:35:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `renameTemplate` export to workspace-ops.ts: validates template existence, cascades workspace YAML references, supports dry-run mode via onProgress callback
- Updated `git-stacks template rename` to delegate to `renameTemplate()` with `--dry-run` flag
- Added `describe("renameTemplate")` block with 5 tests covering: rename, cascade, dry-run, not-found error, name-taken error

## Task Commits

Each task was committed atomically:

1. **Task 1: Add renameTemplate to workspace-ops and tests (TDD)** - `05cafd8` (feat)
2. **Task 2: Update template rename command to delegate to renameTemplate** - `4382164` (feat)

## Files Created/Modified
- `src/lib/workspace-ops.ts` - Added `renameTemplate` export; added `templateExists`, `readTemplate`, `writeTemplate` imports from config
- `src/commands/template.ts` - Updated rename command to delegate to `renameTemplate`, added `--dry-run` option
- `tests/lib/workspace-ops.test.ts` - Added `templateExists`, `writeTemplate` to config import block; added `renameTemplate` to workspace-ops import block; added `describe("renameTemplate")` with 5 tests

## Decisions Made
- Delete old template with `existsSync` guard rather than bare `unlinkSync` — handles edge case where filename drifted from name (orphan is detectable by doctor)
- Cascade order: write-new first, update-workspaces second, delete-old last — any failure leaves state recoverable

## Deviations from Plan

None - plan executed exactly as written. The `existsSync` guard around `unlinkSync(templatePath(oldName))` is consistent with the plan's note about the drifted-filename edge case.

## Issues Encountered
- TypeScript strict mode flagged `templatePath` and `wsName` as unused variables in test imports — removed both (Rule 1: auto-fix)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Template rename with cascade is complete; doctor drift detection (33-01) and template rename (33-02) together provide full name-based identity for templates
- Phase 33 is complete; ready for shell completion audit (Phase 34)

---
*Phase: 33-name-based-identity*
*Completed: 2026-03-24*
