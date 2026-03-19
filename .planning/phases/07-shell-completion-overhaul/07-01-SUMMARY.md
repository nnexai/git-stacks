---
phase: 07-shell-completion-overhaul
plan: 01
subsystem: cli
tags: [shell-completion, bash, zsh, fish, commander]

# Dependency graph
requires:
  - phase: 06-message-store-and-cli
    provides: message send/list/clear command definitions with --workspace and --from flags
provides:
  - OPTION_ENUMS table for fixed-choice flag values (--strategy, --sort) in completion-generator.ts
  - FLAG_COMPLETIONS table for dynamic flag-value completion (--workspace) in completion-generator.ts
  - Prev-word detection in bash, zsh, and fish generators
  - message.send/list/clear subcommand tree coverage in all 3 shells
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OPTION_ENUMS: Record<string, string[]> — static table of flag → enum values, checked in prev-word detection before positional arg completion"
    - "FLAG_COMPLETIONS: Record<string, DynamicCompletion> — flag → dynamic lookup type, reuses existing workspace/repo/template helpers for flag values"
    - "zshOptionSpec(opt, id) helper — shared function for OPTION_ENUMS/FLAG_COMPLETIONS-aware _arguments spec generation in zsh"

key-files:
  created: []
  modified:
    - src/lib/completion-generator.ts
    - tests/lib/completion-generator.test.ts

key-decisions:
  - "OPTION_ENUMS static table (not Commander .choices()) — avoids unintended runtime validation behavior change"
  - "FLAG_COMPLETIONS is separate from OPTION_ENUMS — different lookup strategy (dynamic entity names vs. static strings)"
  - "Prev-word detection runs before top-level case dispatch in bash — OPTION_ENUMS/FLAG_COMPLETIONS take precedence over positional completion"
  - "zshOptionSpec() extracted as shared helper to avoid duplication between zshCaseBody() and generateZshSubcmdHelper()"
  - "Commands with only OPTION_ENUMS options (list --sort) emit _arguments block in zsh even without positional dynamic completion"

patterns-established:
  - "Prev-word detection pattern: check OPTION_ENUMS before FLAG_COMPLETIONS before positional arg completion"
  - "TDD: RED commit (data tables + failing tests) then GREEN commit (generator implementation)"

requirements-completed: [CMPL-01, CMPL-02, CMPL-03, CMPL-04, CMPL-05, CMPL-06]

# Metrics
duration: 3min
completed: 2026-03-19
---

# Phase 7 Plan 1: Shell Completion Overhaul Summary

**OPTION_ENUMS and FLAG_COMPLETIONS tables with prev-word detection in bash/zsh/fish generators cover --strategy, --sort, --workspace, and the message send|list|clear subcommand tree**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-19T18:28:21Z
- **Completed:** 2026-03-19T18:31:57Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added OPTION_ENUMS table (`--strategy → [rebase, merge]`, `--sort → [date, name, status]`) and FLAG_COMPLETIONS table (`--workspace → "workspace"`) to completion-generator.ts
- Implemented prev-word detection in bash generator: `case "$prev" in` block before top-level dispatch handles enum flags and dynamic flag values
- Updated zsh generator with `zshOptionSpec()` helper for `_arguments` specs that embed `:(values)` or `:name:_helper` for OPTION_ENUMS/FLAG_COMPLETIONS options; added handling for options-only commands (list --sort)
- Updated `generateZshSubcmdHelper()` to emit `_arguments` with full option specs for message.send/list/clear subcommands
- Added fish OPTION_ENUMS (`-ra 'values'`) and FLAG_COMPLETIONS (`-ra "(helper)"`) complete directives; added flag directives for nested subcommands (message.send/list/clear --workspace/--from)
- Added message.send/list/clear to DYNAMIC_COMPLETIONS for subcommand tree discovery
- All 45 completion-generator tests pass, full suite 174 pass, typecheck clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Add data tables, extend test program, and write failing tests** - `ff0c687` (test)
2. **Task 2: Implement prev-word detection in all three shell generators** - `6192e7c` (feat)

**Plan metadata:** (pending docs commit)

_Note: TDD tasks — Task 1 is RED (failing tests), Task 2 is GREEN (implementation)_

## Files Created/Modified
- `src/lib/completion-generator.ts` - Added OPTION_ENUMS/FLAG_COMPLETIONS tables, prev-word detection in bash, zsh, fish generators; extracted zshOptionSpec() helper
- `tests/lib/completion-generator.test.ts` - Extended buildTestProgram() with sync --strategy, list --sort, message subcommand group; added 15 new test cases across 3 describe blocks

## Decisions Made
- OPTION_ENUMS as a static module-level table (not Commander `.choices()`) per locked Phase 7 decision — avoids unintended runtime validation behavior change
- Commands with OPTION_ENUMS options but no positional dynamic completion (like `list --sort`) now emit `_arguments` in zsh — necessary for `--sort` to get `(date name status)` completion
- Extracted `zshOptionSpec()` as a shared helper instead of duplicating the OPTION_ENUMS/FLAG_COMPLETIONS check in both `zshCaseBody()` and `generateZshSubcmdHelper()`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None — the implementation followed the plan precisely. The only adjustments were minor (zsh `list` command needed an additional branch for options-only commands, which was a natural extension of the design).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Shell completion surface is now complete: all commands, subcommands, fixed-choice flags, and dynamic entity names have tab completion across bash/zsh/fish
- Phase 7 (single plan) complete — ready for Phase 8

---
*Phase: 07-shell-completion-overhaul*
*Completed: 2026-03-19*
