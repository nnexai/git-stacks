---
phase: 86-workspace-command-workflow-edge-coverage
plan: 02
subsystem: testing
tags: [workspace, clean-gone, destructive-commands, e2e, cli]
requires:
  - phase: 81-workspace-and-git-operation-e2e-coverage
    provides: workspace git operation fixtures
provides:
  - clean --gone local-remote edge coverage
  - destructive workspace command safety smoke coverage
affects: [workspace-command-workflow-edge-coverage, workspace-cli, tests, e2e-inventory]
tech-stack:
  added: []
  patterns: [local bare remote fixtures, destructive command durable state assertions]
key-files:
  created: [tests/commands/workspace-clean-gone.test.ts, tests/commands/workspace-destructive-safety.test.ts]
  modified: [src/commands/workspace.ts]
key-decisions:
  - "clean --gone --dry-run now returns after reporting planned removals, matching the advertised dry-run safety contract."
patterns-established:
  - "Destructive command tests assert YAML/worktree preservation or exact mutation targets instead of prompt prose snapshots."
requirements-completed: [CMD-02, CMD-03, GATE-03]
duration: 25min
completed: 2026-05-15
---

# Phase 86 Plan 02: Workspace Destructive Safety Summary

**Local-remote `clean --gone` coverage plus destructive workspace command safety smoke for dry-run, force, missing entity, and non-force prompt paths.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-05-15T04:53:00Z
- **Completed:** 2026-05-15T05:17:55Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added real CLI tests for `clean --gone` gone detection, dry-run, dirty refusal, and force removal across local bare remotes.
- Added representative destructive command safety tests for `clean`, `remove`, `merge`, and `rename`.
- Fixed `clean --gone --dry-run` so it reports planned removals without prompting or mutating state.

## Task Commits

1. **Tasks 1-2: Cover clean-gone behavior and destructive command safety smoke** - `daac8e3` (test)

## Files Created/Modified

- `tests/commands/workspace-clean-gone.test.ts` - Real CLI coverage for gone upstream cleanup behavior.
- `tests/commands/workspace-destructive-safety.test.ts` - Destructive command safety smoke for missing, dry-run, force, and non-force paths.
- `src/commands/workspace.ts` - Adds dry-run handling inside the `clean --gone` command path.

## Decisions Made

- Used local bare remotes and pushed/unpushed workspace branches to model active versus gone upstream state.
- Kept destructive safety coverage representative rather than building an exhaustive command/flag matrix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `clean --gone --dry-run` ignored dry-run**
- **Found during:** Task 1
- **Issue:** The CLI accepted `--dry-run` but the gone cleanup branch still entered the confirmation path instead of reporting planned removals and returning.
- **Fix:** Added an `opts.dryRun` branch after gone workspaces are listed and before confirmation/removal.
- **Files modified:** `src/commands/workspace.ts`
- **Verification:** `bun test tests/commands/workspace-clean-gone.test.ts`; `bun run test:integ`
- **Committed in:** `daac8e3`

---

**Total deviations:** 1 auto-fixed (Rule 1 bug).
**Impact on plan:** The fix was required for the documented safety contract and stayed within `clean --gone` command behavior.

## Issues Encountered

- Multiple real-repo fixtures in one test need unique repo names because `makeRepoWithRemote` creates deterministic repo paths per repo name.

## Verification

- `bun test tests/commands/workspace-clean-gone.test.ts tests/commands/workspace-destructive-safety.test.ts` - passed, 10 tests.
- `bun run test:integ` - passed, 72/72 integration test files.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 03 can add wrapper-edge coverage and inventory mappings for the new Phase 86 files.

## Self-Check: PASSED

- Found `tests/commands/workspace-clean-gone.test.ts`.
- Found `tests/commands/workspace-destructive-safety.test.ts`.
- Found commit `daac8e3`.
- No tracked file deletions in task commit.

---
*Phase: 86-workspace-command-workflow-edge-coverage*
*Completed: 2026-05-15*
