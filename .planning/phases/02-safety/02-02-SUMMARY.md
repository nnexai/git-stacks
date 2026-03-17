---
phase: 02-safety
plan: 02
subsystem: safety
tags: [dry-run, force, prompt-gating, workspace-commands, cli]

# Dependency graph
requires:
  - phase: 02-safety
    plan: 01
    provides: dryRun option on all four ops functions (remove, clean, merge, rename)
provides:
  - --dry-run flag registered on all four destructive commands (remove, clean, merge, rename)
  - --force flag registered on rename (was missing)
  - p.confirm gated with !opts.force && !opts.dryRun on all four commands
  - rename command gains confirmation prompt "Rename 'X' -> 'Y'?" for first time
  - opts passed through to ops functions so dryRun propagates correctly
affects:
  - Any future plan touching workspace command handlers
  - Shell completion generation (new flags auto-appear in completions)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Consistent flag pattern across all destructive commands — .option("--force") + .option("--dry-run")
    - Prompt gate: if (!opts.force && !opts.dryRun) { p.confirm ... } before ops call
    - Opts object forwarded whole to ops function so new fields propagate without call-site changes

key-files:
  created: []
  modified:
    - src/commands/workspace.ts

key-decisions:
  - "--gone + --dry-run deferred per CONTEXT.md — the --gone path in clean gets --force prompt gating but not --dry-run support"
  - "rename gains p.confirm with arrow character (→) in message to match UI conventions established by other commands"
  - "opts type annotations added to all four action handler signatures for TypeScript correctness"

patterns-established:
  - "Destructive command pattern: .option('--force') + .option('--dry-run') + if (!opts.force && !opts.dryRun) { p.confirm }"
  - "renameWorkspace called with 4 args: (oldName, newName, opts, onProgress) — opts is always passed as third arg"

requirements-completed: [SAFE-02, SAFE-03]

# Metrics
duration: 10min
completed: 2026-03-18
---

# Phase 02 Plan 02: Command Layer --dry-run and --force Summary

**--dry-run and --force flags wired into all four destructive CLI commands (remove, clean, merge, rename) with consistent p.confirm gating**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-18T19:08:00Z
- **Completed:** 2026-03-18T19:18:00Z
- **Tasks:** 2 (1 auto + 1 human-verify checkpoint)
- **Files modified:** 1

## Accomplishments
- Added `--dry-run` option to remove, clean, merge, and rename commands
- Added `--force` option to rename (was previously missing)
- Gated p.confirm with `if (!opts.force && !opts.dryRun)` uniformly across all four commands
- Added confirmation prompt to rename: "Rename 'X' → 'Y'?" (did not previously have one)
- Updated renameWorkspace call site to pass opts as third argument (4-arg call)
- Interactive verification confirmed all prompts, --force bypass, --dry-run output, and help text

## Task Commits

Each task was committed atomically:

1. **Task 1: Add --dry-run flags and fix prompt gating for all four commands** - `f325659` (feat)
2. **Task 2: Human-verify checkpoint** - approved by user (no code commit)

## Files Created/Modified
- `src/commands/workspace.ts` - --dry-run on remove/clean/merge/rename; --force on rename; p.confirm gated by !opts.force && !opts.dryRun; rename gets new confirmation prompt; renameWorkspace call updated to 4 args

## Decisions Made
- `--gone` combined with `--dry-run` deferred per CONTEXT.md decision — the `--gone` path in clean is lower priority and more complex; deferred to a future plan if needed
- rename's new confirmation prompt uses the arrow character `→` to match visual conventions
- opts type annotations added inline to action handler signatures for TypeScript strictness

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SAFE-02 and SAFE-03 requirements complete — confirmation prompts and consistent --force behavior now cover all destructive commands
- The ops layer (Plan 01) and command layer (Plan 02) together deliver the full safety story for Phase 02
- No blockers for any remaining Phase 02 plans

## Self-Check: PASSED

- `f325659` commit verified in git log
- `src/commands/workspace.ts` modified with all required changes
- `bun test tests/` — 140 tests pass, 0 fail

---
*Phase: 02-safety*
*Completed: 2026-03-18*
