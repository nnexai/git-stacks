---
phase: 53-shell-completion-fixes
plan: 03
subsystem: cli
tags: [shell-completion, bash, zsh, fish, commander.js, arity]

# Dependency graph
requires:
  - phase: 53-shell-completion-fixes
    provides: Plans 53-01 and 53-02 — option enum completions and parent flag leakage fixes

provides:
  - Positional arg arity enforcement in bash/zsh/fish completions
  - ArgCompletion variadic flag detection from Commander.js metadata
  - COMP_CWORD position checks for bash single-arg leaf commands
  - _arguments wrapping for zsh single-arg commands without options
  - test (count (commandline -opc)) conditions for fish workspace for loop
  - COMP-01 test suite with focused buildArityTestProgram() fixture

affects: [completion-generator, shell-completion, 53-shell-completion-fixes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Variadic detection: ArgCompletion.variadic? from Commander Argument.variadic property"
    - "Bash arity: COMP_CWORD -eq N wrapping for single-arg leaf commands"
    - "Zsh arity: _arguments positional spec wrapping instead of bare helper calls"
    - "Fish arity: test (count (commandline -opc)) -eq N condition in for loops"

key-files:
  created: []
  modified:
    - src/lib/completion-generator.ts
    - tests/lib/completion-generator.test.ts

key-decisions:
  - "Variadic args detected from Commander's Argument.variadic property; stored as ArgCompletion.variadic?: boolean"
  - "Arity enforcement skipped for variadic args — they must complete indefinitely"
  - "Zsh single-arg commands without options now use _arguments with positional spec for arity enforcement"
  - "Fish position check uses count (commandline -opc) -eq 2 for top-level single-arg commands"

patterns-established:
  - "Bash position guard: wrap dynamic lookup in if [[ ${COMP_CWORD} -eq N ]]; then ... fi"
  - "Zsh position guard: _arguments ': :_helper' or ':: :_helper' instead of bare _helper"
  - "Fish position guard: test (count (commandline -opc)) -eq N condition"

requirements-completed: [COMP-01]

# Metrics
duration: ~7min (pre-committed session)
completed: 2026-04-02
---

# Phase 53 Plan 03: Positional Arg Arity Enforcement Summary

**Bash/zsh/fish completions now enforce positional arg arity: single-arg commands stop offering workspace/repo/template names once the argument slot is filled, using COMP_CWORD, _arguments positional specs, and commandline -opc count checks respectively**

## Performance

- **Duration:** ~7 min (code committed in prior session)
- **Started:** 2026-04-02T04:52:18Z
- **Completed:** 2026-04-02T06:59:06Z
- **Tasks:** 5
- **Files modified:** 2

## Accomplishments

- ArgCompletion interface extended with `variadic?: boolean` flag, populated from Commander's `Argument.variadic` property in `buildNode()`
- Bash generator wraps single-arg dynamic lookups in `if [[ ${COMP_CWORD} -eq 2 ]]; then` — both with-options and no-options paths; subcommand leaves use `${depth + 1}` offset
- Zsh generator wraps single-arg commands without options in `_arguments ':: :_${id}_workspaces'` (or required variant `': :'`) instead of bare helper calls; subcommand leaves also get `_arguments` wrapping
- Fish workspace for loop gains `test (count (commandline -opc)) -eq 2` condition; variadic commands split into a separate unlimited loop; subcommand leaf completions also get position checks
- COMP-01 test suite added with `buildArityTestProgram()` mini fixture; 6 new tests; 4 existing tests updated to assert new position-guarded output format

## Task Commits

Each task was committed atomically:

1. **Task 1: Add variadic flag to ArgCompletion and detect it in buildNode()** - `2a4c93f` (feat)
2. **Task 2: Enforce arity in bash generator for single-arg leaf commands** - `fb48d10` (fix)
3. **Task 3: Enforce arity in zsh generator for single-arg commands without options** - `36b39e0` (fix)
4. **Task 4: Enforce arity in fish generator for single-arg commands** - `b504976` (fix)
5. **Task 5: Add tests for positional arity enforcement (COMP-01)** - `5d6a4d6` (test)

## Files Created/Modified

- `src/lib/completion-generator.ts` — ArgCompletion interface, buildNode() variadic detection, bash/zsh/fish arity enforcement across all single-arg command paths
- `tests/lib/completion-generator.test.ts` — New `describe("positional arity (COMP-01)")` block with 6 tests, 4 updated existing tests for new output format

## Decisions Made

- Variadic detection uses Commander's existing `Argument.variadic` property — no new metadata required
- Arity enforcement uses shell-native mechanisms (COMP_CWORD, _arguments, commandline -opc) rather than wrapper scripts
- Variadic args always bypass arity guards and complete indefinitely (e.g. `run [command...]`)
- Zsh `_arguments` wrapping applies to all four dynamic types: workspace, repo, template, integration

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- COMP-01 requirement satisfied: positional arg arity enforced in all three shells
- All 129 completion generator tests pass; full suite 37/37 integration tests pass
- Phase 53 plans 01-03 all complete; ready to proceed to Phase 54 (env command)

---
*Phase: 53-shell-completion-fixes*
*Completed: 2026-04-02*
