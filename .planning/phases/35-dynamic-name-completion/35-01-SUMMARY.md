---
phase: 35-dynamic-name-completion
plan: 01
subsystem: testing
tags: [completion, shell, bash, zsh, fish, grep, yaml]

# Dependency graph
requires: []
provides:
  - "YAML name-field extraction in bash/zsh/fish completion helpers for workspaces and templates"
  - "Unit tests verifying grep -h '^name:' pattern in all three shells"
  - "Integration tests verifying real CLI completion output uses name-field extraction"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shell completion helpers use grep -h '^name:' on *.yml files instead of ls+sed on filenames"
    - "Zsh helpers declare local variable before array assignment (local workspaces; workspaces=(...))"

key-files:
  created: []
  modified:
    - src/lib/completion-generator.ts
    - tests/lib/completion-generator.test.ts

key-decisions:
  - "grep -h '^name:' with quoted dir variable and /*.yml glob is the canonical extraction pattern for all three shells"
  - "Test assertions use shell-specific substring patterns: bash uses full path with quotes, zsh/fish use variable name ($ws_dir, $templates_dir)"

patterns-established:
  - "YAML name-field extraction: grep -h '^name:' \"$DIR\"/*.yml 2>/dev/null | sed 's/^name:[[:space:]]*//' — identical pattern for bash/zsh/fish"

requirements-completed:
  - IDEN-04
  - COMP-04
  - COMP-05

# Metrics
duration: 5min
completed: 2026-03-25
---

# Phase 35 Plan 01: Dynamic Name Completion Summary

**Shell completion helpers for workspaces and templates now extract names from YAML `name:` fields via `grep -h '^name:'` instead of listing filenames with `ls`/glob**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-25T13:28:36Z
- **Completed:** 2026-03-25T13:33:37Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Replaced `ls "$HOME/.config/git-stacks/workspaces"` + `sed 's/.yml$//'` with `grep -h '^name:'` on `*.yml` files in bash completion
- Replaced zsh `*.yml(N:t:r)` glob expansion with `grep -h '^name:'` for workspaces and templates helpers
- Replaced fish `ls $ws_dir | sed 's/.yml$//'` with `grep -h '^name:'` for workspaces and templates helpers
- Repo completion unchanged in all three shells (already used grep on registry.yml)
- 12 new tests: 9 unit tests (3 per shell: workspace/template/repo) + 3 real-CLI audit tests
- All 83 total completion-generator tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — failing tests for YAML name-field extraction** - `46405b1` (test)
2. **Task 2: GREEN — switch workspace/template completion to YAML name-field extraction** - `68eeffd` (feat)
3. **Task 3: real-CLI audit tests for YAML name-field completion** - `58507c4` (test)

_Note: TDD tasks — RED commit added failing tests; GREEN commit updated implementation and corrected test assertions to match actual output format_

## Files Created/Modified

- `/home/nnex/dev/prj/git-stacks/src/lib/completion-generator.ts` — Updated `bashDynamicLookup()`, `generateZsh()` helpers, and `generateFish()` helpers to extract workspace/template names from YAML `name:` field
- `/home/nnex/dev/prj/git-stacks/tests/lib/completion-generator.test.ts` — Added `describe("dynamic name completion - YAML name field extraction")` (9 unit tests) and `describe("completion audit - YAML name-field extraction")` (3 real-CLI integration tests)

## Decisions Made

- Used `grep -h '^name:' "$DIR"/*.yml 2>/dev/null` in all three shells — `-h` suppresses filename prefixes, `2>/dev/null` handles empty/missing directories
- Zsh helpers declare local variable first (`local workspaces`) then assign via subshell `workspaces=($(grep ...))` — matches zsh best practice
- Test assertions use shell-specific substrings: bash full-path pattern `git-stacks/workspaces"/*.yml`, zsh/fish variable pattern `"$ws_dir"/*.yml` — because zsh/fish use local variable names rather than full paths in the grep call

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test assertions corrected to match actual output format**
- **Found during:** Task 2 (GREEN — implementing name-field extraction)
- **Issue:** Task 1 wrote tests expecting `.config/git-stacks/workspaces/*.yml` as substring, but actual generated output has `"$HOME/.config/git-stacks/workspaces"/*.yml` (bash) or `"$ws_dir"/*.yml` (zsh/fish) — the `"` between directory and `/*.yml` breaks the expected substring
- **Fix:** Updated test assertions to match actual generated format: bash uses `'git-stacks/workspaces"/*.yml'`, zsh/fish use `'"$ws_dir"/*.yml'`
- **Files modified:** tests/lib/completion-generator.test.ts
- **Verification:** All 80 then 83 tests pass
- **Committed in:** 68eeffd (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — test assertion mismatch discovered during GREEN)
**Impact on plan:** The test correction was necessary for accurate assertions. The generated output format is correct shell syntax; the tests needed to verify the actual generated substrings.

## Issues Encountered

- None — implementation was straightforward substitution in three locations per shell

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 35 plan 01 complete — workspace and template completion helpers in all three shells now use YAML name-field extraction
- No blockers for subsequent plans

---
*Phase: 35-dynamic-name-completion*
*Completed: 2026-03-25*
