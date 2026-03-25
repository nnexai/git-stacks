---
phase: 34-completion-audit-forge-issue-coverage
plan: 02
subsystem: cli
tags: [shell-completion, audit, bash, zsh, fish, integration, testing]

# Dependency graph
requires:
  - phase: 34-completion-audit-forge-issue-coverage
    plan: 01
    provides: recursive completion generators + 26 DYNAMIC_COMPLETIONS entries
provides:
  - Real-program audit tests verifying all commands have completion coverage
  - Documented audit table covering every command path and its status
affects: [completion-generator]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Subprocess-based audit tests via Bun.spawn against real CLI binary"

key-files:
  created: []
  modified:
    - tests/lib/completion-generator.test.ts

key-decisions:
  - "Subprocess approach (Bun.spawn) for audit tests -- tests real CLI output without importing entry point"
  - "Audit tests verify all three shells (bash/zsh/fish) contain integration providers, subcommands, and leaf commands"

patterns-established:
  - "Real program audit via Bun.spawn(['bun', 'run', 'src/index.ts', 'completion', shell])"

requirements-completed: [COMP-01, COMP-02, COMP-03]

# Metrics
duration: 2min
completed: 2026-03-25
---

# Phase 34 Plan 02: Completion Audit Summary

**Subprocess-based audit tests proving all CLI commands have shell completion coverage across bash/zsh/fish, with documented audit table**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-25T03:32:17Z
- **Completed:** 2026-03-25T03:34:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added 5 real-program audit tests using Bun.spawn subprocess to verify actual CLI completion output
- All 71 tests pass (66 prior + 5 new audit tests)
- Documented complete command-path audit table (see below)

## Task Commits

Each task was committed atomically:

1. **Task 1: Programmatic completion audit test** - `c1850b1` (test)
2. **Task 2: Document audit in SUMMARY** - (this document, committed with metadata)

## Files Created/Modified
- `tests/lib/completion-generator.test.ts` - Added `describe("completion audit - real program")` block with 5 subprocess-based tests

## Decisions Made
- Used `Bun.spawn` subprocess approach to test real program output, avoiding the need to import the entry point (which calls `program.parse()`)
- Tests verify content presence rather than exact format, making them resilient to generator refactoring

## Deviations from Plan

None - plan executed exactly as written.

## Complete Command Path Audit

### DYNAMIC_COMPLETIONS Coverage (all entries verified)

| # | Command Path | Dynamic Type | Status |
|---|---|---|---|
| 1 | `clone` | workspace | COVERED |
| 2 | `open` | workspace | COVERED |
| 3 | `close` | workspace | COVERED |
| 4 | `edit` | workspace | COVERED |
| 5 | `status` | workspace | COVERED |
| 6 | `clean` | workspace | COVERED |
| 7 | `remove` | workspace | COVERED |
| 8 | `merge` | workspace | COVERED |
| 9 | `rename` | workspace | COVERED |
| 10 | `run` | workspace | COVERED |
| 11 | `sync` | workspace | COVERED |
| 12 | `cd` | workspace | COVERED |
| 13 | `completion` | shells | COVERED |
| 14 | `repo.show` | repo | COVERED |
| 15 | `repo.remove` | repo | COVERED |
| 16 | `repo.rename` | repo | COVERED |
| 17 | `template.show` | template | COVERED |
| 18 | `template.edit` | template | COVERED |
| 19 | `template.clone` | template | COVERED |
| 20 | `template.rename` | template | COVERED |
| 21 | `template.remove` | template | COVERED |
| 22 | `message.send` | workspace | COVERED |
| 23 | `message.list` | workspace | COVERED |
| 24 | `message.clear` | workspace | COVERED |
| 25 | `integration.github.open` | workspace | COVERED |
| 26 | `integration.github.pr.create` | workspace | COVERED |
| 27 | `integration.github.pr.open` | workspace | COVERED |
| 28 | `integration.github.pr.status` | workspace | COVERED |
| 29 | `integration.github.issue.link` | workspace | COVERED |
| 30 | `integration.github.issue.unlink` | workspace | COVERED |
| 31 | `integration.github.issue.open` | workspace | COVERED |
| 32 | `integration.gitlab.open` | workspace | COVERED |
| 33 | `integration.gitlab.pr.create` | workspace | COVERED |
| 34 | `integration.gitlab.pr.open` | workspace | COVERED |
| 35 | `integration.gitlab.pr.status` | workspace | COVERED |
| 36 | `integration.gitlab.issue.link` | workspace | COVERED |
| 37 | `integration.gitlab.issue.unlink` | workspace | COVERED |
| 38 | `integration.gitlab.issue.open` | workspace | COVERED |
| 39 | `integration.gitea.open` | workspace | COVERED |
| 40 | `integration.gitea.pr.create` | workspace | COVERED |
| 41 | `integration.gitea.pr.open` | workspace | COVERED |
| 42 | `integration.gitea.pr.status` | workspace | COVERED |
| 43 | `integration.gitea.issue.link` | workspace | COVERED |
| 44 | `integration.gitea.issue.unlink` | workspace | COVERED |
| 45 | `integration.gitea.issue.open` | workspace | COVERED |
| 46 | `integration.jira.issue.link` | workspace | COVERED |
| 47 | `integration.jira.issue.unlink` | workspace | COVERED |
| 48 | `integration.jira.issue.open` | workspace | COVERED |
| 49 | `integration.niri.focus-workspace` | workspace | COVERED |
| 50 | `integration.tmux.attach` | workspace | COVERED |

### Commands Without Dynamic Completion (correct -- no positional args needing completion)

| Command Path | Reason |
|---|---|
| `new` | Name is freeform; `--from` covered by COMMAND_FLAG_COMPLETIONS |
| `list` | No positional args |
| `config` | No positional args |
| `manage` | No positional args |
| `doctor` | No positional args |
| `install` | No positional args (interactive selection) |
| `repo` (parent) | Subcommands handled |
| `repo.add` | Path arg is filesystem (no dynamic) |
| `repo.scan` | Dir arg is filesystem (no dynamic) |
| `repo.list` | No positional args |
| `template` (parent) | Subcommands handled |
| `template.new` | Name is freeform |
| `template.list` | No positional args |
| `message` (parent) | Subcommands handled |
| `integration` (parent) | Subcommands handled |

### 26 Integration DYNAMIC_COMPLETIONS Entries (added in Plan 01)

All 26 entries were added to `src/lib/completion-generator.ts` in plan 01 covering:
- **GitHub** (7): open, pr.create, pr.open, pr.status, issue.link, issue.unlink, issue.open
- **GitLab** (7): open, pr.create, pr.open, pr.status, issue.link, issue.unlink, issue.open
- **Gitea** (7): open, pr.create, pr.open, pr.status, issue.link, issue.unlink, issue.open
- **Jira** (3): issue.link, issue.unlink, issue.open
- **Niri** (1): focus-workspace
- **Tmux** (1): attach

### Shell Output Verification

All three shells generate correct output for depth 3-4 commands:
- **Bash**: Recursive nested `case` statements via `bashCaseBodyRecursive` handle arbitrary depth
- **Zsh**: Recursive `_git_stacks_integration_*` helper functions via `generateZshSubcmdHelperRecursive` with CURRENT/words shifting
- **Fish**: Multi-level `__fish_seen_subcommand_from` chains via `emitFishSubcommands`

**Audit conclusion: 50 DYNAMIC_COMPLETIONS entries, 0 gaps. All commands have verified completion coverage.**

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 34 complete: all shell completion coverage verified with living audit tests
- Ready for next phase in v0.9.0 milestone

---
## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 34-completion-audit-forge-issue-coverage*
*Completed: 2026-03-25*
