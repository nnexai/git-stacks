---
phase: 70-extract-remaining-domain-modules-and-workspace-ops-facade
plan: 03
subsystem: testing
tags: [workspace-ops, workspace-git, workspace-status, workspace-yaml, mock-factories, refactor]

requires:
  - phase: 70-02
    provides: workspace-git.ts, workspace-yaml.ts extracted with re-export shims in workspace-ops.ts
  - phase: 70-01
    provides: workspace-status.ts extracted with re-export shims in workspace-ops.ts

provides:
  - workspace-ops.ts as a thin lifecycle facade (openWorkspace, renameWorkspace, renameTemplate + env/lifecycle re-exports)
  - makeWorkspaceGitMock, makeWorkspaceStatusMock, makeWorkspaceYamlMock helpers in tests/helpers.ts
  - All test files import from correct domain modules (workspace-status, workspace-git, workspace-yaml)

affects: [70-04, any plan adding workspace tests, dashboard TUI tests]

tech-stack:
  added: []
  patterns:
    - "Domain module mock factories: makeWorkspaceGitMock, makeWorkspaceStatusMock, makeWorkspaceYamlMock"
    - "Real-captures split: yaml symbols captured from workspace-yaml, lifecycle from workspace-ops"

key-files:
  created: []
  modified:
    - src/lib/workspace-ops.ts
    - tests/helpers.ts
    - tests/lib/workspace-ops.test.ts
    - tests/lib/pull.test.ts
    - tests/lib/detect-workspace-cwd.test.ts
    - tests/commands/workspace-edit.test.ts
    - tests/tui/workspace-wizard.test.ts
    - tests/tui/dashboard/integ-action-menu.test.tsx
    - tests/tui/dashboard/integ-sync-progress.test.tsx
    - tests/tui/dashboard/integ-tab-switching.test.tsx
    - tests/tui/dashboard/integ-wizard.test.tsx

key-decisions:
  - "workspace-ops.ts facade is now 346 lines — only openWorkspace, renameWorkspace, renameTemplate natively, plus env/lifecycle re-exports"
  - "Dashboard integ tests use relative path mocks (../../../src/lib/workspace-*) — new domain module mocks added with same pattern"
  - "makeWorkspaceOpsMock trimmed to exact facade boundary; moved symbols have dedicated factory functions"

patterns-established:
  - "Per-domain mock factory: each domain module has its own makeXxxMock() in helpers.ts"
  - "Real-capture split: helpers.ts imports from the actual home module of each symbol, not from the facade"

requirements-completed: [EXTR-01, EXTR-08]

duration: 20min
completed: 2026-04-05
---

# Phase 70 Plan 03: Workspace-ops Facade Cleanup Summary

**workspace-ops.ts reduced to a 346-line lifecycle facade — zero re-export shims for status/git/yaml; test mocks split across three new domain-module mock factories**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-05T18:00:00Z
- **Completed:** 2026-04-05T18:20:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Removed all status/git/yaml re-export shims from workspace-ops.ts, leaving only env/lifecycle re-exports and the 3 native functions
- Added `makeWorkspaceGitMock`, `makeWorkspaceStatusMock`, `makeWorkspaceYamlMock` factories to tests/helpers.ts
- Updated 8 test files to import from correct domain modules and use the new factories
- Split real-captures in helpers.ts so yaml symbols come from workspace-yaml directly
- 1275 tests pass, 0 failures; zero circular dependencies confirmed with madge

## Task Commits

1. **Task 1: Remove re-export shims from workspace-ops.ts** - `0fa91344` (refactor)
2. **Task 2: Update test mocks to use domain module factories** - `0980c5bf` (refactor)

## Files Created/Modified

- `src/lib/workspace-ops.ts` — removed status/git/yaml shims; now 346 lines (target was 300-400)
- `tests/helpers.ts` — trimmed makeWorkspaceOpsMock; added 3 new mock factories; split real-captures
- `tests/lib/workspace-ops.test.ts` — imports getWorkspaceListInfo/getWorkspaceStatus from workspace-status; pushWorkspace/syncWorkspace from workspace-git
- `tests/lib/pull.test.ts` — imports pullWorkspace from workspace-git
- `tests/lib/detect-workspace-cwd.test.ts` — imports detectWorkspaceFromCwd from workspace-status
- `tests/commands/workspace-edit.test.ts` — adds workspace-status/yaml/git mocks alongside workspace-ops mock
- `tests/tui/workspace-wizard.test.ts` — adds workspace-status/yaml/git mocks alongside workspace-ops mock
- `tests/tui/dashboard/integ-action-menu.test.tsx` — adds workspace-git/status/yaml mocks (relative paths)
- `tests/tui/dashboard/integ-sync-progress.test.tsx` — moves syncWorkspace mock to workspace-git (relative path)
- `tests/tui/dashboard/integ-tab-switching.test.tsx` — adds workspace-git/status/yaml mocks (relative paths)
- `tests/tui/dashboard/integ-wizard.test.tsx` — adds workspace-git/status/yaml mocks (relative paths)

## Decisions Made

- Dashboard integ tests use `../../../src/lib/workspace-*` relative paths (not `@/lib/*` alias) — new domain module mocks follow the same pattern for consistency
- `makeWorkspaceOpsMock` is now exactly what workspace-ops.ts exports: env re-exports + lifecycle re-exports + openWorkspace/renameWorkspace/renameTemplate
- Real-captures in helpers.ts are split at the source: `editTemplateYaml`, `editGlobalConfigYaml`, `editRegistryYaml` now captured from `@/lib/workspace-yaml` directly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None — all domain module functions are fully wired to real implementations.

## Threat Flags

None — test infrastructure changes only, no new trust boundaries.

## Next Phase Readiness

- Phase 70 extraction complete: workspace-ops.ts is the clean lifecycle facade per D-02
- All 4 domain modules (workspace-env, workspace-lifecycle, workspace-status, workspace-git, workspace-yaml) are independently testable
- Ready for Phase 70-04 (if any remaining tasks) or next milestone

---
*Phase: 70-extract-remaining-domain-modules-and-workspace-ops-facade*
*Completed: 2026-04-05*
