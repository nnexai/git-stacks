---
phase: quick
plan: 260318-wrq
subsystem: docs
tags: [readme, documentation, cli, templates, repo-registry]

requires: []
provides:
  - Accurate README matching real CLI surface (Repo Registry, Templates, Workspaces)
affects: []

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - README.md

key-decisions:
  - "Kept same terse, command-focused style — no prose bloat added"
  - "Documented manage as the default (no-args) command"

patterns-established: []

requirements-completed: [readme-update]

duration: 5min
completed: 2026-03-18
---

# Quick Task 260318-wrq Summary

**README rewritten from two-concept Stack/Workspace model to three-concept Repo Registry, Templates, Workspaces with correct config paths and full command reference**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-18T00:00:00Z
- **Completed:** 2026-03-18T00:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Replaced stale "Stack" concept with three current concepts: Repo Registry, Templates, Workspaces
- Updated all config paths from `~/.config/ws/` to `~/.config/git-stacks/`
- Added Repo Registry section with all six subcommands (add, scan, list, show, remove, rename)
- Replaced old Stacks section with Templates section (new, list, show, edit, clone, rename, remove)
- Updated Quick Start to show the repo scan + template new workflow
- Updated Hooks section: renamed to Templates, listed all 6 hook types per entity
- Added `manage` as the default (no-args) command in the Configuration section
- Removed all references to `stack init` and the old `stack` subcommand

## Task Commits

1. **Task 1: Rewrite README.md to match current CLI** - `a623e1c` (docs)

**Plan metadata:** (included in task commit above — single-task plan)

## Files Created/Modified

- `/home/nnex/dev/prj/git-stacks/README.md` - Full rewrite to match current CLI surface

## Decisions Made

- Kept same terse, command-focused formatting style with no added prose or badges
- Documented `manage` at the top of the Configuration section since it is the default command
- Hook lists updated to match CLAUDE.md (6 hooks for templates, 6 for workspaces)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

- README.md exists and contains all required sections
- Commit a623e1c verified in git log
- Verification command returned PASS: template, repo, git-stacks/templates, registry.yml present; stack init and ~/.config/ws/ absent

---
*Phase: quick*
*Completed: 2026-03-18*
