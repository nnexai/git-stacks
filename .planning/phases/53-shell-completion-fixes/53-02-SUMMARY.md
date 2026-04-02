---
phase: 53-shell-completion-fixes
plan: "02"
subsystem: cli
tags: [shell-completion, bash, fish, commander, option-enums]

requires:
  - phase: 53-01
    provides: OptionInfo.enumValues extraction from Commander .choices()

provides:
  - Per-command scoped bash enum completions (no global OPTION_ENUMS block)
  - Per-command scoped fish enum completions (merged into flags loop)
  - COMP-03 leakage prevention tests

affects: [53-03, completion-generator]

tech-stack:
  added: []
  patterns:
    - "Bash enum completions emitted inside per-command case bodies, not globally"
    - "Fish enum completions inline with per-command flag directives using -ra"

key-files:
  created: []
  modified:
    - src/lib/completion-generator.ts
    - tests/lib/completion-generator.test.ts

key-decisions:
  - "OPTION_ENUMS dict retained for zsh fallback (zshOptionSpec uses opt.enumValues ?? OPTION_ENUMS[flag]); removed only from bash global and fish global sections"
  - "Fish auto-detected enum section removed and merged into per-command flags loop to avoid duplicate complete directives"
  - "bashCaseBody() updated to use OPTION_ENUMS[o.long] fallback in filters so dict-only entries (--strategy, --sort) still get per-command handling"

requirements-completed: [COMP-03]

duration: 8min
completed: 2026-04-02
---

# Phase 53 Plan 02: Parent Flag Leakage Fix Summary

**Eliminated cross-command option enum leakage by scoping bash/fish enum completions to per-command dispatch blocks, removing the global OPTION_ENUMS `case "$prev"` pattern**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-02T04:42:00Z
- **Completed:** 2026-04-02T04:50:41Z
- **Tasks:** 4
- **Files modified:** 2

## Accomplishments
- Removed global `case "$prev"` OPTION_ENUMS block from `generateBash()` — enum values no longer leak to all commands
- Updated `bashCaseBody()` to include `OPTION_ENUMS[o.long]` fallback so dict-based options get per-command case bodies
- Removed global fish OPTION_ENUMS section and auto-detected section; merged enum handling inline with per-command flags using `-ra`
- Updated `emitFishSubcommands()` to scope enum values per-subcommand
- Added 6 COMP-03 leakage tests using focused `buildLeakageTestProgram()`
- Fixed stale "list has no case branch" test to match new behavior

## Task Commits

1. **Task 1: Remove global OPTION_ENUMS case block from bash generator** - `6ef96b3` (fix)
2. **Task 2: Scope fish option enum completions per-command using OptionInfo** - `8bf7b9a` (fix)
3. **Task 3: Add tests for parent flag leakage prevention (COMP-03)** - `a90c1cd` (test)
4. **Task 4: Update existing OPTION_ENUMS tests for new per-command scoping** - `cb02c79` (test)

## Files Created/Modified
- `src/lib/completion-generator.ts` - Removed global OPTION_ENUMS blocks from bash/fish; added per-command scoping
- `tests/lib/completion-generator.test.ts` - Added COMP-03 leakage tests; updated "list has no case branch" test

## Decisions Made
- Kept `OPTION_ENUMS` dict in place — still used by zsh's `zshOptionSpec()` as `opt.enumValues ?? OPTION_ENUMS[flag]`. Only bash and fish global sections were removed.
- Merged the fish "Auto-detected option enum values" section (added in Plan 01) into the per-command flags loop to eliminate duplicate `complete` directives

## Deviations from Plan
None — plan executed exactly as written. The current code already had the per-command handling scaffolding in `bashCaseBody()` from prior work; Task 1 only needed to add the `OPTION_ENUMS[o.long]` fallback and remove the global block.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Bash and fish completions no longer leak option enums across commands
- Ready for Plan 03: zsh completion fixes or remaining Phase 53 work
- All 122 completion tests pass; full test suite passes

---
*Phase: 53-shell-completion-fixes*
*Completed: 2026-04-02*
