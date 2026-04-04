---
phase: 64-schema-registry
plan: 02
subsystem: registry
tags: [detect, repo-registry, dir-mode, scan, cli]

# Dependency graph
requires:
  - phase: 64-01
    provides: RepoRegistryEntry with is_dir field and updated Zod schemas
provides:
  - scanForRepos with includeDirs option returning isDir flag on DiscoveredRepo
  - repo add accepts plain non-git directories (registered with is_dir: true)
  - repo scan wizard discovers and presents plain directories for registration
  - repo list/show display dir status indicators
affects:
  - 65-lifecycle
  - 66-git-guards

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ScanOptions interface pattern for optional scan behavior flags"
    - "isDir guard pattern: skip git/forge ops for dir repos in both CLI and TUI wizard"

key-files:
  created: []
  modified:
    - src/lib/detect.ts
    - src/commands/repo.ts
    - src/tui/repo-wizard.ts
    - tests/lib/detect.test.ts

key-decisions:
  - "Dir repos in repo-wizard registration loop skip git/forge detection entirely — no partial git op attempts"
  - "Backward compat preserved: scanForRepos() without options still filters to git-only"
  - "isDir computed at scan time from absence of .git, not stored in DiscoveredRepo as a separate concept"

patterns-established:
  - "ScanOptions pattern: extend scan functions with option objects rather than boolean flags"
  - "isDir guard: always branch on repo.isDir before any git operation in both CLI and wizard"

requirements-completed:
  - REG-01
  - REG-02

# Metrics
duration: 15min
completed: 2026-04-04
---

# Phase 64 Plan 02: Dir Repo Detection & CLI Support Summary

**scanForRepos gains includeDirs option returning isDir-flagged DiscoveredRepo entries; repo add/scan/list/show fully support non-git directories registered as is_dir: true**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-04T00:00:00Z
- **Completed:** 2026-04-04T00:00:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Extended `scanForRepos` in `detect.ts` with `ScanOptions.includeDirs` and `isDir` field on `DiscoveredRepo`; full backward compatibility preserved
- `repo add` now accepts plain directories (no .git), skips git/forge ops, registers with `is_dir: true`
- `repo scan` wizard calls `scanForRepos` with `includeDirs: true`, shows "dir" hint in multiselect, registers dir repos without git/forge detection
- `repo list` appends `[dir]` label; `repo show` prints `Dir mode: yes` for dir repos
- 6 new tests for `includeDirs` behavior; 1 existing test updated for `isDir` field

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend scanForRepos with includeDirs option** - `6e46f59` (feat)
2. **Task 2: Update repo add, list, show, and scan wizard for dir repos** - `f8f04f5` (feat)

## Files Created/Modified

- `src/lib/detect.ts` - Added `ScanOptions` interface, `isDir: boolean` to `DiscoveredRepo`, updated `scanForRepos` signature and filter logic
- `src/commands/repo.ts` - Removed `.git` guard from `repo add`; added `isDir` branch for git/forge skip; updated `repo list` and `repo show` output
- `src/tui/repo-wizard.ts` - Calls `scanForRepos` with `{ includeDirs: true }`; registration loop branches on `repo.isDir`
- `tests/lib/detect.test.ts` - 6 new `includeDirs` tests; updated `isDir: false` assertion in existing shape test

## Decisions Made

- Dir repos in the registration loop skip git/forge detection entirely — no partial git op attempts on non-git paths
- Backward compat preserved: `scanForRepos()` with no options still filters to git-only
- `isDir` computed at scan time from absence of `.git` directory, consistent with how `is_dir` is derived in `repo add`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. One pre-existing `files.test.ts` failure (`FILES-11: ~/relative path expands to absolute using HOME`) exists before and after this plan's changes — it is out of scope and logged to deferred items.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Registry surface for dir mode is complete: schemas (Plan 01) + detection/CLI (Plan 02)
- Phase 65 (lifecycle) can now implement workspace open/close/create logic that handles `mode: "dir"` repos
- Phase 66 (git guards) can use `is_dir` flag to skip git operations in workspace-ops

---
*Phase: 64-schema-registry*
*Completed: 2026-04-04*
