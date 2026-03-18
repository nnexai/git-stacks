---
phase: 03-design-and-conditional-implementation
plan: "03"
subsystem: cli
tags: [commander, clack-prompts, templates, tui, yaml]

# Dependency graph
requires:
  - phase: 03-01
    provides: Template schema (TemplateSchema, TemplateRepo), YAML I/O functions (templatePath, templateExists, readTemplate, writeTemplate, listTemplates, expandBranchPattern), RepoRegistry functions
  - phase: 03-02
    provides: Repo registry TUI patterns (pickReposFromRegistry pattern, safeText/cancel usage, p.isCancel checks)
provides:
  - git-stacks template new|list|show|edit|clone|rename|remove CLI subcommands
  - src/commands/template.ts — templateCommand (Commander.js subcommand group)
  - src/tui/template-wizard.ts — runTemplateNew, runTemplateEdit interactive TUI
affects:
  - phase-04 (workspace-from-template integration will consume templateCommand and readTemplate)
  - completion generator (template subcommands will appear in shell completions automatically)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Template command pattern: Command group with 7 subcommands (new/list/show/edit/clone/rename/remove)"
    - "Repo picker with fallback: plain multiselect for <= 20 registry entries, filter-then-multiselect for > 20"
    - "Per-repo config prompts: mode (worktree/trunk), base_branch, branch_pattern with <workspace-name> placeholder"
    - "Edit wizard: action selector (repos/description/done) preserving existing config for unchanged repos"

key-files:
  created:
    - src/commands/template.ts
    - src/tui/template-wizard.ts
  modified:
    - src/index.ts

key-decisions:
  - "templateCommand registered between repoCommand and createCompletionCommand so completions auto-include template subcommands"
  - "runTemplateNew checks registry first and exits early if empty — prevents confusing empty picker"
  - "pickReposFromRegistry switches picker strategy at 20-entry threshold — consistent with CONTEXT.md searchable picker guidance"
  - "base_branch only stored in TemplateRepo when it differs from registry default_branch — keeps YAML clean"

patterns-established:
  - "Template command: imports wizard for interactive flow, handles non-interactive flags (--force) inline"
  - "Wizard: p.isCancel() checked after every await p.*() call — consistent with repo-wizard.ts pattern"

requirements-completed:
  - TMPL-01
  - TMPL-02
  - TMPL-03

# Metrics
duration: 5min
completed: 2026-03-18
---

# Phase 03 Plan 03: Template CLI Commands Summary

**Template `new|list|show|edit|clone|rename|remove` CLI with interactive TUI wizard supporting repo picker, per-repo branch patterns, and optional hooks**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-18T18:43:50Z
- **Completed:** 2026-03-18T18:48:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created `src/commands/template.ts` with all 7 template subcommands following repo.ts patterns (error handling, --force flag on remove)
- Created `src/tui/template-wizard.ts` with `runTemplateNew` and `runTemplateEdit` supporting repo selection from registry, per-repo mode/branch/pattern prompts, and optional post_open hooks
- Registered `templateCommand` in `src/index.ts` alongside `repoCommand`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create template command file and register in index.ts** - `cb3d5d8` (feat)
2. **Task 2: Create template TUI wizard for interactive new and edit** - `84b8bdd` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `src/commands/template.ts` — Template CLI command group (new/list/show/edit/clone/rename/remove)
- `src/tui/template-wizard.ts` — Interactive TUI wizard (runTemplateNew, runTemplateEdit)
- `src/index.ts` — Added templateCommand import and registration

## Decisions Made
- `templateCommand` placed after `repoCommand` and before `createCompletionCommand` so template subcommands are auto-included in shell completions.
- `runTemplateNew` checks registry emptiness at the top and exits early, avoiding an empty repo picker.
- `pickReposFromRegistry` switches from plain multiselect to filter+multiselect at the 20-entry threshold per CONTEXT.md guidance.
- `base_branch` only written to TemplateRepo YAML when it differs from the registry `default_branch` to keep template files clean.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Template CLI and TUI are ready for use
- Phase 04 can consume `readTemplate()` and `templateCommand` to implement `git-stacks new --template <name>` workspace creation from templates
- All TMPL-01, TMPL-02, TMPL-03 requirements fulfilled

---
*Phase: 03-design-and-conditional-implementation*
*Completed: 2026-03-18*

## Self-Check: PASSED

- src/commands/template.ts: FOUND
- src/tui/template-wizard.ts: FOUND
- 03-03-SUMMARY.md: FOUND
- Commit cb3d5d8: FOUND
- Commit 84b8bdd: FOUND
