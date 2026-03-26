---
phase: 40-template-composition
plan: 02
subsystem: cli
tags: [commander, wizard, composition, template]

requires:
  - phase: 40-template-composition
    provides: composeTemplates() function, TemplateSchema includes field
provides:
  - CLI --template repeatable flag for ad-hoc template composition
  - Automatic includes resolution in all three wizard creation paths
affects: [workspace-wizard, workspace-clone, template-wizard]

tech-stack:
  added: []
  patterns:
    - Commander.js value accumulator for repeatable flags

key-files:
  created: []
  modified:
    - src/commands/workspace.ts
    - src/tui/workspace-wizard.ts
    - tests/lib/composition.test.ts

key-decisions:
  - "templateNames parameter is optional third arg on runWorkspaceNew to preserve backward compat"
  - "--from and --template mutual exclusivity checked at command level before entering wizard"

patterns-established:
  - "All three creation paths (--template, --from, interactive) resolve includes via composeTemplates()"

requirements-completed: [COMP-01, COMP-02]

duration: 6min
completed: 2026-03-26
---

# Plan 40-02: CLI and Wizard Composition Wiring Summary

**Repeatable --template flag on git-stacks new for ad-hoc composition; all wizard paths auto-resolve template includes**

## Performance

- **Duration:** 6 min
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `--template <name>` repeatable flag to `git-stacks new` using Commander.js accumulator pattern
- Wired `composeTemplates()` into all three creation paths: --template (multi-template), --from (single template with includes), interactive wizard (template selection with includes)
- Added mutual exclusivity check for --from and --template
- 4 new integration tests verifying multi-template composition, includes resolution, mode precedence, and function signature

## Task Commits

1. **Task 1: CLI flag + wizard wiring** - `b2d98ba` (feat)
2. **Task 2: Integration tests** - `489e098` (test)

## Files Created/Modified
- `src/commands/workspace.ts` - Added --template option with accumulator, mutual exclusivity check, passes templateNames to wizard
- `src/tui/workspace-wizard.ts` - Added composeTemplates import, templateNames parameter, three composition code paths
- `tests/lib/composition.test.ts` - Added "CLI multi-template integration" describe block with 4 tests

## Decisions Made
- templateNames passed as optional third parameter to runWorkspaceNew() for backward compatibility
- Mutual exclusivity of --from and --template enforced at command level (process.exit(1) before entering wizard)

## Deviations from Plan

None - plan executed as specified.

## Issues Encountered
None

## Next Phase Readiness
- Template composition is fully wired end-to-end
- Ready for verification

---
*Phase: 40-template-composition*
*Completed: 2026-03-26*
