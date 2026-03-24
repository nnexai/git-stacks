---
phase: 31-workspace-cwd-auto-detection
plan: 01
subsystem: integrations
tags: [cwd-detection, workspace-ops, issue-utils, tdd]

# Dependency graph
requires:
  - phase: 28-issue-tracking
    provides: "issue-utils.ts with resolveIssueRef, linkIssue, unlinkIssue"
provides:
  - "detectWorkspaceFromCwd() function in workspace-ops.ts with CwdDetectionResult type"
  - "resolveWorkspaceArg() helper in issue-utils.ts"
  - "15 unit tests covering all detection edge cases"
affects:
  - 31-02 (Plan 02 consumes these functions for Commander.js command wiring)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CWD detection via resolve(expandHome(task_path)) with trailing-separator guard"
    - "resolveWorkspaceArg: explicit-arg-wins over CWD detection with clear error messages"
    - "Test isolation: manual configDir + applyPathsMock() function called in beforeAll"

key-files:
  created:
    - tests/lib/detect-workspace-cwd.test.ts
  modified:
    - src/lib/workspace-ops.ts
    - src/lib/integrations/issue-utils.ts

key-decisions:
  - "CwdDetectionResult discriminated union: { ok: true; workspace } | { ok: false; error: 'no_match' }"
  - "Deepest-match wins (longest resolvedTaskPath) for nested workspace disambiguation"
  - "Trunk-mode repos always skipped — shared main clone dir across workspaces causes false positives"
  - "Trailing-separator guard in startsWith(path + '/') prevents prefix collision (repo-na vs repo-name)"
  - "Single isolated configDir with re-applied mock (beforeAll) instead of useIsolatedConfig() to survive cross-file mock contamination"
  - "formatIssueError no_issue_linked updated to mention both CWD and explicit workspace usage"

patterns-established:
  - "applyPathsMock() + beforeAll pattern for tests that need paths mock to survive cross-file contamination"

requirements-completed: [WUX-02]

# Metrics
duration: 32min
completed: 2026-03-24
---

# Phase 31 Plan 01: Workspace CWD Auto-Detection Core Summary

**CWD-based workspace detection via worktree task_path matching plus resolveWorkspaceArg shared helper — foundation for optional [workspace] arg across all 4 tracker integrations**

## Performance

- **Duration:** 32 min
- **Started:** 2026-03-24T15:14:29Z
- **Completed:** 2026-03-24T15:46:58Z
- **Tasks:** 1 (TDD: RED + GREEN + REFACTOR)
- **Files modified:** 3

## Accomplishments

- `detectWorkspaceFromCwd(cwd?)` exported from `workspace-ops.ts` — reads all workspace YAMLs via `listWorkspaces()`, matches CWD against worktree `task_path` values using `resolve(expandHome(path))`, returns deepest match or `no_match`
- `resolveWorkspaceArg(workspaceName?, tracker, action)` exported from `issue-utils.ts` — validates explicit name or falls back to CWD detection with clear error messages
- 15 unit tests covering: exact match, subdirectory, no_match, deepest-wins, trunk-skip, path-prefix-collision guard, tilde normalization, mixed repos, and resolveWorkspaceArg (explicit/CWD/exit behavior)
- All tests pass in isolation and when run alongside the full lib test suite (excluding pre-existing broken `integration-commands.test.ts`)

## Task Commits

Each TDD phase committed atomically:

1. **RED: Add failing tests** - `2fd5c81` (test)
2. **GREEN: Implement functions** - `876440f` (feat)
3. **REFACTOR: Improve test isolation** - `c6324a1` (refactor)

## Files Created/Modified

- `tests/lib/detect-workspace-cwd.test.ts` - 15 unit tests for detectWorkspaceFromCwd and resolveWorkspaceArg
- `src/lib/workspace-ops.ts` - Added CwdDetectionResult type + detectWorkspaceFromCwd(); added listWorkspaces, expandHome, resolve imports
- `src/lib/integrations/issue-utils.ts` - Added resolveWorkspaceArg(); updated formatIssueError no_issue_linked message; added detectWorkspaceFromCwd import

## Decisions Made

- Used `resolve(expandHome(repo.task_path))` for path normalization — handles both `~/...` tilde paths and relative paths
- Deepest match (longest `resolvedTaskPath.length`) wins for workspaces sharing path prefixes — deterministic and correct
- Trunk-mode repos explicitly skipped — they share a single `main_path` clone across all workspaces, causing false positives
- `startsWith(resolvedPath + "/")` not just `startsWith(resolvedPath)` — prevents `/tasks/repo-na` from matching CWD `/tasks/repo-name`
- `resolveWorkspaceArg` calls `process.exit(1)` on error — follows existing integration command handler pattern

## Deviations from Plan

None - plan executed exactly as written, with one test infrastructure fix:

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test isolation for cross-file mock contamination**
- **Found during:** Task 1 (GREEN phase, running full test suite)
- **Issue:** `config.test.ts` calls `mock.module("@/lib/paths", ...)` inside test callbacks during execution. Since tests from different files share the same bun worker, this overwrites the `@/lib/paths` mock set by `useIsolatedConfig("cwd-detect")` at module-load time. `listWorkspaces()` inside `detectWorkspaceFromCwd` reads `WORKSPACES_DIR` as a live binding — after contamination it points to the wrong tmp dir, so workspaces written in tests aren't found.
- **Fix:** Replaced `useIsolatedConfig()` with manual `configDir + applyPathsMock()` function. Added `beforeAll(() => applyPathsMock())` to each describe block to re-apply the correct paths mock before tests run.
- **Files modified:** `tests/lib/detect-workspace-cwd.test.ts`
- **Verification:** All 15 tests pass when run as part of `bun test tests/lib/` (excluding the pre-existing broken `integration-commands.test.ts`)
- **Committed in:** c6324a1 (refactor)

---

**Total deviations:** 1 auto-fixed (Rule 1 - test infrastructure bug)
**Impact on plan:** Fix ensures test reliability in CI. No scope creep.

## Issues Encountered

- **Pre-existing failure in `integration-commands.test.ts`**: This file imports `resolveForgeRepoAnyMode` from `forge-utils.ts` but that export does not exist. This causes 2 errors in the full test suite. When run in the same bun worker, the error propagates to adjacent test files. This was pre-existing before Plan 31-01 and is out of scope. Documented in deferred items.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `detectWorkspaceFromCwd` and `resolveWorkspaceArg` are ready for Plan 02 consumption
- Plan 02 will wire these into Commander.js command handlers across all 4 tracker integrations (Jira, GitHub, GitLab, Gitea)
- No blockers — functions have clean interfaces and full test coverage

## Self-Check: PASSED

- Files exist: src/lib/workspace-ops.ts, src/lib/integrations/issue-utils.ts, tests/lib/detect-workspace-cwd.test.ts
- Commits exist: 2fd5c81 (test), 876440f (feat), c6324a1 (refactor)
- Exports verified: CwdDetectionResult type and detectWorkspaceFromCwd function in workspace-ops.ts; resolveWorkspaceArg in issue-utils.ts
