---
phase: 26-autocompletion-editor-polish
plan: 02
subsystem: cli
tags: [yaml, editor, workspace-ops, commander, zod-validation]

requires:
  - phase: 26-01
    provides: completion generator and OPTION_ENUMS framework

provides:
  - openYamlInEditor shared helper in workspace-ops.ts
  - editTemplateYaml, editGlobalConfigYaml, editRegistryYaml functions
  - --yaml flag on edit, template edit, config, and repo commands

affects: [cli-commands, workspace-ops, power-users]

tech-stack:
  added: []
  patterns:
    - "editYaml pattern: return { path, validate } — schema validated after editor exits"
    - "openYamlInEditor: spawns $EDITOR with inherited stdio, no path printed (D-07)"

key-files:
  created: []
  modified:
    - src/lib/workspace-ops.ts
    - src/commands/workspace.ts
    - src/commands/template.ts
    - src/commands/config.ts
    - src/commands/repo.ts
    - tests/lib/workspace-ops.test.ts

key-decisions:
  - "No file path printed before opening editor per D-07 — just spawn and wait"
  - "openYamlInEditor uses process.env.VISUAL || process.env.EDITOR || vi fallback"
  - "repo --yaml added as action on parent command (not a subcommand) — consistent with other commands"

patterns-established:
  - "editYaml pattern: function returns { path, validate() } — caller controls when to open and validate"
  - "openYamlInEditor is the shared entry point — all 4 commands use the same helper"

requirements-completed: [POLISH-04, POLISH-05, POLISH-06]

duration: 2min
completed: 2026-03-22
---

# Phase 26 Plan 02: --yaml flag on 4 commands with shared openYamlInEditor helper

**$EDITOR integration for direct YAML editing on workspace, template, config, and repo commands — validates against Zod schema after save**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-22T15:13:50Z
- **Completed:** 2026-03-22T15:16:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added `openYamlInEditor` async helper that spawns `$EDITOR` with inherited stdio and validates the file with the correct Zod schema after the editor exits, printing a warning on errors
- Added `editTemplateYaml`, `editGlobalConfigYaml`, and `editRegistryYaml` functions following the established `editWorkspaceYaml` pattern — each returns `{ path, validate }`
- Wired `--yaml` flag into all 4 CLI commands: `git-stacks edit <name> --yaml`, `git-stacks template edit <name> --yaml`, `git-stacks config --yaml`, `git-stacks repo --yaml`
- Added 3 unit tests covering path resolution and Zod validation for the new helper functions; 612 tests pass with 0 failures

## Task Commits

1. **Task 1: Add openYamlInEditor helper and 3 new editYaml functions** - `89bcec9` (feat)
2. **Task 2: Wire --yaml flag into edit, template edit, config, and repo commands** - `4ced4fb` (feat)

## Files Created/Modified

- `src/lib/workspace-ops.ts` - Added openYamlInEditor, editTemplateYaml, editGlobalConfigYaml, editRegistryYaml; updated imports for TemplateSchema, GlobalConfigSchema, RepoRegistrySchema, templatePath, GLOBAL_CONFIG_FILE, REGISTRY_FILE
- `src/commands/workspace.ts` - Added --yaml option and editWorkspaceYaml+openYamlInEditor imports to edit command
- `src/commands/template.ts` - Added --yaml option and editTemplateYaml+openYamlInEditor imports to template edit command
- `src/commands/config.ts` - Added --yaml option and editGlobalConfigYaml+openYamlInEditor imports to config command
- `src/commands/repo.ts` - Added --yaml option and editRegistryYaml+openYamlInEditor imports to repo parent command
- `tests/lib/workspace-ops.test.ts` - Added describe("editYaml helpers") with 3 tests for editTemplateYaml, editGlobalConfigYaml, editRegistryYaml

## Decisions Made

- No file path is printed before opening the editor (D-07) — `openYamlInEditor` simply spawns the process without any console.log
- `VISUAL` env var checked first, then `EDITOR`, then falls back to `vi` — standard Unix convention
- For `repo --yaml`, added action handler on the parent `repoCommand` object. When `--yaml` is not passed and no subcommand is matched, falls through to `repoCommand.help()` preserving existing behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

One minor fix required: the `await import(...)` for edit YAML functions was initially placed inside the `describe()` block, but Bun requires top-level `await` to be at module scope (not inside describe callbacks). Moved the dynamic import to module level alongside the other cache-busting imports.

## Next Phase Readiness

- `--yaml` flag available on all 4 targeted commands; power users can open raw YAML in any `$EDITOR`
- Post-edit Zod validation warns without blocking workflow
- Plan 03 (if any) in phase 26 can proceed independently

---
*Phase: 26-autocompletion-editor-polish*
*Completed: 2026-03-22*

## Self-Check: PASSED

- All 6 required files exist on disk
- Both task commits verified in git history (89bcec9, 4ced4fb)
