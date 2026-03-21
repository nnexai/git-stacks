---
phase: 16-artifact-type-foundation
plan: 01
subsystem: integrations
tags: [typescript, discriminated-union, artifact-bag, integration-pipeline]

# Dependency graph
requires: []
provides:
  - TmuxArtifact, CmuxArtifact, WindowArtifact discriminated union types in src/lib/integrations/types.ts
  - IntegrationArtifact union type and ArtifactBag type alias
  - Updated Integration.open() signature: (ctx, artifactPath, bag) => Promise<IntegrationArtifact | null>
  - ArtifactBag construction and threading in workspace-ops.ts integration loop
affects: [17-integration-runner, 18-integration-artifacts, 19-niri-shell-wrappers, 20-niri-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [discriminated-union artifact types, ArtifactBag accumulator pattern in integration loop]

key-files:
  created: []
  modified:
    - src/lib/integrations/types.ts
    - src/lib/integrations/index.ts
    - src/lib/integrations/tmux.ts
    - src/lib/integrations/cmux.ts
    - src/lib/integrations/vscode.ts
    - src/lib/integrations/intellij.ts
    - src/lib/workspace-ops.ts

key-decisions:
  - "All four existing integrations return null from open() — real artifact values deferred to Phase 18"
  - "ArtifactBag is Record<string, IntegrationArtifact | null> keyed by integration.id — downstream integrations can read prior artifacts by known key"
  - "WindowArtifact carries pid, app_id, and title to support niri snapshot-diff window identification in Phase 20"

patterns-established:
  - "Integration.open() signature: (ctx: IntegrationContext, artifactPath: string | null, bag: ArtifactBag) => Promise<IntegrationArtifact | null>"
  - "workspace-ops.ts accumulates artifacts: const artifact = await integration.open(ctx, artifactPath, bag); bag[integration.id] = artifact"

requirements-completed: [ORCH-01, ORCH-02, ART-05, ART-06, TEST-03]

# Metrics
duration: 2min
completed: 2026-03-21
---

# Phase 16 Plan 01: Artifact Type Foundation Summary

**Typed integration artifact pipeline: TmuxArtifact/CmuxArtifact/WindowArtifact discriminated union, ArtifactBag accumulator, and updated Integration.open() signature threaded through all four integrations and workspace-ops**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-21T22:28:15Z
- **Completed:** 2026-03-21T22:30:11Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Defined TmuxArtifact, CmuxArtifact, WindowArtifact discriminated union types and IntegrationArtifact union in types.ts
- Added ArtifactBag type (Record<string, IntegrationArtifact | null>) and updated Integration.open() interface signature
- Updated all four integration implementations (tmux, cmux, vscode, intellij) to accept bag parameter and return null
- Updated workspace-ops.ts to construct ArtifactBag and accumulate artifacts from each integration.open() call
- All 375 tests pass unchanged; bun run typecheck exits 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Define artifact types and update Integration interface** - `10dacdd` (feat)
2. **Task 2: Update all integration implementations and workspace-ops caller** - `c082b7a` (feat)

## Files Created/Modified

- `src/lib/integrations/types.ts` - Added TmuxArtifact, CmuxArtifact, WindowArtifact, IntegrationArtifact, ArtifactBag types; updated Integration.open() signature
- `src/lib/integrations/index.ts` - Re-exports IntegrationArtifact and ArtifactBag from types
- `src/lib/integrations/tmux.ts` - Updated open() to accept _bag param, added return null
- `src/lib/integrations/cmux.ts` - Updated open() to accept _bag param, added return null
- `src/lib/integrations/vscode.ts` - Updated open() to accept _bag param, replaced all bare returns with return null
- `src/lib/integrations/intellij.ts` - Updated open() to accept _bag param, replaced all bare returns with return null
- `src/lib/workspace-ops.ts` - Added ArtifactBag import, constructed bag before loop, collects artifact from each open() call

## Decisions Made

- All four existing integrations return null — real artifact values (tmux session names, window PIDs) are deferred to Phase 18 where the actual IPC/spawn logic is added
- ArtifactBag uses integration.id as the key so downstream integrations (e.g., niri in Phase 20) can look up upstream artifacts by well-known string key
- WindowArtifact carries pid, app_id, and title fields to support the niri snapshot-diff identification strategy documented in research

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- IntegrationArtifact types and ArtifactBag are defined and threaded through all callers — Phase 17 (integration runner/ordering) and Phase 18 (real artifact return values) can proceed
- Phase 19 (niri-shell-wrappers) can proceed independently since it only depends on Phase 16 types
- Phase 20 (niri integration) can implement niri's open() using the WindowArtifact type and reading prior artifacts from the bag

---
*Phase: 16-artifact-type-foundation*
*Completed: 2026-03-21*

## Self-Check: PASSED

- All 7 modified source files exist on disk
- Both task commits verified: 10dacdd, c082b7a
- SUMMARY.md created at .planning/phases/16-artifact-type-foundation/16-01-SUMMARY.md
