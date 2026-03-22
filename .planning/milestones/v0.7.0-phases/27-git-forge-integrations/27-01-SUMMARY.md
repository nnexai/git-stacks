---
phase: 27-git-forge-integrations
plan: 01
subsystem: integrations
tags: [forge, github, gitlab, gitea, registry, zod, schema, worktree]

# Dependency graph
requires: []
provides:
  - ForgeTypeSchema and ForgeType exported from src/lib/config.ts
  - Optional forge field on RepoRegistryEntrySchema (github/gitlab/gitea enum)
  - forge-utils.ts module with resolveForgeRepo and formatForgeError
  - ForgeRepoResolution and ForgeRepoResolutionError discriminated union types
affects:
  - 27-02 (GitHub PR integration — imports resolveForgeRepo from forge-utils)
  - 27-03 (GitLab MR integration — imports resolveForgeRepo from forge-utils)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - resolveForgeRepo: shared workspace+repo resolution utility for all forge integrations
    - ForgeRepoResolutionError discriminated union: exhaustive error variant pattern with formatForgeError
    - mock.module config isolation: mock workspaceExists/readWorkspace/readRegistry for forge-utils tests

key-files:
  created:
    - src/lib/integrations/forge-utils.ts
    - tests/lib/integrations/forge-utils.test.ts
  modified:
    - src/lib/config.ts
    - tests/lib/config.test.ts

key-decisions:
  - "resolveForgeRepo validates registry forge field against expected forge before returning success (FORGE-11 / D-14) — enables early error with actionable message before any forge CLI invocation"
  - "ForgeTypeSchema declared as z.enum(['github','gitlab','gitea']).optional() — omission is valid for repos not using forge integrations (backward compat FORGE-02)"

patterns-established:
  - "forge-utils pattern: shared resolution module imported by all forge integration plugins — avoids duplicating workspace/repo lookup logic across 27-02 and 27-03"

requirements-completed: [FORGE-01, FORGE-02, FORGE-03, FORGE-11]

# Metrics
duration: 2min
completed: 2026-03-22
---

# Phase 27 Plan 01: Git Forge Integration Foundation Summary

**ForgeTypeSchema added to registry schema and resolveForgeRepo utility created — shared foundation for GitHub PR and GitLab MR integrations with forge field validation per D-14**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-22T16:09:48Z
- **Completed:** 2026-03-22T16:12:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added `ForgeTypeSchema = z.enum(["github", "gitlab", "gitea"]).optional()` and `ForgeType` to config.ts
- Added optional `forge` field to `RepoRegistryEntrySchema` — backward compatible (existing YAML without forge field parses cleanly)
- Created `forge-utils.ts` with `resolveForgeRepo()` that auto-selects single worktree repo, errors with repo list on ambiguity, and validates registry forge field against expected forge
- Created comprehensive test suite with 16 test cases covering all resolution scenarios and all 5 error variants including forge mismatch (D-14)

## Task Commits

Each task was committed atomically (TDD: RED then GREEN):

1. **Task 1 RED: forge field schema tests** - `3a73029` (feat) — combined RED+GREEN since schema change is atomic
2. **Task 2 RED: forge-utils test file** - `b824f75` (test)
3. **Task 2 GREEN: forge-utils.ts implementation** - `7ab00ab` (feat)

_Note: TDD tasks have RED (failing tests) then GREEN (implementation) commits_

## Files Created/Modified
- `src/lib/config.ts` - Added `ForgeTypeSchema`, `ForgeType`, and `forge: ForgeTypeSchema` field to `RepoRegistryEntrySchema`
- `tests/lib/config.test.ts` - Added `describe("RepoRegistryEntrySchema forge field")` with 5 test cases
- `src/lib/integrations/forge-utils.ts` - New module: `resolveForgeRepo`, `formatForgeError`, `ForgeRepoResolution`, `ForgeRepoResolutionError`
- `tests/lib/integrations/forge-utils.test.ts` - New test file: 16 tests using mock.module config isolation

## Decisions Made
- `resolveForgeRepo` validates `registryEntry?.forge !== forge` and returns `forge_not_configured` error — this ensures forge integrations fail fast with an actionable message rather than invoking the wrong forge CLI
- ForgeType is `"github" | "gitlab" | "gitea" | undefined` — undefined means no forge configured (backward compat, repos without forge field still parse)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plans 02 and 03 can now import `resolveForgeRepo` and `formatForgeError` from `@/lib/integrations/forge-utils`
- `ForgeType` is available for type-level forge discrimination in integration plugins
- Registry YAML can now include `forge: github` (or gitlab/gitea) per repo entry

---
*Phase: 27-git-forge-integrations*
*Completed: 2026-03-22*

## Self-Check: PASSED

- src/lib/config.ts: FOUND
- src/lib/integrations/forge-utils.ts: FOUND
- tests/lib/integrations/forge-utils.test.ts: FOUND
- tests/lib/config.test.ts: FOUND
- Commit 3a73029: FOUND
- Commit b824f75: FOUND
- Commit 7ab00ab: FOUND
