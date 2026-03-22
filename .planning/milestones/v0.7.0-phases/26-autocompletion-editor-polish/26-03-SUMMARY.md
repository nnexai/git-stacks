---
phase: 26-autocompletion-editor-polish
plan: 03
subsystem: workspace-lifecycle
tags: [workspace-ops, clean, remove, merge, folder-deletion, malformed-yaml, tdd]

# Dependency graph
requires:
  - phase: 25-dedicated-lifecycle-phases
    provides: "_executeClean inner function, cleanWorkspace/removeWorkspace/mergeWorkspace public signatures with cascade"
provides:
  - "deleteFolder opt in _executeClean and cleanWorkspace — removes tasks/{name}/ after worktree removal"
  - "removeWorkspace always deletes folder (D-11) via deleteFolder:true in _executeClean call"
  - "mergeWorkspace always deletes folder (D-11/D-13) via deleteFolder:true in _executeClean call"
  - "removeWorkspace malformed YAML fallback — --force deletes folder + YAML without parse (D-12)"
  - "CLI clean command: second confirmation prompt for folder deletion (D-09), --force skips it (D-10)"
  - "Lifecycle hierarchy enforced: close < clean (worktrees + optional folder) < remove (everything)"
affects:
  - workspace-ops
  - commands/workspace
  - tests/workspace-ops

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "deleteFolder opt pattern: _executeClean handles folder deletion after post_clean hooks as last step"
    - "Malformed YAML fallback: try/catch around readWorkspace, early return with name-based rmSync when workspace is null"
    - "Two-phase CLI clean: first cleanWorkspace call removes worktrees, second p.confirm handles folder"

key-files:
  created: []
  modified:
    - src/lib/workspace-ops.ts
    - src/commands/workspace.ts
    - tests/lib/workspace-ops.test.ts

key-decisions:
  - "deleteFolder handled in _executeClean as very last step after post_clean hooks — worktrees must be deregistered from git before folder is deleted"
  - "removeWorkspace --force malformed YAML fallback reads config separately (readGlobalConfig always safe), skips all hook execution"
  - "CLI clean command: folder deletion handled in command layer after cleanWorkspace returns — cleaner separation of concerns than threading deleteFolder through all opts"
  - "Dynamic import of fs in commands/workspace.ts for rmSync/existsSync to keep command file lightweight"

patterns-established:
  - "Two-phase clean CLI: first cleanWorkspace (worktrees), then separate folder-deletion prompt in command layer"
  - "Malformed YAML fallback: workspaceExists() guards existence, try/catch on readWorkspace, null workspace = fallback path"

requirements-completed: [POLISH-07, POLISH-08, POLISH-09, POLISH-10]

# Metrics
duration: 4min
completed: 2026-03-22
---

# Phase 26 Plan 03: Folder Deletion and Malformed YAML Fallback Summary

**cleanWorkspace with deleteFolder opt removes tasks/{name}/ after worktree removal; removeWorkspace/mergeWorkspace always delete folder; removeWorkspace --force handles malformed YAML via name-based rmSync fallback**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-22T16:19:51Z
- **Completed:** 2026-03-22T16:23:21Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `_executeClean` accepts `deleteFolder?: boolean` — when true, deletes `tasks/{name}/` as last step after all hooks
- `cleanWorkspace` passes `deleteFolder` through to `_executeClean` and emits dry-run message when set
- `removeWorkspace` adds try/catch around `readWorkspace` — malformed YAML + `--force` falls back to name-based `rmSync` (D-12)
- `removeWorkspace` passes `deleteFolder: true` to `_executeClean` (D-11)
- `mergeWorkspace` passes `deleteFolder: true` to `_executeClean` (D-11/D-13)
- CLI `clean <name>` action: after worktrees removed, shows second `p.confirm` "Delete workspace folder?" (D-09)
- CLI `clean <name> --force` skips second confirmation and deletes folder directly (D-10)
- CLI `clean <name> --dry-run` shows `[dry-run] would delete folder: tasks/{name}/`
- 6 new tests covering all new behavior; full test suite 618 pass 0 fail

## Task Commits

1. **Task 1: Add folder deletion to _executeClean and malformed YAML fallback to removeWorkspace** - `dee5901` (feat)
2. **Task 2: Add second confirmation prompt for folder deletion in CLI clean command** - `72225e7` (feat)

## Files Created/Modified

- `src/lib/workspace-ops.ts` — Added `rmSync` to imports; `deleteFolder` opt in `_executeClean` and `cleanWorkspace`; malformed YAML fallback in `removeWorkspace`; `deleteFolder: true` in `removeWorkspace` and `mergeWorkspace` calls to `_executeClean`
- `src/commands/workspace.ts` — Two-phase clean action: first `cleanWorkspace` without `deleteFolder`, then second `p.confirm` for folder; `--force` deletes without prompt; `--dry-run` shows folder info
- `tests/lib/workspace-ops.test.ts` — 6 new tests: `deleteFolder:true` removes folder, without `deleteFolder` leaves folder, dry-run mentions folder, `removeWorkspace` deletes folder, malformed YAML `--force` succeeds, malformed YAML without `--force` errors

## Decisions Made

- `deleteFolder` opt handled in `_executeClean` as the very last step after `post_clean` hooks fire — git worktree deregistration must happen before the directory is deleted
- `removeWorkspace` malformed YAML fallback reads `readGlobalConfig()` separately (always safe even when workspace YAML is corrupt); skips all hook execution since workspace parse failed
- CLI command layer handles folder deletion separately from `cleanWorkspace` — cleaner separation where `cleanWorkspace` handles worktrees, command layer handles the additional folder prompt
- Dynamic `import("fs")` in `commands/workspace.ts` for `rmSync`/`existsSync`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Lifecycle hierarchy fully enforced: close (sessions only) < clean (worktrees + optional folder) < remove (everything + folder + YAML)
- `removeWorkspace --force` now resilient to malformed workspace YAML
- Phase 26 complete; all POLISH requirements POLISH-07 through POLISH-10 satisfied

---
*Phase: 26-autocompletion-editor-polish*
*Completed: 2026-03-22*
