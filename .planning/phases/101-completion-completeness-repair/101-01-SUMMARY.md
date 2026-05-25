---
phase: 101-completion-completeness-repair
plan: 01
subsystem: completion
tags: [commander, shell-completion, cli-program]

requires:
  - phase: 101-completion-completeness-repair
    provides: Phase 101 context, research, patterns, and validation strategy
provides:
  - Shared live CLI program builder for completion and audit code
  - Live command path inventory helper
  - Generator mappings and tests for current completion surfaces
affects: [completion, verify-gates, cli-entrypoint]

tech-stack:
  added: []
  patterns: [shared Commander tree builder, live command path inventory, invariant completion tests]

key-files:
  created:
    - src/lib/cli-program.ts
  modified:
    - src/index.ts
    - src/lib/completion-generator.ts
    - tests/lib/completion-generator.test.ts

key-decisions:
  - "Keep version resolution and git-version checks in src/index.ts; keep buildCliProgram() side-effect-free until command actions run."
  - "Completion flag values for new --template and new --repo now use command-scoped dynamic mappings."

patterns-established:
  - "Use buildCliProgram() anywhere completion or audit code needs the real Commander tree."
  - "Use collectCommandPaths() for live command inventory instead of hand-maintained command lists."

requirements-completed: [COMP-01, COMP-02]

duration: 10min
completed: 2026-05-25
---

# Phase 101 Plan 01: Completion Inventory Audit and Generator Repair Summary

**Shared Commander tree builder with live command inventory and repaired dynamic completion mappings for the current v0.18/v0.19 command surface**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-25T15:45:00Z
- **Completed:** 2026-05-25T15:55:48Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Extracted CLI registration into `buildCliProgram()` while preserving `src/index.ts` startup behavior.
- Added `collectCommandPaths()` and real-program tests for `files`, `command`, `notes`, and integration config paths.
- Repaired command-scoped completion values for `new --template` and `new --repo` while keeping `command run` freeform boundaries.

## Task Commits

1. **Task 1 and Task 2: Shared builder plus generator coverage repair** - `4bf726e` (feat)

## Files Created/Modified

- `src/lib/cli-program.ts` - Shared Commander program builder and live path collector.
- `src/index.ts` - CLI startup now uses the shared builder while retaining version, git check, observability, default manage, and parse behavior.
- `src/lib/completion-generator.ts` - Adds scoped dynamic completions for `new --template` and `new --repo`.
- `tests/lib/completion-generator.test.ts` - Adds real-program coverage for current command families and workspace-source-adjacent flags.

## Decisions Made

Kept `buildCliProgram()` synchronous and side-effect-free at construction time. The dashboard plugin imports still happen only inside the `manage` action, and version resolution remains in `src/index.ts`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The documented focused command `bun run test -- tests/lib/completion-generator.test.ts` is stale for the current custom test runner and fails with `Unknown test runner argument`. Focused verification used `bun test tests/lib/completion-generator.test.ts`; repo gates are still run through the configured scripts.

## Verification

- `bun test tests/lib/completion-generator.test.ts` - passed, 140 tests.
- `bun run typecheck` - passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 02 can use `buildCliProgram()` and `collectCommandPaths()` as the live inventory source for shell-specific audit helpers and `verify:gates` enforcement.

---
*Phase: 101-completion-completeness-repair*
*Completed: 2026-05-25*
