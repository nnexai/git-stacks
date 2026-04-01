---
phase: 50-integration-specific-tools
plan: 02
subsystem: cli
tags: [commander, integration, aerospace, vscode, subcommands, tests]

requires:
  - "50-01: configExample on Integration interface; generic config example/show/list commands"
provides:
  - commands() method with focus subcommand on aerospaceIntegration
  - commands() method with open subcommand on vscodeIntegration
  - Test coverage for all Phase 50 subcommands (list, config, aerospace focus, vscode open)
affects: [integration CLI surface, aerospace integration, vscode integration, test suite]

tech-stack:
  added: []
  patterns:
    - commands(parent: Command) on integration objects registers per-integration CLI subcommands
    - Workspace config cascade in commands(): ws override takes precedence over global config
    - focus:true entry lookup with workspaces[0] fallback for aerospace focus

key-files:
  created: []
  modified:
    - src/lib/integrations/aerospace.ts
    - src/lib/integrations/vscode.ts
    - tests/lib/integration-commands.test.ts

key-decisions:
  - "import type { Command } used in integration files (consistent with niri/tmux pattern — type-only annotation, value passed at runtime)"
  - "vscodeIntegration self-reference in commands() is safe — method is only called at runtime, binding fully resolved"
  - "aerospace focus uses same config cascade as open() — workspace override first, then global config"

patterns-established:
  - "commands(parent: Command) for per-integration action subcommands"
  - "mock.module('@/lib/aerospace') with full export coverage for tests that import integration files"
  - "mock.module('@/lib/vscode') for generateCodeWorkspace stub in integration command tests"

requirements-completed: []

duration: 4min
completed: 2026-04-01
---

# Phase 50 Plan 02: Integration-Specific Action Commands Summary

**`commands()` methods added to aerospace and vscode integrations; test suite extended with 9 new test cases covering all Phase 50 CLI subcommands**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-01T18:39:37Z
- **Completed:** 2026-04-01T18:43:23Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `commands()` method to `aerospaceIntegration` with `focus <workspace>` subcommand that resolves `focus:true` entry or falls back to `workspaces[0]`
- Added `commands()` method to `vscodeIntegration` with `open <workspace>` subcommand that calls `generate()` then `open()` with an empty ArtifactBag
- Extended `tests/lib/integration-commands.test.ts` with 9 new test cases covering all Phase 50 subcommands: list, config example/show, aerospace focus, vscode open, and intellij (no commands()) config fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Add commands() to aerospace and vscode integrations** - `a56544e` (feat)
2. **Task 2: Extend integration-commands tests for all Phase 50 subcommands** - `c40a70c` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/lib/integrations/aerospace.ts` — Added `import type { Command }`, `import { readGlobalConfig, readWorkspace, workspaceExists }`, and `commands()` method with `focus <workspace>` subcommand
- `src/lib/integrations/vscode.ts` — Added `import type { Command }`, `import { readGlobalConfig, readWorkspace, workspaceExists }`, `import { getTasksDir }`, and `commands()` method with `open <workspace>` subcommand
- `tests/lib/integration-commands.test.ts` — Added `makePathsMock` import, 3 new mock.module calls (`@/lib/aerospace`, `@/lib/vscode`, `@/lib/paths`), and 9 new test cases

## Decisions Made

- `import type { Command }` used in integration files, consistent with niri.ts and tmux.ts — Commander type is used only as annotation, value passed at runtime
- `vscodeIntegration` self-reference in `commands()` is safe — the method body is only executed at runtime, by which point the const binding is fully resolved (follows RESEARCH.md Pitfall 4)
- Aerospace focus uses same config cascade as `open()`: workspace-level settings override takes precedence over global config

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

All verification steps from plan passed:
1. `bun run typecheck` — zero errors
2. `bun run test` — all 23 integration-commands tests pass (9 new), all tests in suite pass
3. `bun run src/index.ts integration aerospace focus nonexistent` — prints "Workspace 'nonexistent' not found." and exits 1
4. `bun run src/index.ts integration vscode open nonexistent` — prints "Workspace 'nonexistent' not found." and exits 1
5. `bun run src/index.ts integration --help` — shows list plus all 10 integration IDs as subcommands

## Known Stubs

None - all commands are fully wired with runtime behavior.

## Self-Check: PASSED

- src/lib/integrations/aerospace.ts: FOUND
- src/lib/integrations/vscode.ts: FOUND
- tests/lib/integration-commands.test.ts: FOUND
- .planning/phases/50-integration-specific-tools/50-02-SUMMARY.md: FOUND
- Commit a56544e: FOUND
- Commit c40a70c: FOUND

---
*Phase: 50-integration-specific-tools*
*Completed: 2026-04-01*
