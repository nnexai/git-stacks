---
phase: 24-mock-architecture-refactor
plan: 02
subsystem: testing
tags: [mocking, clack-prompts, tui, imports, testability]

# Dependency graph
requires:
  - phase: 24-01
    provides: "D-04 decision: prompts wrapper pattern; D-05 decision: safeText routing; all plan decisions and context"
provides:
  - "prompts wrapper object in tui/utils.ts re-exporting all @clack/prompts functions"
  - "Single mock boundary for prompt interactions via @/tui/utils"
  - "All 15 production files import prompts through @/tui/utils instead of @clack/prompts directly"
  - "safeText routes through prompts.text for full mockability"
affects: [24-03, future-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "prompts wrapper object — mutable re-export of @clack/prompts functions enabling per-property mock replacement"
    - "import { prompts as p } from @/tui/utils — single import line pattern for all prompt usage"
    - "Dynamic import replacement — static import at top of file replaces lazy dynamic import for uniformity"

key-files:
  created: []
  modified:
    - "src/tui/utils.ts — adds prompts wrapper object; safeText routes through prompts.text"
    - "src/commands/workspace.ts — switched to @/tui/utils"
    - "src/commands/install.ts — switched to @/tui/utils"
    - "src/commands/doctor.ts — switched to @/tui/utils"
    - "src/commands/template.ts — switched to @/tui/utils"
    - "src/commands/config.ts — merged duplicate imports, switched to @/tui/utils"
    - "src/commands/repo.ts — removed dynamic import, added static import via @/tui/utils"
    - "src/lib/integrations/niri.ts — switched to @/tui/utils"
    - "src/lib/integrations/tmux.ts — switched to @/tui/utils"
    - "src/lib/integrations/cmux.ts — switched to @/tui/utils"
    - "src/lib/integrations/wizard-helpers.ts — merged imports, switched to @/tui/utils"
    - "src/lib/integrations/vscode.ts — merged imports, switched to @/tui/utils"
    - "src/tui/workspace-clone.ts — merged imports, switched to @/tui/utils"
    - "src/tui/workspace-wizard.ts — merged imports, switched to @/tui/utils"
    - "src/tui/template-wizard.ts — merged imports, switched to @/tui/utils"
    - "src/tui/repo-wizard.ts — merged imports, switched to @/tui/utils"
    - "tests/tui/workspace-wizard.test.ts — added prompts to @/tui/utils mock"
    - "tests/commands/workspace-edit.test.ts — added prompts to @/tui/utils mock"

key-decisions:
  - "prompts as p alias preserves all p.confirm/p.select call sites without rewriting them"
  - "Tests mocking @/tui/utils directly need prompts property added to mock shape"
  - "Tests mocking @clack/prompts directly (not @/tui/utils) work unchanged — tui/utils.ts picks up the mock at module load time"

patterns-established:
  - "Import prompts via @/tui/utils mock shape: { safeText, cancel, prompts: { ... all functions ... } }"

requirements-completed: [MOCK-03, MOCK-04]

# Metrics
duration: 8min
completed: 2026-03-22
---

# Phase 24 Plan 02: Prompts Wrapper and Import Switch Summary

**`prompts` wrapper object in tui/utils.ts routes all 15 production files through a single mutable boundary, enabling test-level mock replacement of individual @clack/prompts functions without mock.module**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-22T12:44:00Z
- **Completed:** 2026-03-22T12:52:00Z
- **Tasks:** 2
- **Files modified:** 18 (16 production + 2 test files)

## Accomplishments

- Extended `src/tui/utils.ts` with a mutable `prompts` object re-exporting all 13 @clack/prompts functions used in production code
- `safeText()` now routes through `prompts.text` so mocking `prompts.text` in tests also affects safeText behavior
- Switched all 15 production files from `import * as p from "@clack/prompts"` to `import { prompts as p } from "@/tui/utils"` using the alias pattern — zero call-site changes needed
- Replaced the dynamic `await import("@clack/prompts")` in `repo.ts` with a static top-level import for consistency
- Fixed test mock shapes in 2 test files that mock `@/tui/utils` directly (needed `prompts` added to the mock object)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add prompts object to tui/utils.ts** - `d73ed8d` (feat)
2. **Task 2: Switch all production imports from @clack/prompts to @/tui/utils** - `3ad1764` (feat)

## Files Created/Modified

- `src/tui/utils.ts` — adds `export const prompts` with all @clack/prompts re-exports; safeText uses `prompts.text`
- `src/commands/workspace.ts` — `import { prompts as p } from "@/tui/utils"`
- `src/commands/install.ts` — `import { prompts as p } from "@/tui/utils"`
- `src/commands/doctor.ts` — `import { prompts as p } from "@/tui/utils"`
- `src/commands/template.ts` — `import { prompts as p } from "@/tui/utils"`
- `src/commands/config.ts` — merged `cancel`, `safeText`, `prompts as p` into single `@/tui/utils` import
- `src/commands/repo.ts` — removed dynamic import, added static `import { prompts as p } from "@/tui/utils"`
- `src/lib/integrations/niri.ts` — switched to `@/tui/utils`
- `src/lib/integrations/tmux.ts` — switched to `@/tui/utils`
- `src/lib/integrations/cmux.ts` — switched to `@/tui/utils`
- `src/lib/integrations/wizard-helpers.ts` — merged `cancel` + `prompts as p` into single import
- `src/lib/integrations/vscode.ts` — merged `safeText` + `prompts as p` into single import
- `src/tui/workspace-clone.ts` — merged existing utils imports with `prompts as p`
- `src/tui/workspace-wizard.ts` — merged existing utils imports with `prompts as p`
- `src/tui/template-wizard.ts` — merged existing utils imports with `prompts as p`
- `src/tui/repo-wizard.ts` — merged existing utils imports with `prompts as p`
- `tests/tui/workspace-wizard.test.ts` — added `prompts` object to `@/tui/utils` mock
- `tests/commands/workspace-edit.test.ts` — added `prompts` object to `@/tui/utils` mock

## Decisions Made

- Used `import { prompts as p }` alias to preserve all existing `p.confirm(...)` / `p.spinner()` call sites without changes
- Tests that mock `@/tui/utils` directly must include `prompts` in the mock shape; tests that only mock `@clack/prompts` work unchanged (tui/utils.ts picks up the mock at module load time via its own `import * as p from "@clack/prompts"`)
- Deferred pre-existing TS6133 error in `tests/lib/tmux.test.ts` (unused `openTmuxSession` variable) — not caused by this plan's changes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incomplete @/tui/utils mock shapes in two test files**
- **Found during:** Task 2 (Switch all production imports)
- **Issue:** Tests that mock `@/tui/utils` with `{ safeText, cancel }` had no `prompts` property, so `prompts.select(...)` etc. threw "Cannot read property of undefined"
- **Fix:** Added complete `prompts` object to mock shapes in `workspace-wizard.test.ts` and `workspace-edit.test.ts`, reusing existing mock functions (mockSelect, mockConfirm, etc.)
- **Files modified:** `tests/tui/workspace-wizard.test.ts`, `tests/commands/workspace-edit.test.ts`
- **Verification:** All 20 tests across 4 target files pass
- **Committed in:** `3ad1764` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Essential fix — tests were failing due to incomplete mock shape after import switch. No scope creep.

## Issues Encountered

- Pre-existing TypeScript error in `tests/lib/tmux.test.ts` (TS6133: openTmuxSession declared but never used) — deferred to `deferred-items.md`, not caused by this plan

## Known Stubs

None.

## Next Phase Readiness

- Mock boundary fully established: all prompt interactions flow through `@/tui/utils`
- Ready for Phase 24-03: write tests that replace `prompts.confirm`, `prompts.select`, etc. as instance properties instead of using `mock.module("@clack/prompts")`
- The `_exec` injectable pattern (established in Phase 19) and the new `prompts` wrapper pattern provide consistent dependency injection across all integration and TUI code

---
*Phase: 24-mock-architecture-refactor*
*Completed: 2026-03-22*
