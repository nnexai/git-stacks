---
phase: 28-issue-task-tracking-integration
plan: "01"
subsystem: integrations
tags: [issue-tracking, workspace-settings, jira, github, gitlab, gitea, tdd]

# Dependency graph
requires:
  - phase: 27-git-forge-integrations
    provides: forge-utils.ts pattern — resolveForgeRepo, formatForgeError, discriminated union error types

provides:
  - src/lib/integrations/issue-utils.ts — shared issue ref helpers for all four tracker integrations
  - resolveIssueRef — reads workspace.settings.integrations.<trackerId>.issue, coerces to string
  - linkIssue — writes issue ID under tracker config, preserving existing fields
  - unlinkIssue — removes only issue key using destructuring rest pattern
  - formatIssueError — human-readable messages for workspace_not_found and no_issue_linked variants
  - IssueRefResolution and IssueRefResolutionError discriminated union types

affects:
  - 28-02 (tracker command wiring will import resolveIssueRef, linkIssue, unlinkIssue, formatIssueError)
  - 28-03 (Jira integration will use same issue-utils foundation)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "issue-utils pattern: shared helper module for cross-tracker issue storage under workspace.settings.integrations.<trackerId>.issue"
    - "String(issueId) coercion: unifies GitHub integer issue numbers and Jira alphanumeric keys into string type"
    - "Destructuring rest pattern for unlinkIssue: const { issue: _, ...rest } = existing removes only target key"

key-files:
  created:
    - src/lib/integrations/issue-utils.ts
    - tests/lib/integrations/issue-utils.test.ts
  modified: []

key-decisions:
  - "Issue IDs stored as strings regardless of source format (String(issueId) coercion) — unifies GitHub int and Jira alphanumeric"
  - "issue-utils mirrors forge-utils pattern: shared resolution + formatting helpers extracted once for all tracker integrations"

patterns-established:
  - "issue-utils pattern: all four tracker integrations share one storage helpers module rather than duplicating read/write logic"
  - "IssueRefResolution union type: { ok: true; issueId: string; workspace: Workspace } | IssueRefResolutionError"

requirements-completed: [ISSUE-01, ISSUE-02, ISSUE-03]

# Metrics
duration: 1min
completed: 2026-03-22
---

# Phase 28 Plan 01: Issue Utils Foundation Summary

**Shared issue-utils module with resolveIssueRef, linkIssue, unlinkIssue, formatIssueError — foundation for all four tracker integrations storing issue IDs under workspace.settings.integrations.<trackerId>.issue**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-22T17:35:00Z
- **Completed:** 2026-03-22T17:36:04Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Created `src/lib/integrations/issue-utils.ts` following the same pattern as `forge-utils.ts` for consistent code style
- All 13 test cases pass covering resolveIssueRef (6 cases), linkIssue (3 cases), unlinkIssue (2 cases), and formatIssueError (2 cases)
- Numeric issue ID coercion to string handles GitHub integer IDs transparently alongside Jira alphanumeric keys
- TDD flow followed: failing tests written first, implementation written to pass, typecheck confirmed clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Create issue-utils.ts with resolveIssueRef, linkIssue, unlinkIssue, formatIssueError** - `9ae0045` (feat)

**Plan metadata:** (forthcoming — docs commit)

_Note: TDD task committed as single feat commit after RED→GREEN cycle_

## Files Created/Modified

- `src/lib/integrations/issue-utils.ts` — Shared issue ref helpers: resolveIssueRef, linkIssue, unlinkIssue, formatIssueError with IssueRefResolution and IssueRefResolutionError types
- `tests/lib/integrations/issue-utils.test.ts` — 13 unit tests using mock.module("@/lib/config") for isolation, covers all function variants and edge cases

## Decisions Made

- Issue IDs stored as strings regardless of source format — `String(issueId)` coercion unifies GitHub integer issue numbers and Jira alphanumeric keys into one consistent type
- Mirrored forge-utils.ts pattern exactly for consistency — same discriminated union error type shape, same function signature style, same import structure from `../config`

## Deviations from Plan

None — plan executed exactly as written. The plan's provided implementation template had a minor bug (`if (issueId === undefined && issueId === null)` used `&&` which is always false since a value can't be both simultaneously), corrected to `||` in the implementation. This is a trivial logic fix within the plan's own code snippet, not a deviation from plan intent.

## Issues Encountered

None — typecheck passed clean on first run, all 13 tests green immediately after implementation.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `src/lib/integrations/issue-utils.ts` is ready to be imported by Plans 02 and 03
- Both `resolveIssueRef` and `linkIssue`/`unlinkIssue` are fully tested and type-safe
- Plan 02 can wire these helpers into `git-stacks integration <tracker> issue link|unlink|show` commands

---
*Phase: 28-issue-task-tracking-integration*
*Completed: 2026-03-22*

## Self-Check: PASSED

- FOUND: src/lib/integrations/issue-utils.ts
- FOUND: tests/lib/integrations/issue-utils.test.ts
- FOUND: .planning/phases/28-issue-task-tracking-integration/28-01-SUMMARY.md
- FOUND: commit 9ae0045
