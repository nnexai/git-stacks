---
phase: 75-di-seams-structured-logging
plan: 02
subsystem: observability
tags: [structured-logging, debug, stderr, selector, filtering, env-vars]

requires:
  - phase: 75-01-di-seams-structured-logging
    provides: workspace-lifecycle and workspace-git _exec seams

provides:
  - GS_DEBUG selector syntax for structured stderr debug output
  - MODULE_ALIASES map normalizing short names to internal category names
  - Selector-aware configureObservability(string | undefined) with filtering
  - Structured single-line stderr fields: op= module= msg= [ms=]
  - Legacy GIT_STACKS_DEBUG=1 alias wired in src/index.ts bootstrap
  - Regression test coverage for selector parsing, structured output, and CLI behavior

affects:
  - phase: 75-03 (if any) — observability contract established
  - future phases using logDebug/timeOperation — module names now emit as short aliases

tech-stack:
  added: []
  patterns:
    - "configureObservability accepts string selector: '1'/'true'=all, '0'/'false'/undefined=off, token list=filtered"
    - "MODULE_ALIASES map: short token -> internal workspace-* category"
    - "Structured log lines: op=<operation> module=<short-name> msg=<sanitized> [ms=<int>]"
    - "Single bootstrap point: src/index.ts reads GS_DEBUG with GIT_STACKS_DEBUG alias"
    - "TDD: RED commit (test), GREEN commit (feat) per task"

key-files:
  created:
    - tests/lib/observability.test.ts (extended with describe("observability selectors") block)
    - tests/commands/debug-output.test.ts (extended with selector and GS_DEBUG cases)
    - tests/commands/status-json.test.ts (extended with GS_DEBUG and alias regression cases)
  modified:
    - src/lib/observability.ts - selector parsing, MODULE_ALIASES, structured line formatting
    - src/index.ts - GS_DEBUG bootstrap with GIT_STACKS_DEBUG legacy alias

key-decisions:
  - "GS_DEBUG is the canonical env var; GIT_STACKS_DEBUG=1 is resolved to selector '1' once in src/index.ts and never parsed elsewhere"
  - "Structured fields rendered by embedding formatted string as log message so the existing logtape stderr sink is reused unchanged"
  - "Module short names strip workspace- prefix: workspace-lifecycle -> lifecycle, workspace-git -> git"
  - "Selector token list maps through MODULE_ALIASES then stored in allowedCategories Set for O(1) per-category checks"

patterns-established:
  - "configureObservability(string | undefined): string selector as primary API surface"
  - "isCategoryAllowed(category): single gate function used by both logDebug and timeOperation"
  - "renderModuleName: strips workspace- prefix for human-readable output"
  - "sanitizeMsg: collapses newlines to spaces to keep output single-line"

requirements-completed: [OBSV-03, OBSV-04, OBSV-05]

duration: 5min
completed: 2026-04-05
---

# Phase 75 Plan 02: GS_DEBUG Selector Bootstrap and Structured Stderr Formatting Summary

**GS_DEBUG selector syntax with MODULE_ALIASES, per-category filtering, and structured op=/module=/msg=/ms= stderr lines replacing the unstructured logtape format**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-05T21:46:51Z
- **Completed:** 2026-04-05T21:51:51Z
- **Tasks:** 2 (TDD: 2 RED commits + 1 GREEN commit)
- **Files modified:** 5

## Accomplishments

- `configureObservability` now accepts `string | undefined` selector instead of boolean — `"1"`/`"true"` enable all modules, comma-separated tokens enable specific module categories, `"0"`/`"false"`/`undefined` disable
- `MODULE_ALIASES` map (`lifecycle`, `git`, `status`, `env`, `yaml`) normalizes short CLI tokens to internal `workspace-*` category names used by `logDebug` and `timeOperation`
- Structured one-line stderr output: `[workspace-status] op=getWorkspaceListInfo module=status msg=completed ms=3` — `op=`, `module=`, `msg=` always present; `ms=` appended for timed operations
- `src/index.ts` bootstrap: `GS_DEBUG ?? (GIT_STACKS_DEBUG === "1" ? "1" : undefined)` — single parse point, legacy alias preserved
- `manage` command still calls `silenceObservability()` before TUI starts — no regression
- Regression coverage: unit selector tests, CLI `GS_DEBUG=lifecycle` vs `GS_DEBUG=git` suppression, `GS_DEBUG=1` and `GIT_STACKS_DEBUG=1` JSON stdout purity checks

## Task Commits

1. **Task 1: Add selector and structured-output regression coverage (RED)** — `7760bfe4` (test)
2. **Task 2: Implement GS_DEBUG bootstrap, filtering, and structured stderr (GREEN)** — `6ac13789` (feat)

**Plan metadata:** (pending docs commit)

_Note: TDD tasks — RED commit then GREEN commit. No REFACTOR needed._

## Files Created/Modified

- `src/lib/observability.ts` — Added `MODULE_ALIASES`, `parseSelector`, `isCategoryAllowed`, `renderModuleName`, `sanitizeMsg`; changed `configureObservability` signature to `string | undefined`; structured `op= module= msg= ms=` line rendering in `logDebug` and `timeOperation`
- `src/index.ts` — Changed bootstrap to `GS_DEBUG ?? (GIT_STACKS_DEBUG === "1" ? "1" : undefined)`
- `tests/lib/observability.test.ts` — Added `describe("observability selectors")` block (7 new tests)
- `tests/commands/debug-output.test.ts` — Added `GS_DEBUG=1/true/GIT_STACKS_DEBUG=1` cases, `runClose` helper, `GS_DEBUG=lifecycle` vs `GS_DEBUG=git` suppression tests
- `tests/commands/status-json.test.ts` — Added `GS_DEBUG: "1"` and `GIT_STACKS_DEBUG: "1"` alias regression tests

## Decisions Made

- GS_DEBUG is the canonical env var; the legacy `GIT_STACKS_DEBUG=1` alias is resolved once in `src/index.ts` to selector `"1"` — no distributed env parsing in any other module.
- Structured fields are embedded as a preformatted string in the logtape message so the existing `Bun.stderr.writer` sink is reused without adding a second sink or reformatting layer.
- Short module names strip `workspace-` prefix (`workspace-lifecycle` → `lifecycle`) so CLI output is readable without internal naming noise.
- Selector token list maps through `MODULE_ALIASES` and is stored as `Set<string>` for O(1) per-category gate checks at runtime.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed legacy format assertion in debug-output.test.ts**
- **Found during:** Task 2 (GREEN — implementing structured output)
- **Issue:** The pre-existing test `"emits labeled debug lines to stderr when GIT_STACKS_DEBUG=1"` asserted `stderr.includes("getWorkspaceStatus:")` — matching the old unstructured format. After implementing structured output, the format changed to `op=getWorkspaceStatus ...` so the colon-terminated check no longer matched.
- **Fix:** Updated assertion to check `op=getWorkspaceStatus` or `op=getWorkspaceListInfo`.
- **Files modified:** `tests/commands/debug-output.test.ts`
- **Verification:** `bun test tests/commands/debug-output.test.ts` — 8/8 pass
- **Committed in:** `6ac13789` (GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Necessary update — old assertion tested the format we just replaced. No scope creep.

## Issues Encountered

None beyond the format assertion fix above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- OBSV-03, OBSV-04, OBSV-05 satisfied: `GS_DEBUG` selector syntax, structured stderr, and `GIT_STACKS_DEBUG` alias are all wired and tested.
- Phase 75 complete — DI seams (plan 01) and structured logging (plan 02) both done.
- Full test suite green: 544 unit tests + 48 integration test files.

---
*Phase: 75-di-seams-structured-logging*
*Completed: 2026-04-05*
