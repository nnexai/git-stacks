---
phase: 87-integration-contract-and-source-module-coverage
plan: 02
subsystem: testing
tags: [integrations, github, gitlab, gitea, jira, command-contracts]

requires:
  - phase: 87-integration-contract-and-source-module-coverage
    provides: Plan 01 utility source coverage boundaries
provides:
  - GitHub and GitLab injected executor command failure contracts
  - Gitea JSON parse, missing entity, browser-open, and capture failure contracts
  - Jira configured/default shell-open command contracts
affects: [phase-87, integration-coverage, phase-88-readiness]

tech-stack:
  added: []
  patterns:
    - Commander command contract tests with injected `_exec` seams
    - Process-exit interception for safe failure branch coverage

key-files:
  created:
    - .planning/phases/87-integration-contract-and-source-module-coverage/87-02-SUMMARY.md
  modified:
    - tests/lib/integrations/github.test.ts
    - tests/lib/integrations/gitlab.test.ts
    - tests/lib/integrations/gitea.test.ts
    - tests/lib/integrations/jira.test.ts

key-decisions:
  - "Forge command tests keep forge-utils and issue-utils as boundary mocks while exercising real command modules and injected executors."
  - "External forge CLIs, browser openers, and Jira shell commands remain fully intercepted by `_exec` mocks."

patterns-established:
  - "Representative nonzero executor results must assert the exact `process.exit(exitCode)` propagation."
  - "Missing repo and missing issue branches assert that executor calls are not made."

requirements-completed: [INTG-03, GATE-03]

duration: 12 min
completed: 2026-05-15
---

# Phase 87 Plan 02: Forge Command Contract Summary

**Forge command modules now prove argument construction and safe failure behavior through injected executor contracts.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-15T05:30:00Z
- **Completed:** 2026-05-15T05:42:04Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added GitHub and GitLab repository-open assertions plus missing repo, missing issue, and nonzero executor exit propagation coverage.
- Added Gitea repository-open, malformed JSON, missing PR/issue, and capture exit coverage while keeping browser opening behind `_exec.openUrl`.
- Added Jira configured/default open command assertions and nonzero shell command exit propagation.

## Task Commits

1. **Task 1: Add GitHub and GitLab command failure contracts** - `3e7be01` (test)
2. **Task 2: Add Gitea and Jira parse/browser/open contracts** - `617e06a` (test)

## Files Created/Modified

- `tests/lib/integrations/github.test.ts` - GitHub open, no-run, and exit propagation contracts.
- `tests/lib/integrations/gitlab.test.ts` - GitLab open, no-run, and exit propagation contracts.
- `tests/lib/integrations/gitea.test.ts` - Gitea parse failure, missing entity, capture exit, and open contracts.
- `tests/lib/integrations/jira.test.ts` - Jira open command template and exit propagation contracts.
- `.planning/phases/87-integration-contract-and-source-module-coverage/87-02-SUMMARY.md` - Execution summary and verification record.

## Decisions Made

- Kept command module tests at the command-registration boundary, with utility resolution mocked and executor calls asserted.
- Did not launch real `gh`, `glab`, `tea`, Jira CLI, browser openers, or shell commands.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `bun test tests/lib/integrations/github.test.ts tests/lib/integrations/gitlab.test.ts` - PASS
- `bun test tests/lib/integrations/gitea.test.ts tests/lib/integrations/jira.test.ts` - PASS
- `bun test tests/lib/integrations/github.test.ts tests/lib/integrations/gitlab.test.ts tests/lib/integrations/gitea.test.ts tests/lib/integrations/jira.test.ts` - PASS
- `bun run test:unit` - PASS
- `bun run typecheck` - PASS

## Next Phase Readiness

Plan 87-03 can use the same injected-effect pattern for session and IDE integration modules.

## Self-Check: PASSED

- Created summary exists.
- Task commits exist: `3e7be01`, `617e06a`.
- Key files modified as planned.

---
*Phase: 87-integration-contract-and-source-module-coverage*
*Completed: 2026-05-15*
