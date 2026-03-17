---
phase: 01-foundation
plan: 02
subsystem: config
tags: [zod, yaml, error-handling, schema-versioning, config]

# Dependency graph
requires: []
provides:
  - formatZodError utility function for human-readable Zod validation messages
  - schema_version field with default "1" on StackSchema and WorkspaceSchema
  - safeParse-based listStacks() that skips corrupt entries with stderr warning
  - safeParse-based listWorkspaces() that skips corrupt entries with stderr warning
  - readYaml produces human-readable field-path error messages instead of raw ZodError stack traces
  - Config resilience tests covering CONF-01 through CONF-04
affects: [workspace-ops, commands, all callers of listStacks/listWorkspaces]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "safeParse over .parse() in list functions to skip-and-warn rather than crash"
    - "ZodError imported as type-only for formatZodError signature"
    - "schema_version as string field with .default('1') for future read-time migrations"
    - "In-dir test fixture pattern: write _test-prefixed files to STACKS_DIR/WORKSPACES_DIR, clean up in afterEach"

key-files:
  created: []
  modified:
    - src/lib/config.ts
    - tests/lib/config.test.ts

key-decisions:
  - "Use try/catch with 'issues' property check in readYaml to detect ZodError without changing schema param type — keeps backward compatibility with callers"
  - "Write corrupt YAML tests directly to real STACKS_DIR with _test-prefixed filenames rather than trying to redirect HOME — Bun module cache makes HOME redirect ineffective once paths.ts is loaded"
  - "Export formatZodError so tests can call it directly rather than testing only through list functions"

patterns-established:
  - "formatZodError: converts ZodError.issues to 'field.path: message' dot-notation joined by semicolons"
  - "Corrupt YAML test pattern: use _test-corrupt- prefix, mkdirSync + writeFileSync directly, rmSync in afterEach"

requirements-completed: [CONF-01, CONF-02, CONF-03, CONF-04]

# Metrics
duration: 3min
completed: 2026-03-17
---

# Phase 01 Plan 02: Config Resilience and Schema Versioning Summary

**Zod-based config resilience with formatZodError utility, schema_version field, and safeParse in list functions — crashes on corrupt YAML replaced by stderr skip-and-warn**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-17T21:25:59Z
- **Completed:** 2026-03-17T21:29:47Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `formatZodError` utility that converts ZodError issues to dot-separated field-path messages joined by semicolons
- Added `schema_version: z.string().default("1")` to both StackSchema and WorkspaceSchema for future migration support
- Rewrote `listStacks()` and `listWorkspaces()` to use `.safeParse()` — corrupt entries are skipped with a `[git-stacks]` stderr warning, not a crash
- Updated `readYaml` to produce human-readable field-path error messages instead of raw ZodError stack traces
- Added 12 new tests covering all four CONF requirements: formatZodError output format, schema_version defaulting, minimal YAML shape guard, and corrupt YAML skip behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Add formatZodError, schema_version, and safeParse to config.ts** - `e9c0fbc` (feat)
2. **Task 2: Add config resilience tests to config.test.ts** - `e21cebb` (test)

## Files Created/Modified

- `src/lib/config.ts` - Added formatZodError, schema_version fields, safeParse in list functions, formatZodError in readYaml
- `tests/lib/config.test.ts` - Added 12 tests for formatZodError, schema_version, minimal YAML guard, corrupt YAML handling

## Decisions Made

- Used try/catch with `"issues" in err` check in `readYaml` to detect ZodError without changing the generic schema parameter type — backward compatible with all existing callers
- Wrote corrupt YAML tests directly to the real `STACKS_DIR`/`WORKSPACES_DIR` with `_test-corrupt-` prefixed filenames rather than trying to redirect `process.env.HOME`. Bun caches module evaluation so `paths.ts` constants are set once at load time regardless of HOME changes at runtime
- Exported `formatZodError` from `config.ts` so tests can call it directly and verify the output format precisely

## Deviations from Plan

None - plan executed exactly as written.

The corrupt YAML test approach differs slightly from the plan suggestion (plan mentioned `process.env.HOME = tmp` redirect + dynamic import of STACKS_DIR), but investigation confirmed Bun's module cache makes this pattern ineffective once `paths.ts` is loaded via the static import at line 3 of the test file. The direct file write approach produces correct behavior.

## Issues Encountered

None - all 83 tests pass with 0 regressions across the full test suite.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Config layer is now resilient to corrupt YAML — safe for production users with manually edited config files
- schema_version field is in place for future migration functions keyed by version
- formatZodError utility available for use anywhere ZodError messages need to be surfaced to users
- All CONF-01 through CONF-04 requirements are satisfied and tested

---
*Phase: 01-foundation*
*Completed: 2026-03-17*
