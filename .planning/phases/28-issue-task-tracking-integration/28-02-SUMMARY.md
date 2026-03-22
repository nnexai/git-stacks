---
phase: 28-issue-task-tracking-integration
plan: 02
subsystem: integrations
tags: [github, gitlab, gitea, issue-tracking, forge, tdd]

requires:
  - phase: 28-01
    provides: "issue-utils.ts with linkIssue, unlinkIssue, resolveIssueRef, formatIssueError helpers"
  - phase: 27-git-forge-integrations
    provides: "github.ts, gitlab.ts, gitea.ts with pr subcommands; forge-utils resolveForgeRepo"

provides:
  - "github.ts issue command group: issue link/unlink/open (gh issue view)"
  - "gitlab.ts issue command group: issue link/unlink/open (glab issue view)"
  - "gitea.ts issue command group: issue link/unlink/open (tea issues ls JSON extraction)"
  - "Extended test coverage: 6 issue tests for github, 6 for gitlab, 7 for gitea"

affects:
  - "28-03-jira"
  - "28-04-workspace-status"
  - "commands/workspace.ts (if issue status integrated into ws status)"

tech-stack:
  added: []
  patterns:
    - "issue open pattern: resolveIssueRef for issue ID + resolveForgeRepo for CWD"
    - "Gitea issue open: JSON URL extraction via tea issues ls (no issue view command)"
    - "html_url ?? url fallback for tea JSON output version differences"

key-files:
  created: []
  modified:
    - src/lib/integrations/github.ts
    - src/lib/integrations/gitlab.ts
    - src/lib/integrations/gitea.ts
    - tests/lib/integrations/github.test.ts
    - tests/lib/integrations/gitlab.test.ts
    - tests/lib/integrations/gitea.test.ts

key-decisions:
  - "Gitea issue open uses tea issues ls --output json --fields index,url --state all (tea has no issue view command)"
  - "GitHub issue open no-web uses --json url --jq .url (matches PR open pattern)"
  - "GitLab issue open no-web uses --output json (matches glab mr view pattern)"
  - "All issue link/unlink delegate to issue-utils pure YAML ops — no forge CLI needed"
  - "mock.module('@/lib/config') for workspaceExists needed in tests since forge plugins now import from config"

patterns-established:
  - "issue command group follows identical structure to pr command group in each forge plugin"
  - "issue open always calls both resolveIssueRef (for ID) and resolveForgeRepo (for CWD)"
  - "Gitea: JSON listing approach reused from pr open — runCapture + find by index"

requirements-completed: [ISSUE-04, ISSUE-05, ISSUE-06]

duration: 5min
completed: 2026-03-22
---

# Phase 28 Plan 02: Issue Subcommands for All Forge Integrations Summary

**issue link/unlink/open added to github.ts, gitlab.ts, gitea.ts using forge-specific CLI invocations; 19 new tests covering all issue commands across all three forges**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-22T17:38:04Z
- **Completed:** 2026-03-22T17:43:04Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- GitHub integration: `issue link`, `issue unlink`, `issue open` (gh issue view) alongside existing pr commands
- GitLab integration: `issue link`, `issue unlink`, `issue open` (glab issue view) alongside existing pr commands
- Gitea integration: `issue link`, `issue unlink`, `issue open` (tea issues ls JSON extraction + openUrl) alongside existing pr commands
- All three forges share identical link/unlink pattern delegating to issue-utils; only issue open is forge-specific
- Full TDD with 48 tests passing across all three forge test files (19 new issue tests)
- Typecheck clean after fixing mock return type errors (union type workspace field)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add issue subcommands to GitHub and GitLab integrations** - `d5020c6` (feat)
2. **Task 2: Add issue subcommands to Gitea integration with JSON URL extraction** - `aa7f23b` (feat)

**Plan typecheck fix:** `f60b106` (fix: TypeScript type errors in forge test mock return values)

_Note: TDD tasks have RED/GREEN/REFACTOR commits; typecheck fix committed separately_

## Files Created/Modified

- `src/lib/integrations/github.ts` - Added issue command group: link, unlink, open (gh issue view --web / --json url --jq .url); updated hint to mention issues
- `src/lib/integrations/gitlab.ts` - Added issue command group: link, unlink, open (glab issue view --web / --output json); updated hint to mention issues
- `src/lib/integrations/gitea.ts` - Added issue command group: link, unlink, open (tea issues ls JSON extraction, html_url ?? url fallback, openUrl for --web); updated hint to mention issues
- `tests/lib/integrations/github.test.ts` - Added mock.module for issue-utils and config; describe('github issue commands') with 6 tests
- `tests/lib/integrations/gitlab.test.ts` - Added mock.module for issue-utils and config; describe('gitlab issue commands') with 6 tests
- `tests/lib/integrations/gitea.test.ts` - Added mock.module for issue-utils and config; describe('gitea issue commands') with 7 tests

## Decisions Made

- **Gitea issue open implementation**: tea CLI has no `issue view` command. Reused the same `runCapture + JSON.parse + find` pattern from `pr open`, but searching by `index` field instead of `head.ref`. Used `html_url ?? url` fallback since different tea versions use different field names.
- **mock.module('@/lib/config')** added to all three test files — the forge plugins now import `workspaceExists` from config, so tests need to mock it to prevent filesystem reads.
- **TypeScript union type**: The `IssueRefResolutionError` with `no_issue_linked` has `workspace: string` (not object). Mock return type clashes required `as any` cast for the error-path test implementations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type errors in test mock implementations**
- **Found during:** Post-task typecheck (`bun run typecheck`)
- **Issue:** Test mocks had type mismatches: `workspace: "my-ws"` (string) vs inferred object type from mock's initial return, and incomplete workspace object shapes missing `branch`/`repos` fields
- **Fix:** Added `as any` cast for error-path mock implementations; expanded mock workspace objects to include all required fields; added `resolveIssueRefMock.mockImplementation` with full shape in web-test variants
- **Files modified:** tests/lib/integrations/github.test.ts, tests/lib/integrations/gitlab.test.ts, tests/lib/integrations/gitea.test.ts
- **Verification:** `bun run typecheck` exits clean; all 727 tests pass
- **Committed in:** f60b106

---

**Total deviations:** 1 auto-fixed (Rule 1 - type errors in test mocks)
**Impact on plan:** Necessary for TypeScript correctness. No scope creep.

## Issues Encountered

None — plan executed as specified. Typecheck revealed minor mock type issues fixed automatically.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three forge plugins now have both `pr` and `issue` command groups
- issue-utils helpers tested end-to-end via command-level integration tests
- Ready for Phase 28-03 (Jira integration) and 28-04 (workspace status with issue display)

---
*Phase: 28-issue-task-tracking-integration*
*Completed: 2026-03-22*

## Self-Check: PASSED

- FOUND: src/lib/integrations/github.ts
- FOUND: src/lib/integrations/gitlab.ts
- FOUND: src/lib/integrations/gitea.ts
- FOUND: tests/lib/integrations/github.test.ts
- FOUND: tests/lib/integrations/gitlab.test.ts
- FOUND: tests/lib/integrations/gitea.test.ts
- FOUND: d5020c6 (feat: GitHub + GitLab issue commands)
- FOUND: aa7f23b (feat: Gitea issue commands)
- FOUND: f60b106 (fix: TypeScript type errors in test mocks)
