---
phase: 31-workspace-cwd-auto-detection
plan: 02
subsystem: integrations
tags: [cwd-detection, issue-commands, jira, github, gitlab, gitea, backward-compat]

# Dependency graph
requires:
  - phase: 31-01
    provides: "detectWorkspaceFromCwd() and resolveWorkspaceArg() functions"
  - phase: 28-issue-tracking
    provides: "issue-utils.ts with resolveIssueRef, linkIssue, unlinkIssue"
provides:
  - "Optional [workspace] on all 4 tracker integration issue commands (jira, github, gitlab, gitea)"
  - "CWD auto-detection via resolveWorkspaceArg() on link/unlink/open for all trackers"
  - "78 unit tests covering CWD fallback, backward compat, and disambiguation"
affects:
  - phase-32 (GitLab slash investigation — no dependency, independent)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "link [workspace-or-issue] [issue-id] Commander.js signature — both optional, disambiguate in action handler"
    - "resolveWorkspaceArg(undefined, tracker, action) for CWD detection on unlink/open zero-arg case"
    - "workspaceExists() check to disambiguate single-arg link: workspace-name vs issue-id"

key-files:
  created:
    - tests/lib/detect-workspace-cwd.test.ts
  modified:
    - src/lib/integrations/jira.ts
    - src/lib/integrations/github.ts
    - src/lib/integrations/gitlab.ts
    - src/lib/integrations/gitea.ts
    - src/lib/integrations/issue-utils.ts
    - src/lib/workspace-ops.ts
    - tests/lib/integrations/jira.test.ts
    - tests/lib/integrations/github.test.ts
    - tests/lib/integrations/gitlab.test.ts
    - tests/lib/integrations/gitea.test.ts

key-decisions:
  - "link command uses [workspace-or-issue] [issue-id] (both optional) for Commander.js compatibility — single required second positional would prevent single-arg invocation"
  - "workspaceExists() check disambiguates single-arg link: if arg is a workspace name, error 'Missing issue ID'; if not, treat as issue-id and CWD-detect workspace"
  - "resolveWorkspaceArg() called for unlink and open zero-arg case; for link, CWD detection is inline to handle the two-step disambiguation"
  - "detectWorkspaceFromCwd() and resolveWorkspaceArg() reimplemented in this branch (Plan 01 was on a parallel worktree; functions are identical to Plan 01's specification)"
  - "formatIssueError no_issue_linked updated to mention both CWD and explicit workspace usage forms"

requirements-completed: [WUX-02, WUX-03]

# Metrics
duration: 42min
completed: 2026-03-24
---

# Phase 31 Plan 02: CWD Auto-Detection Wiring Summary

**Optional [workspace] argument on all 4 tracker integrations via Commander.js signature changes and resolveWorkspaceArg() dispatch — `git-stacks integration jira issue link PROJ-123` from inside a worktree now just works**

## Performance

- **Duration:** ~42 min
- **Completed:** 2026-03-24
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- All 4 tracker integrations (Jira, GitHub, GitLab, Gitea) updated with optional `[workspace]` on `link`, `unlink`, and `open` commands
- `link` command uses `[workspace-or-issue] [issue-id]` signature — both optional, disambiguation in action handler:
  - Two args: `link <workspace> <issue-id>` — backward compatible
  - One arg (not a workspace name): treat as issue-id, CWD-detect workspace
  - One arg (IS a workspace name): `process.exit(1)` with "Missing issue ID" error
  - No args: `process.exit(1)` with "Missing issue ID" error
- `unlink` and `open` changed to `[workspace]` optional — call `resolveWorkspaceArg(undefined, tracker, action)` for CWD fallback
- `detectWorkspaceFromCwd()` and `resolveWorkspaceArg()` implemented in this branch's workspace-ops.ts and issue-utils.ts
- `formatIssueError` for `no_issue_linked` updated to mention both CWD and explicit workspace usage
- 93 tests pass across 5 test files (78 integration issue command tests + 15 CWD detection tests)
- TypeScript typecheck passes

## Task Commits

1. **Task 1 (Jira TDD):** `7a7b3cf` — update Jira issue commands with optional workspace and CWD fallback
2. **Task 2 (GitHub/GitLab/Gitea + infrastructure):** `359a6a0` — update GitHub, GitLab, Gitea issue commands with optional workspace and CWD fallback
3. **Bonus (detect-workspace-cwd tests):** `402b9b1` — add detect-workspace-cwd tests for Plan 01 CWD detection functions

## Files Created/Modified

- `src/lib/integrations/jira.ts` — link [workspace-or-issue] [issue-id], unlink [workspace], open [workspace]
- `src/lib/integrations/github.ts` — same signature changes, resolveWorkspaceArg for issue commands
- `src/lib/integrations/gitlab.ts` — same signature changes, resolveWorkspaceArg for issue commands
- `src/lib/integrations/gitea.ts` — same signature changes, resolveWorkspaceArg for issue commands
- `src/lib/integrations/issue-utils.ts` — added resolveWorkspaceArg(), updated formatIssueError, added detectWorkspaceFromCwd import
- `src/lib/workspace-ops.ts` — added CwdDetectionResult type + detectWorkspaceFromCwd() function
- `tests/lib/integrations/jira.test.ts` — 15 tests: TDD for CWD fallback and disambiguation
- `tests/lib/integrations/github.test.ts` — 20 tests: CWD fallback + backward compat
- `tests/lib/integrations/gitlab.test.ts` — 20 tests: CWD fallback + backward compat
- `tests/lib/integrations/gitea.test.ts` — 23 tests: CWD fallback + backward compat
- `tests/lib/detect-workspace-cwd.test.ts` — 15 tests: detectWorkspaceFromCwd and resolveWorkspaceArg unit tests

## Decisions Made

- **`link [workspace-or-issue] [issue-id]` signature:** Commander.js requires both positionals optional when we want single-arg invocation to work (a required second positional causes parse error when omitted). Disambiguation logic in the action handler handles all cases.
- **workspaceExists() disambiguation:** Workspace names are kebab-case identifiers; Jira issue IDs are `PROJ-123` format; GitHub/GitLab/Gitea use numeric IDs. The chance of collision is negligible, and `workspaceExists()` gives deterministic resolution when it happens.
- **resolveWorkspaceArg() calls process.exit(1):** Consistent with existing integration command handler pattern. Tests use `exitMock` to intercept.
- **detectWorkspaceFromCwd() reimplementation:** This plan ran in a separate parallel worktree from Plan 01. The Plan 01 commits were visible in git history but not in the working tree. Functions were reimplemented following the exact specification from Plan 01's research, yielding identical behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Missing Plan 01 functions in parallel worktree**
- **Found during:** Task 2 verification
- **Issue:** This Plan 02 agent ran in a parallel worktree that was spawned before Plan 01's commits were merged. The Plan 01 functions (`detectWorkspaceFromCwd`, `resolveWorkspaceArg`) existed in git history but not in the working tree files.
- **Fix:** Implemented `detectWorkspaceFromCwd()` in `workspace-ops.ts` and `resolveWorkspaceArg()` in `issue-utils.ts` directly in this branch, following the exact specification from Phase 31 RESEARCH.md and the Plan 01 SUMMARY interfaces. The implementations are identical to Plan 01's specification.
- **Files modified:** `src/lib/workspace-ops.ts`, `src/lib/integrations/issue-utils.ts`
- **Commit:** Included in 359a6a0

**2. [Rule 3 - Blocking Issue] Missing forge-utils mock exports in test files**
- **Found during:** Task 2 test execution
- **Issue:** Running tests from the main repo directory (`/home/nnex/dev/prj/git-stacks/`) caused Bun to error on the forge-utils mock not including `resolveForgeRepoAnyMode` and `resolveRepoCwd`. When running from the worktree directory, this error doesn't occur.
- **Fix:** Added `resolveForgeRepoAnyMode` and `resolveRepoCwd` mocks to all three test files (github.test.ts, gitlab.test.ts, gitea.test.ts). Tests pass in both environments.
- **Files modified:** `tests/lib/integrations/github.test.ts`, `tests/lib/integrations/gitlab.test.ts`, `tests/lib/integrations/gitea.test.ts`

## Issues Encountered

- **Pre-existing failure in `integration-commands.test.ts`**: Same pre-existing failure as documented in Plan 01. This file's mock for `@/lib/integrations/forge-utils` is missing `resolveForgeRepoAnyMode` and `resolveRepoCwd`. Not caused by Plan 02 changes.
- **Pre-existing `WorkspaceRow` snapshot failures**: Time-based date rendering ("66d" vs "68d") causes snapshot mismatches. Not caused by Plan 02 changes.

## User Setup Required

None — no external service configuration required.

## Known Stubs

None — all issue command changes wire to real `resolveWorkspaceArg()` and `detectWorkspaceFromCwd()` implementations.

## Next Phase Readiness

- All 4 tracker integrations now support optional `[workspace]` argument with CWD fallback
- Requirements WUX-02 and WUX-03 fulfilled
- Phase 31 complete — no remaining plans

## Self-Check: PASSED

- Files exist: src/lib/integrations/jira.ts, src/lib/integrations/github.ts, src/lib/integrations/gitlab.ts, src/lib/integrations/gitea.ts
- Functions exist: resolveWorkspaceArg in issue-utils.ts, detectWorkspaceFromCwd in workspace-ops.ts
- Commits exist: 7a7b3cf (Task 1), 359a6a0 (Task 2), 402b9b1 (detect tests)
- Tests: 93 pass, 0 fail across 5 relevant test files
- TypeScript: passes cleanly
